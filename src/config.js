/**
 * HORIZON CLI — Config
 * Caminhos, constantes e configurações globais.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

export const IS_TERMUX = Boolean(process.env.TERMUX_VERSION);

export const AUDIO_QUALITIES = ['128', '192', '256', '320'];
export const DEFAULT_QUALITY = '192';
export const DEFAULT_FORMAT = 'mp3';
export const SUPPORTED_FORMATS = ['mp3', 'm4a', 'opus', 'flac'];

export const DEFAULT_CONCURRENCY = 2;
export const MAX_CONCURRENCY = 6;

/** Base onde as playlists/pastas de música são salvas. */
export function getMusicBaseDir() {
    if (IS_TERMUX) return '/sdcard/Music/Horizon';
    return path.join(os.homedir(), 'Music', 'Horizon');
}

/** Diretório de configuração do app (~/.horizon). */
export function getAppDir() {
    const dir = path.join(os.homedir(), '.horizon');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

export function getHistoryFile() {
    return path.join(getAppDir(), 'history.json');
}

export function getSettingsFile() {
    return path.join(getAppDir(), 'settings.json');
}

/** Arquivo de dedup global do yt-dlp. Evita re-baixar o mesmo vídeo. */
export function getArchiveFile() {
    return path.join(getAppDir(), 'downloaded.txt');
}

/** Carrega settings do usuário (quality, format, concurrency...) com defaults. */
export function loadSettings() {
    const file = getSettingsFile();
    const defaults = {
        format: DEFAULT_FORMAT,
        quality: DEFAULT_QUALITY,
        concurrency: DEFAULT_CONCURRENCY,
        defaultPlaylist: 'Geral',
        embedThumbnail: true,
        embedMetadata: true,
        dedup: true,             // usa --download-archive
        writeLyrics: false,      // baixa .lrc automaticamente após download
        autoExportM3U: true,     // atualiza .m3u ao final de batch/playlist
    };
    if (!fs.existsSync(file)) return defaults;
    try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
        return { ...defaults, ...raw };
    } catch {
        return defaults;
    }
}

export function saveSettings(patch) {
    const current = loadSettings();
    const next = { ...current, ...patch };
    fs.writeFileSync(getSettingsFile(), JSON.stringify(next, null, 2));
    return next;
}

/** Sanitiza nome de pasta/arquivo pra remover caracteres perigosos. */
export function sanitizeName(name, fallback = 'Geral') {
    if (!name || typeof name !== 'string') return fallback;
    const cleaned = name
        .trim()
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, ' ')
        .slice(0, 80);
    return cleaned || fallback;
}
