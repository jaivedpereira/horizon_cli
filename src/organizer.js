/**
 * HORIZON CLI — Smart Library Organizer
 *
 * Reorganiza a biblioteca de música por Artista/Álbum, inferindo metadados
 * a partir do nome do arquivo (padrão "Artista - Título [ID].ext").
 *
 * Modos:
 *   - "artist"  → Artista/arquivo.mp3
 *   - "flat"    → tudo numa pasta só (desfaz organização)
 *   - "preview" → mostra o que seria feito sem mexer em nada
 *
 * Nunca perde arquivo: se um conflito de nome acontecer, adiciona sufixo.
 */

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { getMusicBaseDir } from './config.js';
import { log } from './logger.js';

const AUDIO_RX = /\.(mp3|m4a|opus|flac|ogg|wav)$/i;

/** Extrai artista do nome do arquivo. */
function parseArtist(filename) {
    const base = path.basename(filename).replace(/\.[^.]+$/, '');
    // Remove [videoId]
    const clean = base.replace(/\s*\[[\w-]{11}\]\s*$/, '').trim();
    const m = clean.match(/^(.+?)\s*[-–—]\s*(.+)$/);
    if (m) return { artist: m[1].trim(), title: m[2].trim() };
    return { artist: 'Desconhecido', title: clean };
}

/** Gera nome de destino seguro (sem conflito). */
function safeDestPath(destDir, filename) {
    let dest = path.join(destDir, filename);
    if (!fs.existsSync(dest)) return dest;
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    let i = 2;
    while (fs.existsSync(dest)) {
        dest = path.join(destDir, `${base} (${i})${ext}`);
        i += 1;
    }
    return dest;
}

/**
 * Escaneia uma pasta e retorna o plano de reorganização.
 * @param {string} sourceFolder  Nome da playlist ou caminho absoluto.
 * @param {'artist'|'flat'} mode Modo de organização.
 * @returns {{ ok, moves: [{from, to, artist, title}], errors }}
 */
export function planOrganize(sourceFolder, mode = 'artist') {
    let dir = sourceFolder;
    if (!fs.existsSync(dir)) {
        dir = path.join(getMusicBaseDir(), sourceFolder);
    }
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
        return { ok: false, error: `Pasta não encontrada: ${sourceFolder}` };
    }

    const files = fs
        .readdirSync(dir)
        .filter((f) => AUDIO_RX.test(f))
        .map((f) => path.join(dir, f));

    if (!files.length) {
        return { ok: false, error: 'Nenhum arquivo de áudio na pasta.' };
    }

    const moves = [];

    if (mode === 'artist') {
        for (const file of files) {
            const { artist } = parseArtist(file);
            const artistDir = path.join(dir, sanitizeFolderName(artist));
            const dest = safeDestPath(artistDir, path.basename(file));
            if (dest !== file) {
                moves.push({ from: file, to: dest, artist });
            }
        }
    } else if (mode === 'flat') {
        // Move tudo de subpastas pra raiz da pasta.
        const subdirs = fs.readdirSync(dir).filter((f) => {
            const full = path.join(dir, f);
            return fs.statSync(full).isDirectory();
        });
        for (const sub of subdirs) {
            const subPath = path.join(dir, sub);
            const subFiles = fs.readdirSync(subPath).filter((f) => AUDIO_RX.test(f));
            for (const f of subFiles) {
                const from = path.join(subPath, f);
                const to = safeDestPath(dir, f);
                moves.push({ from, to, artist: sub });
            }
        }
    }

    return { ok: true, moves, sourceDir: dir, mode };
}

/**
 * Executa o plano de reorganização (move os arquivos de verdade).
 * @param {object} plan  Resultado de planOrganize().
 * @param {function} onProgress  Callback ({ index, total, from, to }).
 */
export function executeOrganize(plan, onProgress = () => {}) {
    if (!plan.ok) return plan;

    const { moves } = plan;
    let moved = 0;
    const errors = [];

    for (let i = 0; i < moves.length; i++) {
        const { from, to } = moves[i];
        try {
            const destDir = path.dirname(to);
            if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
            fs.renameSync(from, to);
            moved += 1;
            onProgress({ index: i, total: moves.length, from, to });
        } catch (err) {
            errors.push({ from, to, error: err.message });
            log.error(`organizer: falhou ${from} → ${to}: ${err.message}`);
        }
    }

    // Remove subpastas vazias que ficaram.
    cleanEmptyDirs(plan.sourceDir);

    log.info(`organizer: ${moved} movidos, ${errors.length} erros`);
    return { ok: true, moved, errors, total: moves.length };
}

/** Remove recursivamente diretórios vazios. */
function cleanEmptyDirs(dir) {
    if (!fs.existsSync(dir)) return;
    for (const sub of fs.readdirSync(dir)) {
        const full = path.join(dir, sub);
        if (fs.statSync(full).isDirectory()) {
            cleanEmptyDirs(full);
            // Se ficou vazio, remove.
            if (fs.readdirSync(full).length === 0) {
                fs.rmdirSync(full);
            }
        }
    }
}

function sanitizeFolderName(name) {
    return (name || 'Desconhecido')
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60);
}

/** Print formatado do plano (preview). */
export function printPlan(plan) {
    if (!plan.ok) {
        console.log(chalk.red(`❌ ${plan.error}`));
        return;
    }
    if (!plan.moves.length) {
        console.log(chalk.yellow('⚠️  Nada pra reorganizar (já está organizado ou pasta vazia).'));
        return;
    }

    console.log(chalk.blueBright(`\n📂 Plano de reorganização (${plan.mode}):\n`));
    console.log(chalk.gray(`   Pasta: ${plan.sourceDir}`));
    console.log(chalk.gray(`   Movimentos: ${plan.moves.length}\n`));

    // Agrupa por artista.
    const byArtist = new Map();
    for (const m of plan.moves) {
        const key = m.artist || 'Outros';
        if (!byArtist.has(key)) byArtist.set(key, []);
        byArtist.get(key).push(m);
    }

    for (const [artist, files] of byArtist) {
        console.log(chalk.cyan(`   🎤 ${artist} (${files.length})`));
        for (const f of files.slice(0, 5)) {
            console.log(chalk.gray(`      • ${path.basename(f.from)}`));
        }
        if (files.length > 5) {
            console.log(chalk.gray(`      ... +${files.length - 5} mais`));
        }
    }
    console.log('');
}
