/**
 * HORIZON CLI — Scanner
 *
 * Varre a biblioteca local e reconstrói o arquivo de dedup
 * (~/.horizon/downloaded.txt) a partir dos vídeos que você JÁ TEM no disco.
 *
 * Útil quando:
 *   - você migrou de máquina e não quer baixar tudo de novo;
 *   - o archive foi apagado / corrompido;
 *   - você importou músicas manualmente e quer que o Horizon as "conheça".
 *
 * O yt-dlp embute o video_id no campo PURL/COMMENT da tag ID3 quando usa
 * --embed-metadata. A gente lê isso (sem dependência extra) via parser simples
 * dos frames ID3v2 TXXX/WOAF/COMM, e cai no fallback "extrair do nome" se
 * não encontrar.
 */

import fs from 'fs';
import path from 'path';
import { getArchiveFile, getMusicBaseDir } from './config.js';
import { log } from './logger.js';

const AUDIO_RX = /\.(mp3|m4a|opus|flac)$/i;

/** Extrai um video_id de 11 chars da string, se houver. */
function findVideoIdIn(text) {
    if (!text) return null;
    const m = String(text).match(/[\w-]{11}/);
    if (!m) return null;
    // Sanity check: precisa ter pelo menos uma letra e um número pra não ser acidente.
    if (!/[A-Za-z]/.test(m[0]) || !/\d/.test(m[0])) return null;
    return m[0];
}

/** Lê os primeiros 128KB de um arquivo como texto ASCII (tolerante a binário). */
function readHeadAsAscii(filePath, bytes = 128 * 1024) {
    try {
        const fd = fs.openSync(filePath, 'r');
        const size = Math.min(fs.statSync(filePath).size, bytes);
        const buf = Buffer.alloc(size);
        fs.readSync(fd, buf, 0, size, 0);
        fs.closeSync(fd);
        // Filtra bytes ASCII imprimíveis pra achar URLs/IDs embutidos.
        return buf.toString('latin1');
    } catch {
        return '';
    }
}

/** Tenta descobrir o video_id de um arquivo de áudio. */
export function extractVideoId(filePath) {
    // 1. Tenta via tag (head do arquivo).
    const head = readHeadAsAscii(filePath);
    // Procura padrões tipo "youtube.com/watch?v=XXX" ou "youtu.be/XXX".
    const urlMatch =
        head.match(/youtube\.com\/watch\?v=([\w-]{11})/) ||
        head.match(/youtu\.be\/([\w-]{11})/);
    if (urlMatch) return urlMatch[1];

    // 2. Fallback: nome do arquivo (yt-dlp às vezes salva com [VIDEOID]).
    const base = path.basename(filePath);
    const bracket = base.match(/\[([\w-]{11})\]/);
    if (bracket) return bracket[1];

    // 3. Último recurso: qualquer token de 11 chars no nome (mais arriscado).
    return findVideoIdIn(base);
}

/**
 * Escaneia toda a biblioteca e devolve { found, withId, ids, missing }.
 */
export function scanLibrary({ onProgress = () => {} } = {}) {
    const base = getMusicBaseDir();
    if (!fs.existsSync(base)) {
        return { found: 0, withId: 0, ids: [], missing: [] };
    }
    const folders = fs
        .readdirSync(base)
        .filter((f) => fs.statSync(path.join(base, f)).isDirectory());

    const ids = new Set();
    const missing = [];
    let found = 0;

    for (const folder of folders) {
        const dir = path.join(base, folder);
        const files = fs.readdirSync(dir).filter((f) => AUDIO_RX.test(f));
        for (const file of files) {
            found += 1;
            const full = path.join(dir, file);
            const id = extractVideoId(full);
            if (id) ids.add(id);
            else missing.push(path.join(folder, file));
            onProgress({ folder, file, id, totalScanned: found });
        }
    }

    return {
        found,
        withId: ids.size,
        ids: [...ids],
        missing,
    };
}

/**
 * Reconstrói o arquivo de dedup (sem duplicar entradas já existentes).
 */
export function rebuildArchive({ dryRun = false, onProgress = () => {} } = {}) {
    const archiveFile = getArchiveFile();
    const existing = new Set();
    if (fs.existsSync(archiveFile)) {
        for (const line of fs.readFileSync(archiveFile, 'utf-8').split('\n')) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2) existing.add(parts[parts.length - 1]);
        }
    }

    const scan = scanLibrary({ onProgress });
    const toAdd = scan.ids.filter((id) => !existing.has(id));

    if (!dryRun && toAdd.length) {
        const lines = toAdd.map((id) => `youtube ${id}`).join('\n') + '\n';
        fs.appendFileSync(archiveFile, lines);
        log.info(`scanner: arquivo dedup ganhou ${toAdd.length} novas entradas`);
    }

    return {
        ...scan,
        added: toAdd.length,
        archiveFile,
    };
}
