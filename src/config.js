/**
 * HORIZON CLI — Config
 * Caminhos, constantes e configurações globais.
 *
 * As preferências do usuário ficam em ~/.horizon/settings.json e agora
 * incluem pasta base editável, perfil de anti-ban, cookies do navegador,
 * normalização de volume e idioma da interface.
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

/** Retorna a pasta base PADRÃO do sistema (fallback, se o usuário não escolheu uma). */
export function getDefaultMusicBaseDir() {
    if (IS_TERMUX) return '/sdcard/Music/Horizon';
    return path.join(os.homedir(), 'Music', 'Horizon');
}

/** Pasta base EFETIVA — respeita a preferência do usuário. */
export function getMusicBaseDir() {
    const settings = loadSettings();
    if (settings.musicBaseDir && typeof settings.musicBaseDir === 'string') {
        // Expande ~ para o home do usuário.
        return settings.musicBaseDir.replace(/^~(?=$|\/|\\)/, os.homedir());
    }
    return getDefaultMusicBaseDir();
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

/** Valores padrão — é o "estado de fábrica" do Horizon. */
export function defaultSettings() {
    return {
        // Biblioteca
        musicBaseDir: getDefaultMusicBaseDir(),
        defaultPlaylist: 'Geral',

        // Áudio
        format: DEFAULT_FORMAT,
        quality: DEFAULT_QUALITY,
        embedThumbnail: true,
        embedMetadata: true,
        normalizeVolume: false,

        // Performance
        concurrency: DEFAULT_CONCURRENCY,
        dedup: true,
        autoExportM3U: true,
        writeLyrics: false,

        // Anti-bloqueio
        antibanMode: 'seguro',       // desligado | seguro | agressivo | furtivo
        rotateUserAgent: true,
        useCookies: false,
        cookiesBrowser: 'chrome',    // chrome | firefox | edge | brave | safari | chromium
        geoBypass: true,

        // Interface
        language: 'pt',              // reservado para i18n futura
        showTips: true,
    };
}

/** Carrega settings do usuário com defaults aplicados. */
export function loadSettings() {
    const file = path.join(getAppDir(), 'settings.json');
    const defaults = defaultSettings();
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

/** Volta tudo ao padrão (útil quando o usuário quebra a config). */
export function resetSettings() {
    const def = defaultSettings();
    fs.writeFileSync(getSettingsFile(), JSON.stringify(def, null, 2));
    return def;
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
