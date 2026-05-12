/**
 * HORIZON CLI — Export
 * Gera .m3u e README.md com tracklist para cada pasta de playlist.
 */

import fs from 'fs';
import path from 'path';
import { getMusicBaseDir } from './config.js';

const AUDIO_RX = /\.(mp3|m4a|opus|flac)$/i;

export function listAudioFiles(folderPath) {
    if (!fs.existsSync(folderPath)) return [];
    return fs
        .readdirSync(folderPath)
        .filter((f) => AUDIO_RX.test(f))
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function listPlaylistFolders() {
    const base = getMusicBaseDir();
    if (!fs.existsSync(base)) return [];
    return fs
        .readdirSync(base)
        .filter((f) => fs.statSync(path.join(base, f)).isDirectory());
}

export function exportM3U(playlistName) {
    const base = getMusicBaseDir();
    const dir = path.join(base, playlistName);
    const files = listAudioFiles(dir);
    if (!files.length) return { ok: false, reason: 'empty' };
    const out = path.join(dir, `${playlistName}.m3u`);
    const lines = ['#EXTM3U'];
    for (const f of files) {
        const name = path.basename(f, path.extname(f));
        lines.push(`#EXTINF:-1,${name}`);
        lines.push(f);
    }
    fs.writeFileSync(out, lines.join('\n') + '\n');
    return { ok: true, file: out, count: files.length };
}

export function writePlaylistReadme(playlistName) {
    const base = getMusicBaseDir();
    const dir = path.join(base, playlistName);
    const files = listAudioFiles(dir);
    if (!files.length) return { ok: false, reason: 'empty' };
    const out = path.join(dir, 'README.md');
    const now = new Date().toLocaleString('pt-BR');
    const md = [
        `# ${playlistName}`,
        '',
        `_Gerado automaticamente pelo Horizon CLI em ${now}_`,
        '',
        `Total: **${files.length}** faixas`,
        '',
        '## Tracklist',
        '',
        ...files.map((f, i) => `${i + 1}. ${path.basename(f, path.extname(f))}`),
        '',
    ].join('\n');
    fs.writeFileSync(out, md);
    return { ok: true, file: out, count: files.length };
}

export function exportAll(playlistName) {
    const m = exportM3U(playlistName);
    const r = writePlaylistReadme(playlistName);
    return { m3u: m, readme: r };
}
