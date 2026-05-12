/**
 * HORIZON CLI — Downloader
 *
 * Constrói comandos yt-dlp e executa downloads com:
 *   - concorrência,
 *   - retry com backoff,
 *   - dedup (download-archive),
 *   - histórico,
 *   - lyrics, exportação M3U,
 *   - PROTEÇÃO ANTI-BLOQUEIO (circuit breaker + flags do antiban.js),
 *   - normalização de volume opcional.
 */

import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import util from 'util';
import chalk from 'chalk';
import {
    getMusicBaseDir,
    loadSettings,
    sanitizeName,
    getArchiveFile,
} from './config.js';
import { shellEscape, isYoutubeUrl, retry, sleep } from './utils.js';
import { addHistoryEntry, addFailure } from './history.js';
import { refreshGallery } from './notifier.js';
import { log } from './logger.js';
import {
    antibanFlags,
    loudnessFlags,
    circuitOpen,
    recordSuccess,
    recordFailure,
} from './antiban.js';

const execPromise = util.promisify(exec);

/** Se o circuit breaker estiver aberto, avisa e devolve false. */
function gateOnCircuit() {
    const state = circuitOpen();
    if (!state.open) return true;
    const minutes = Math.ceil(state.remainingMs / 60_000);
    console.log(
        chalk.yellowBright(
            `⛔ Proteção anti-ban ativa — motivo: ${state.reason}. ` +
                `Tente de novo em ~${minutes}min, ou rode \`horizon antiban reset\`.`,
        ),
    );
    log.warn(`gate: circuit aberto (${minutes}min restantes) — ${state.reason}`);
    return false;
}

/** Garante que a pasta da playlist existe e retorna o caminho.
 *  Aceita `baseOverride` para o bot poder usar pasta efêmera. */
export function ensurePlaylistDir(playlistName, baseOverride) {
    const base = baseOverride || getMusicBaseDir();
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

/** Monta o comando yt-dlp com todas as flags de acordo com settings + antiban. */
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
        path.join(outDir, '%(title)s [%(id)s].%(ext)s'),
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

    // Proteção anti-bloqueio.
    args.push(...antibanFlags(settings));

    // Normalização de volume (EBU R128).
    args.push(...loudnessFlags(settings));

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
            log.warn(`postProcess: m3u falhou: ${err.message}`);
        }
    }
    if (settings.writeLyrics) {
        try {
            const { saveLyricsFor } = await import('./lyrics.js');
            const latest = latestAudioIn(dir);
            if (latest) await saveLyricsFor(latest.full);
        } catch (err) {
            log.warn(`postProcess: lyrics falhou: ${err.message}`);
        }
    }
}

/** Download individual com retry, anti-ban e histórico. */
export async function downloadOne({
    target,
    playlist = 'Geral',
    isSearchTerm = false,
    overrides = {},
    onProgress = () => {},
}) {
    if (!gateOnCircuit()) {
        return { ok: false, error: new Error('circuit breaker aberto') };
    }
    const settings = { ...loadSettings(), ...overrides };
    const dir = ensurePlaylistDir(playlist, overrides.musicBaseDir);

    log.info(`download: start ${target} → ${playlist} (antiban=${settings.antibanMode})`);

    try {
        // Cada tentativa regera o comando — assim cada retry pega um User-Agent novo.
        await retry(
            () => {
                const cmd = buildYtdlpCommand({
                    target,
                    outDir: dir,
                    isSearchTerm,
                    playlist: false,
                    overrides,
                });
                return execPromise(cmd, { maxBuffer: 1024 * 1024 * 50 });
            },
            { retries: 2, baseDelay: 2500 },
        );
        refreshGallery(dir);
        await postProcess({ dir, settings });
        addHistoryEntry({ target, playlist, mode: isSearchTerm ? 'search' : 'url' });
        recordSuccess();
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
        const { opened } = recordFailure(err);
        log.error(`download: fail ${target}: ${err?.message || err}`);
        if (opened) {
            // Dá uma pausinha maior pra não bombardear logo em seguida.
            await sleep(1500);
        }
        onProgress({ ok: false, target, error: err });
        return { ok: false, error: err };
    }
}

/** Download de uma playlist do YouTube inteira (com anti-ban e hooks). */
export async function downloadPlaylist({
    url,
    playlist = 'MinhaPlaylist',
    overrides = {},
    silent = false,
}) {
    if (!isYoutubeUrl(url)) {
        throw new Error('URL inválida. Forneça um link do YouTube.');
    }
    if (!gateOnCircuit()) {
        return { ok: false, error: new Error('circuit breaker aberto') };
    }
    const settings = { ...loadSettings(), ...overrides };
    const dir = ensurePlaylistDir(playlist, overrides.musicBaseDir);
    const cmd = buildYtdlpCommand({
        target: url,
        outDir: dir,
        isSearchTerm: false,
        playlist: true,
        overrides,
    });

    log.info(`playlist: start ${url} → ${playlist} (antiban=${settings.antibanMode})`);
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
                recordSuccess();
                log.info(`playlist: ok ${url}`);
                resolve({ ok: true, dir });
            } else {
                addFailure({
                    target: url,
                    playlist,
                    mode: 'playlist',
                    error: `exit code ${code}`,
                });
                recordFailure(new Error(`exit ${code}`));
                log.error(`playlist: fail ${url} exit=${code}`);
                resolve({ ok: false, code });
            }
        });
    });
}

/** Download em lote com concorrência limitada. */
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
            if (circuitOpen().open) break; // Para imediatamente se o circuito abrir.
            const next = queue.shift();
            if (!next) break;
            const { target, index } = next;
            const isSearchTerm = !isYoutubeUrl(target);
            onProgress({ type: 'start', target, index, total, done });
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

/** Busca top-N resultados no YouTube (também respeita anti-ban leve). */
export async function searchYoutube(query, limit = 5) {
    const settings = loadSettings();
    const cmd = [
        'yt-dlp',
        shellEscape(`ytsearch${limit}:${query}`),
        '--get-title',
        '--get-id',
        '--no-warnings',
        '--ignore-errors',
        '--flat-playlist',
        // Só rotação de UA e geo-bypass; sem sleep/rate-limit pra busca ser rápida.
        '--user-agent',
        shellEscape(settings.rotateUserAgent !== false ? pickUserAgentLight() : 'Mozilla/5.0'),
        settings.geoBypass !== false ? '--geo-bypass' : '',
    ]
        .filter(Boolean)
        .join(' ');

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

// Pequena função privada pra não acoplar busca ao módulo antiban.
function pickUserAgentLight() {
    const list = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    ];
    return list[Math.floor(Math.random() * list.length)];
}
