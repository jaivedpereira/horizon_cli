/**
 * HORIZON CLI — Terminal Music Player
 *
 * Toca músicas direto no terminal usando mpv (preferido) ou ffplay (fallback).
 * Funcionalidades:
 *   - Toca uma pasta inteira (playlist) ou um arquivo específico.
 *   - Modo shuffle (aleatório).
 *   - Mostra "Now Playing" com artista/título parseados do nome do arquivo.
 *   - Controles: próxima (Enter), parar (q), shuffle (s).
 *   - Funciona em SSH, Termux, qualquer terminal com áudio.
 */

import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { getMusicBaseDir } from './config.js';
import { log } from './logger.js';

const AUDIO_RX = /\.(mp3|m4a|opus|flac|ogg|wav)$/i;

/** Detecta qual player está disponível. */
export function detectPlayer() {
    const players = ['mpv', 'ffplay', 'play']; // play = sox
    for (const p of players) {
        try {
            const cmd = process.platform === 'win32' ? `where ${p}` : `command -v ${p}`;
            execSync(cmd, { stdio: 'ignore' });
            return p;
        } catch {
            continue;
        }
    }
    return null;
}

/** Lista arquivos de áudio de uma pasta, opcionalmente com shuffle. */
export function getPlaylist(folderOrFile, { shuffle = false } = {}) {
    let files = [];

    if (fs.existsSync(folderOrFile) && fs.statSync(folderOrFile).isFile()) {
        // Arquivo único.
        files = [folderOrFile];
    } else {
        // Pasta — pode ser nome relativo à biblioteca ou caminho absoluto.
        let dir = folderOrFile;
        if (!fs.existsSync(dir)) {
            dir = path.join(getMusicBaseDir(), folderOrFile);
        }
        if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
            return { ok: false, error: `Pasta não encontrada: ${folderOrFile}` };
        }
        files = fs
            .readdirSync(dir)
            .filter((f) => AUDIO_RX.test(f))
            .map((f) => path.join(dir, f))
            .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }

    if (!files.length) {
        return { ok: false, error: 'Nenhum arquivo de áudio encontrado.' };
    }

    if (shuffle) {
        // Fisher-Yates shuffle.
        for (let i = files.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [files[i], files[j]] = [files[j], files[i]];
        }
    }

    return { ok: true, files };
}

/** Extrai info do nome do arquivo pra mostrar "Now Playing". */
function parseNowPlaying(filePath) {
    const base = path.basename(filePath).replace(/\.[^.]+$/, '');
    // Remove [videoId] se existir.
    const clean = base.replace(/\s*\[[\w-]{11}\]\s*$/, '').trim();
    // Tenta "Artista - Titulo"
    const m = clean.match(/^(.+?)\s*[-–—]\s*(.+)$/);
    if (m) return { artist: m[1].trim(), title: m[2].trim(), raw: clean };
    return { artist: null, title: clean, raw: clean };
}

/** Formata a barra de "Now Playing" bonita no terminal. */
function printNowPlaying(info, index, total) {
    const num = `[${index + 1}/${total}]`;
    console.log('');
    console.log(chalk.blueBright('━'.repeat(60)));
    console.log(
        chalk.white('  🎵 ') +
            chalk.cyanBright(info.title) +
            (info.artist ? chalk.gray(` — ${info.artist}`) : ''),
    );
    console.log(chalk.gray(`     ${num}`));
    console.log(chalk.blueBright('━'.repeat(60)));
    console.log(chalk.gray('  Enter=próxima  q=parar  s=shuffle'));
    console.log('');
}

/**
 * Toca um único arquivo usando o player detectado.
 * Retorna uma Promise que resolve quando o arquivo termina ou é pulado.
 * @returns {'ended'|'skipped'|'stopped'}
 */
function playFile(filePath, playerBin) {
    return new Promise((resolve) => {
        const args = buildPlayerArgs(playerBin, filePath);
        const child = spawn(playerBin, args, {
            stdio: ['ignore', 'ignore', 'ignore'],
        });

        let resolved = false;
        const done = (reason) => {
            if (resolved) return;
            resolved = true;
            try { child.kill(); } catch { /* ignore */ }
            resolve(reason);
        };

        child.on('exit', () => done('ended'));
        child.on('error', () => done('ended'));

        // Escuta stdin pra controles.
        const onData = (data) => {
            const key = data.toString().trim().toLowerCase();
            if (key === 'q') done('stopped');
            else if (key === '' || key === 'n') done('skipped'); // Enter ou 'n'
            else if (key === 's') done('shuffle');
        };

        if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
            process.stdin.resume();
            process.stdin.on('data', onData);

            // Cleanup listener quando terminar.
            const cleanup = () => {
                process.stdin.removeListener('data', onData);
                process.stdin.pause();
            };
            child.on('exit', cleanup);
            child.on('error', cleanup);
        }
    });
}

function buildPlayerArgs(bin, file) {
    switch (bin) {
        case 'mpv':
            return [
                '--no-video',
                '--really-quiet',
                '--term-osd-bar',
                file,
            ];
        case 'ffplay':
            return [
                '-nodisp',
                '-autoexit',
                '-loglevel', 'quiet',
                file,
            ];
        case 'play': // sox play
            return [file];
        default:
            return [file];
    }
}

/**
 * Player principal — toca uma lista de arquivos em sequência.
 * @param {string} target       Pasta, nome de playlist ou arquivo.
 * @param {object} options      { shuffle, loop }
 */
export async function play(target, { shuffle = false, loop = false } = {}) {
    const playerBin = detectPlayer();
    if (!playerBin) {
        console.log(chalk.red('❌ Nenhum player encontrado. Instale um:'));
        console.log(chalk.gray('   • mpv (recomendado): apt install mpv / brew install mpv / pkg install mpv'));
        console.log(chalk.gray('   • ffplay: já vem com ffmpeg'));
        console.log(chalk.gray('   • sox: apt install sox'));
        return { ok: false, error: 'no-player' };
    }

    const result = getPlaylist(target, { shuffle });
    if (!result.ok) {
        console.log(chalk.red(`❌ ${result.error}`));
        return result;
    }

    let { files } = result;
    const total = files.length;

    console.log(chalk.cyanBright(`\n🎵 Horizon Player — ${total} faixas`));
    console.log(chalk.gray(`   Player: ${playerBin} | Shuffle: ${shuffle ? 'on' : 'off'} | Loop: ${loop ? 'on' : 'off'}\n`));
    log.info(`player: start ${target} (${total} files, player=${playerBin})`);

    let index = 0;
    let playing = true;

    while (playing) {
        if (index >= files.length) {
            if (loop) {
                index = 0;
                if (shuffle) {
                    // Re-shuffle a cada loop.
                    for (let i = files.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [files[i], files[j]] = [files[j], files[i]];
                    }
                }
            } else {
                break;
            }
        }

        const file = files[index];
        const info = parseNowPlaying(file);
        printNowPlaying(info, index, total);

        const action = await playFile(file, playerBin);

        switch (action) {
            case 'ended':
            case 'skipped':
                index += 1;
                break;
            case 'stopped':
                playing = false;
                break;
            case 'shuffle':
                // Re-shuffle e reinicia do começo.
                for (let i = files.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [files[i], files[j]] = [files[j], files[i]];
                }
                index = 0;
                console.log(chalk.yellow('🔀 Shuffled!'));
                break;
        }
    }

    console.log(chalk.green('\n✅ Player encerrado.\n'));
    log.info(`player: end ${target}`);
    return { ok: true, played: Math.min(index, total) };
}

/** Lista playlists disponíveis pra tocar. */
export function listPlayable() {
    const base = getMusicBaseDir();
    if (!fs.existsSync(base)) return [];
    return fs
        .readdirSync(base)
        .filter((f) => {
            const full = path.join(base, f);
            if (!fs.statSync(full).isDirectory()) return false;
            return fs.readdirSync(full).some((ff) => AUDIO_RX.test(ff));
        })
        .map((name) => {
            const full = path.join(base, name);
            const count = fs.readdirSync(full).filter((f) => AUDIO_RX.test(f)).length;
            return { name, count, path: full };
        });
}
