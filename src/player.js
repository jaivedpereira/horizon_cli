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
    console.log(chalk.gray('  n/Espaço=próxima · p=pausa · s=shuffle · q/Esc=parar'));
    console.log('');
}

/**
 * Toca um único arquivo usando o player detectado.
 * Retorna uma Promise que resolve quando o arquivo termina ou o caller pede skip/stop.
 *
 * Diferente da v2.5: agora NAO escuta stdin diretamente. O controle de teclado
 * fica centralizado no `play()` e usa `child.kill()` para interromper.
 *
 * @returns Promise<{ ended: boolean, child: ChildProcess }>
 */
function playFile(filePath, playerBin) {
    const args = buildPlayerArgs(playerBin, filePath);
    const child = spawn(playerBin, args, {
        stdio: ['ignore', 'ignore', 'ignore'],
        detached: false,
    });

    const promise = new Promise((resolve) => {
        let resolved = false;
        const finish = (reason) => {
            if (resolved) return;
            resolved = true;
            resolve(reason);
        };
        child.on('exit', () => finish('ended'));
        child.on('error', () => finish('error'));
    });

    return { promise, child };
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
 *
 * Controles (capturados em raw mode, sem precisar Enter):
 *   n / espaço / →  → próxima
 *   q / Esc / Ctrl+C → parar
 *   s              → re-shuffle
 *   p / pause      → pausa/retoma (mpv only via SIGSTOP/SIGCONT)
 *
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

    // Setup teclado UMA VEZ — sobrevive entre faixas.
    const tty = process.stdin.isTTY;
    let currentChild = null;
    let action = null; // 'skip' | 'stop' | 'shuffle' | 'pause' | 'resume'
    let paused = false;

    const onKey = (data) => {
        const buf = Buffer.from(data);
        // Ctrl+C (0x03) ou Esc (0x1b) ou 'q'
        if (buf[0] === 0x03 || buf[0] === 0x1b || buf.toString().toLowerCase() === 'q') {
            action = 'stop';
            killCurrent();
            return;
        }
        const key = buf.toString().toLowerCase();
        if (key === 'n' || key === ' ' || key === '\r' || key === '\n') {
            action = 'skip';
            killCurrent();
        } else if (key === 's') {
            action = 'shuffle';
            killCurrent();
        } else if (key === 'p') {
            // Toggle pause via signals (funciona em mpv/ffplay no Linux/macOS).
            if (!currentChild) return;
            try {
                if (paused) {
                    currentChild.kill('SIGCONT');
                    paused = false;
                    process.stdout.write(chalk.green('\r  ▶ retomado          \n'));
                } else {
                    currentChild.kill('SIGSTOP');
                    paused = true;
                    process.stdout.write(chalk.yellow('\r  ⏸ pausado (p para retomar)\n'));
                }
            } catch (err) {
                log.warn(`player: pause toggle falhou: ${err.message}`);
            }
        }
    };

    const killCurrent = () => {
        if (!currentChild) return;
        try {
            // Se estava pausado, retoma antes de matar pra evitar zumbi.
            if (paused) { try { currentChild.kill('SIGCONT'); } catch {} paused = false; }
            currentChild.kill();
        } catch { /* ignore */ }
    };

    if (tty) {
        try { process.stdin.setRawMode(true); } catch { /* nao-tty */ }
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', onKey);
    }

    const cleanupStdin = () => {
        if (!tty) return;
        try {
            process.stdin.removeListener('data', onKey);
            process.stdin.setRawMode(false);
            process.stdin.pause();
        } catch { /* ignore */ }
    };

    let index = 0;
    let playing = true;

    try {
        while (playing) {
            if (index >= files.length) {
                if (loop) {
                    index = 0;
                    if (shuffle) {
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

            action = null;
            paused = false;
            const { promise, child } = playFile(file, playerBin);
            currentChild = child;
            await promise;
            currentChild = null;

            // Decide proximo passo baseado na acao do usuario (ou final natural).
            switch (action) {
                case 'stop':
                    playing = false;
                    break;
                case 'shuffle':
                    for (let i = files.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [files[i], files[j]] = [files[j], files[i]];
                    }
                    index = 0;
                    console.log(chalk.yellow('🔀 Re-shuffled!'));
                    break;
                case 'skip':
                default:
                    index += 1;
                    break;
            }
        }
    } finally {
        cleanupStdin();
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
