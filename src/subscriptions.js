/**
 * HORIZON CLI — Subscriptions
 * Assina playlists/canais do YouTube e dá sync incremental (graças ao archive).
 */

import fs from 'fs';
import path from 'path';
import util from 'util';
import { exec } from 'child_process';
import { getAppDir, sanitizeName } from './config.js';
import { shellEscape, isYoutubeUrl } from './utils.js';
import { log } from './logger.js';

const execP = util.promisify(exec);
const FILE = path.join(getAppDir(), 'subscriptions.json');

function load() {
    if (!fs.existsSync(FILE)) return [];
    try {
        const raw = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
        return Array.isArray(raw) ? raw : [];
    } catch {
        return [];
    }
}

function save(list) {
    fs.writeFileSync(FILE, JSON.stringify(list, null, 2));
}

export function listSubscriptions() {
    return load();
}

export function addSubscription({ url, playlist, name }) {
    if (!isYoutubeUrl(url)) {
        throw new Error('URL inválida. Só aceita YouTube (playlist ou canal).');
    }
    const list = load();
    if (list.some((s) => s.url === url)) {
        throw new Error('Já existe uma inscrição para essa URL.');
    }
    const sub = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        url,
        playlist: sanitizeName(playlist || name || 'Inscricoes'),
        name: name || playlist || url,
        lastSync: null,
        createdAt: new Date().toISOString(),
    };
    list.push(sub);
    save(list);
    log.info(`subscription: added ${url} → ${sub.playlist}`);
    return sub;
}

export function removeSubscription(id) {
    const list = load();
    const idx = list.findIndex((s) => s.id === id || s.url === id);
    if (idx === -1) return false;
    const [removed] = list.splice(idx, 1);
    save(list);
    log.info(`subscription: removed ${removed.url}`);
    return true;
}

export function touchSubscription(id) {
    const list = load();
    const sub = list.find((s) => s.id === id);
    if (sub) {
        sub.lastSync = new Date().toISOString();
        save(list);
    }
}

/** Lista os IDs de vídeo da playlist/canal remoto (sem baixar). */
export async function fetchRemoteIds(url) {
    const cmd = [
        'yt-dlp',
        shellEscape(url),
        '--flat-playlist',
        '--get-id',
        '--no-warnings',
        '--ignore-errors',
    ].join(' ');
    const { stdout } = await execP(cmd, { maxBuffer: 1024 * 1024 * 20 });
    return stdout.trim().split('\n').filter(Boolean);
}
