/**
 * HORIZON CLI — Persistent Queue
 * Jobs sobrevivem a reinícios/crashes. Até 3 tentativas antes de virar "failed".
 */

import fs from 'fs';
import path from 'path';
import { getAppDir } from './config.js';
import { log } from './logger.js';

const QUEUE_FILE = path.join(getAppDir(), 'queue.json');
const MAX_ATTEMPTS = 3;

function emptyState() {
    return { pending: [], completed: [], failed: [] };
}

function load() {
    if (!fs.existsSync(QUEUE_FILE)) return emptyState();
    try {
        const raw = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf-8'));
        return {
            pending: Array.isArray(raw.pending) ? raw.pending : [],
            completed: Array.isArray(raw.completed) ? raw.completed : [],
            failed: Array.isArray(raw.failed) ? raw.failed : [],
        };
    } catch {
        return emptyState();
    }
}

function save(state) {
    // mantém no máx 200 itens em cada "histórico" pra não crescer sem limite
    state.completed = state.completed.slice(-200);
    state.failed = state.failed.slice(-200);
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(state, null, 2));
}

export function enqueue(items, meta = {}) {
    if (!Array.isArray(items)) items = [items];
    const clean = items.filter(Boolean);
    if (!clean.length) return [];
    const state = load();
    const now = Date.now();
    const newJobs = clean.map((target, i) => ({
        id: `${now}_${i}_${Math.random().toString(36).slice(2, 7)}`,
        target,
        playlist: meta.playlist || 'Geral',
        source: meta.source || 'manual',
        createdAt: new Date().toISOString(),
        attempts: 0,
    }));
    state.pending.push(...newJobs);
    save(state);
    log.info(`queue: enqueued ${newJobs.length} (source=${meta.source || 'manual'})`);
    return newJobs;
}

export function peek(n = 10) {
    return load().pending.slice(0, n);
}

export function popNext() {
    const state = load();
    if (!state.pending.length) {
        return null;
    }
    const job = state.pending.shift();
    save(state);
    return job;
}

export function markDone(job, result) {
    const state = load();
    if (result?.ok) {
        state.completed.push({
            ...job,
            completedAt: new Date().toISOString(),
        });
        log.info(`queue: ok ${job.target}`);
    } else {
        job.attempts = (job.attempts || 0) + 1;
        job.lastError = String(result?.error?.message || result?.error || '').slice(0, 300);
        if (job.attempts >= MAX_ATTEMPTS) {
            state.failed.push({ ...job, failedAt: new Date().toISOString() });
            log.error(`queue: failed permanently ${job.target} — ${job.lastError}`);
        } else {
            state.pending.push(job);
            log.warn(`queue: retry ${job.attempts}/${MAX_ATTEMPTS} ${job.target}`);
        }
    }
    save(state);
}

export function queueStats() {
    const s = load();
    return {
        pending: s.pending.length,
        completed: s.completed.length,
        failed: s.failed.length,
    };
}

export function clearQueue(which = 'all') {
    const state = load();
    if (which === 'all' || which === 'pending') state.pending = [];
    if (which === 'all' || which === 'completed') state.completed = [];
    if (which === 'all' || which === 'failed') state.failed = [];
    save(state);
}

export function retryFailed() {
    const state = load();
    const moved = state.failed.length;
    for (const f of state.failed) {
        state.pending.push({ ...f, attempts: 0, lastError: undefined });
    }
    state.failed = [];
    save(state);
    return moved;
}

export function listAll() {
    return load();
}
