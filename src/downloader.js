/**
 * HORIZON CLI — Downloader
 * Constrói comandos yt-dlp e executa downloads com concorrência, retry,
 * dedup (download-archive), histórico, lyrics e exportação M3U.
 */

import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import util from 'util';
import {
    getMusicBaseDir,
    loadSettings,
    sanitizeName,
    getArchiveFile,
} from './config.js';
import { shellEscape, isYoutubeUrl, retry } from './utils.js';
import { addHistoryEntry, addFailure } from './history.js';
import { refreshGallery } from './notifier.js';
import { log } from './logger.js';

const execPromise = util.promisify(exec);

/** Garante que a pasta da playlist existe e retorna o caminho. */
export function ensurePlaylistDir(playlistName) {
    const base = getMusicBaseDir();
    const dir = path.join(base, sanitizeName(playlistName));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

/** Retorna o arquivo de áudio mais recente da pasta, ou null. */
function latestAudioIn(dir) {
    if (!fs.existsSync(dir)) return null;
    const files = fs
        .readdirSync(dir)
        .filter((f) => /\.(mp3|m4a|opus|flac)$/i.test(f))
        .map((name) => {
            const full = path.join(dir, name);
            return { name, full, mtime: fs.statSync(full).mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);
    return files[0] || null;
}

/** Monta o comando yt-dlp com todas as flags de acordo com settings. */
export function buildYtdlpCommand({
    target,
    outDir,
    isSearchTerm = false,
    playlist = false,
    overrides = {},
}) {
    const settings = { ...loadSettings(), ...overrides };
    const { format, quality, embedThumbnail, embedMetadata, dedup } = settings;

    const sourceArg = isSearchTerm
        ? shellEscape(`ytsearch1:${target}`)
        : shellEscape(target);

    const outputTemplate = shellEscape(
        path.join(outDir, '%(title)s.%(ext)s'),
    );

    const args = [
        'yt-dlp',
        sourceArg,
        '-x',
        `--audio-format ${format}`,
        `--audio-quality ${quality}K`,
        '--no-warnings',
        '--ignore-errors',
        playlist ? '--yes-playlist' : '--no-playlist',
    ];
    if (embedThumbnail) args.push('--embed-thumbnail');
    if (embedMetadata) args.push('--add-metadata');
    if (dedup) args.push('--download-archive', shellEscape(getArchiveFile()));
    args.push('-o', outputTemplate);

    return args.join(' ');
}

/** Hook pós-download: lyrics + export M3U (se habilitados). */
async function postProcess({ dir, settings }) {
    if (settings.autoExportM3U) {
        try {
            const { exportAll } = await import('./export.js');
            const pl = path.basename(dir);
            exportAll(pl);
        } catch (err) {
            log.warn(`postProcess: m3u failed: ${err.message}`);
        }
    }
    if (settings.writeLyrics) {
        try {
            const { saveLyricsFor } = await import('./lyrics.js');
            const latest = latestAudioIn(dir);
            if (latest) await saveLyricsFor(latest.full);
        } catch (err) {
            log.warn(`postProcess: lyrics failed: ${err.message}`);
        }
    }
}

/** Download individual com retry e histórico. */
export async function downloadOne({
    target,
    playlist = 'Geral',
    isSearchTerm = false,
    overrides = {},
    onProgress = () => {},
}) {
    const settings = { ...loadSettings(), ...overrides };
    const dir = ensurePlaylistDir(playlist);
    const cmd = buildYtdlpCommand({
        target,
        outDir: dir,
        isSearchTerm,
        playlist: false,
        overrides,
    });

    log.info(`download: start ${target} → ${playlist}`);
    try {
        await retry(() => execPromise(cmd, { maxBuffer: 1024 * 1024 * 50 }), {
            retries: 2,
            baseDelay: 2500,
        });
        refreshGallery(dir);
        await postProcess({ dir, settings });
        addHistoryEntry({ target, playlist, mode: isSearchTerm ? 'search' : 'url' });
        log.info(`download: ok ${target}`);
        onProgress({ ok: true, target });
        return { ok: true, dir };
    } catch (err) {
        addFailure({
            target,
            playlist,
            mode: isSearchTerm ? 'search' : 'url',
            error: String(err?.message || err).slice(0, 300),
        });
        log.error(`download: fail ${target}: ${err?.message || err}`);
        onProgress({ ok: false, target, error: err });
        return { ok: false, error: err };
    }
}

/** Download de uma playlist do YouTube inteira. */
export async function downloadPlaylist({
    url,
    playlist = 'MinhaPlaylist',
    overrides = {},
    silent = false,
}) {
    if (!isYoutubeUrl(url)) {
        throw new Error('URL inválida. Forneça um link do YouTube.');
    }
    const settings = { ...loadSettings(), ...overrides };
    const dir = ensurePlaylistDir(playlist);
    const cmd = buildYtdlpCommand({
        target: url,
        outDir: dir,
        isSearchTerm: false,
        playlist: true,
        overrides,
    });

    log.info(`playlist: start ${url} → ${playlist}`);
    return new Promise((resolve) => {
        const child = exec(cmd, { maxBuffer: 1024 * 1024 * 200 });
        if (!silent) {
            child.stdout?.pipe(process.stdout);
            child.stderr?.pipe(process.stderr);
        }
        child.on('exit', async (code) => {
            refreshGallery(dir);
            if (code === 0) {
                await postProcess({ dir, settings });
                addHistoryEntry({ target: url, playlist, mode: 'playlist' });
                log.info(`playlist: ok ${url}`);
                resolve({ ok: true, dir });
            } else {
                addFailure({
                    target: url,
                    playlist,
                    mode: 'playlist',
                    error: `exit code ${code}`,
                });
                log.error(`playlist: fail ${url} exit=${code}`);
                resolve({ ok: false, code });
            }
        });
    });
}

/**
 * Download em lote com concorrência limitada.
 * @param {string[]} items   termos de busca ou URLs
 * @param {object} options   { playlist, concurrency, onProgress }
 */
export async function downloadBatch(items, options = {}) {
    const settings = loadSettings();
    const {
        playlist = settings.defaultPlaylist,
        concurrency = settings.concurrency,
        onProgress = () => {},
        overrides = {},
    } = options;

    const total = items.length;
    let done = 0;
    const results = [];
    const queue = items.map((target, index) => ({ target, index }));

    const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
        while (queue.length) {
            const next = queue.shift();
            if (!next) break;
            const { target, index } = next;
            const isSearchTerm = !isYoutubeUrl(target);
            onProgress({
                type: 'start',
                target,
                index,
                total,
                done,
            });
            const res = await downloadOne({
                target,
                playlist,
                isSearchTerm,
                overrides,
            });
            done += 1;
            results.push({ target, ...res });
            onProgress({
                type: 'end',
                target,
                index,
                total,
                done,
                ok: res.ok,
                error: res.error,
            });
        }
    });

    await Promise.all(workers);
    return results;
}

/** Busca top-N resultados no YouTube, retorna [{title, videoId}]. */
export async function searchYoutube(query, limit = 5) {
    const cmd = [
        'yt-dlp',
        shellEscape(`ytsearch${limit}:${query}`),
        '--get-title',
        '--get-id',
        '--no-warnings',
        '--ignore-errors',
        '--flat-playlist',
    ].join(' ');

    const { stdout } = await execPromise(cmd, { maxBuffer: 1024 * 1024 * 10 });
    const lines = stdout.trim().split('\n').filter(Boolean);
    const out = [];
    for (let i = 0; i < lines.length; i += 2) {
        if (lines[i] && lines[i + 1]) {
            out.push({ title: lines[i], videoId: lines[i + 1] });
        }
    }
    return out;
}
