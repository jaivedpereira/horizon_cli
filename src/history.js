/**
 * HORIZON CLI — History
 * Persiste downloads em ~/.horizon/history.json
 */

import fs from 'fs';
import { getHistoryFile } from './config.js';

const MAX_ENTRIES = 500;

export function loadHistory() {
    const file = getHistoryFile();
    if (!fs.existsSync(file)) return [];
    try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
        return Array.isArray(raw) ? raw : [];
    } catch {
        return [];
    }
}

function saveHistory(entries) {
    const file = getHistoryFile();
    const trimmed = entries.slice(-MAX_ENTRIES);
    fs.writeFileSync(file, JSON.stringify(trimmed, null, 2));
}

export function addHistoryEntry(entry) {
    const entries = loadHistory();
    entries.push({
        ts: new Date().toISOString(),
        status: 'ok',
        ...entry,
    });
    saveHistory(entries);
}

/** Top-N playlists mais baixadas. */
export function topPlaylists(n = 5) {
    const counts = new Map();
    for (const e of loadHistory()) {
        if (e.status !== 'ok') continue;
        counts.set(e.playlist, (counts.get(e.playlist) || 0) + 1);
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([playlist, count]) => ({ playlist, count }));
}

export function addFailure(entry) {
    addHistoryEntry({ ...entry, status: 'error' });
}

export function clearHistory() {
    saveHistory([]);
}

export function summary() {
    const all = loadHistory();
    const ok = all.filter((e) => e.status === 'ok').length;
    const err = all.filter((e) => e.status === 'error').length;
    return { total: all.length, ok, err };
}
