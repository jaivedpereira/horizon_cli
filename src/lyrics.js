/**
 * HORIZON CLI — Lyrics
 * Busca letras via lyrics.ovh (gratuita, sem chave) e salva como .lrc ao lado do áudio.
 */

import fs from 'fs';
import path from 'path';
import { log } from './logger.js';

const AUDIO_RX = /\.(mp3|m4a|opus|flac)$/i;

/** Parse heurístico "Artist - Title.mp3" → { artist, title }. */
export function parseArtistTitle(filename) {
    const base = path.basename(filename).replace(/\.[^.]+$/, '');
    // Vários hífens/travessões possíveis.
    const m = base.match(/^(.+?)\s*[-–—]\s*(.+)$/);
    if (m) return { artist: m[1].trim(), title: m[2].trim() };
    return { artist: null, title: base.trim() };
}

export async function fetchLyrics(artist, title) {
    if (!title) return null;
    // Se não temos artista, lyrics.ovh não funciona bem; retorna null sem rede.
    if (!artist) return null;

    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    try {
        const controller = new AbortController();
        const to = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(to);
        if (!res.ok) return null;
        const data = await res.json();
        const lyrics = (data?.lyrics || '').trim();
        return lyrics || null;
    } catch (err) {
        log.warn(`lyrics: fetch failed ${artist} - ${title}: ${err.message}`);
        return null;
    }
}

export async function saveLyricsFor(filePath) {
    if (!fs.existsSync(filePath)) return { ok: false, reason: 'not-found' };
    const { artist, title } = parseArtistTitle(filePath);
    const lyrics = await fetchLyrics(artist, title);
    if (!lyrics) return { ok: false, reason: 'no-lyrics' };
    const dir = path.dirname(filePath);
    const name = path.basename(filePath).replace(/\.[^.]+$/, '');
    const out = path.join(dir, `${name}.lrc`);
    fs.writeFileSync(out, lyrics, 'utf-8');
    log.info(`lyrics: saved ${out}`);
    return { ok: true, file: out };
}

export async function saveLyricsForFolder(folderPath, onProgress = () => {}) {
    if (!fs.existsSync(folderPath)) return { found: 0, saved: 0, skipped: 0 };
    const files = fs
        .readdirSync(folderPath)
        .filter((f) => AUDIO_RX.test(f))
        .map((f) => path.join(folderPath, f));
    let saved = 0;
    let skipped = 0;
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const lrc = file.replace(/\.[^.]+$/, '.lrc');
        if (fs.existsSync(lrc)) {
            skipped += 1;
            onProgress({ index: i, total: files.length, file, status: 'skip' });
            continue;
        }
        const res = await saveLyricsFor(file);
        if (res.ok) saved += 1;
        onProgress({
            index: i,
            total: files.length,
            file,
            status: res.ok ? 'saved' : 'none',
        });
    }
    return { found: files.length, saved, skipped };
}
