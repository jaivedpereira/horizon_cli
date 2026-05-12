/**
 * HORIZON BOT — Estado persistente de usuários
 *
 * Guarda em ~/.horizon/bot-users.json:
 *   - perfil de cada usuário (id, nome, primeiro/último contato)
 *   - estatísticas (total de downloads, downloads do dia)
 *   - quota diária com reset automático à meia-noite
 *   - bloqueios manuais (admin)
 *
 * Pensado para o bot rodar em servidor com vários usuários
 * sem misturar histórico, sem deixar um spam de quota destruir o app.
 */

import fs from 'fs';
import path from 'path';
import { getAppDir } from './config.js';

const FILE = path.join(getAppDir(), 'bot-users.json');

function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

function load() {
    if (!fs.existsSync(FILE)) return {};
    try {
        return JSON.parse(fs.readFileSync(FILE, 'utf-8')) || {};
    } catch {
        return {};
    }
}

function save(state) {
    fs.writeFileSync(FILE, JSON.stringify(state, null, 2));
}

/** Garante o objeto do usuário e reseta quota diária se virou o dia. */
export function getUser(ctxFrom) {
    const state = load();
    const id = String(ctxFrom.id);
    const today = todayStr();
    if (!state[id]) {
        state[id] = {
            id,
            name: ctxFrom.first_name || ctxFrom.username || 'desconhecido',
            firstSeen: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            totalDownloads: 0,
            todayDownloads: 0,
            todayDate: today,
            blocked: false,
            isAdmin: false,
        };
    } else {
        // Atualiza nome/last seen / reset quota diária.
        state[id].name = ctxFrom.first_name || ctxFrom.username || state[id].name;
        state[id].lastSeen = new Date().toISOString();
        if (state[id].todayDate !== today) {
            state[id].todayDate = today;
            state[id].todayDownloads = 0;
        }
    }
    save(state);
    return state[id];
}

export function incrementDownload(userId) {
    const state = load();
    const id = String(userId);
    if (!state[id]) return;
    const today = todayStr();
    if (state[id].todayDate !== today) {
        state[id].todayDate = today;
        state[id].todayDownloads = 0;
    }
    state[id].totalDownloads += 1;
    state[id].todayDownloads += 1;
    save(state);
}

export function setBlocked(userId, blocked) {
    const state = load();
    const id = String(userId);
    if (!state[id]) return false;
    state[id].blocked = Boolean(blocked);
    save(state);
    return true;
}

export function listAllUsers() {
    return Object.values(load());
}

export function userCount() {
    return Object.keys(load()).length;
}

/** Marca admins definidos via env (sobrescreve a flag isAdmin a cada start). */
export function syncAdmins(adminIds) {
    const state = load();
    const set = new Set(adminIds.map(String));
    for (const id of Object.keys(state)) {
        state[id].isAdmin = set.has(id);
    }
    save(state);
}

/** Estatísticas globais (úteis para `/admin_users`). */
export function globalStats() {
    const users = listAllUsers();
    const today = todayStr();
    const totalDownloads = users.reduce((s, u) => s + (u.totalDownloads || 0), 0);
    const todayDownloads = users.reduce(
        (s, u) => s + (u.todayDate === today ? u.todayDownloads || 0 : 0),
        0,
    );
    const active = users.filter(
        (u) => u.lastSeen && Date.now() - Date.parse(u.lastSeen) < 7 * 24 * 60 * 60 * 1000,
    ).length;
    return {
        users: users.length,
        active7d: active,
        totalDownloads,
        todayDownloads,
        blocked: users.filter((u) => u.blocked).length,
    };
}
