/**
 * HORIZON CLI — Dependency checker
 * Verifica se yt-dlp e ffmpeg estão instalados e na versão mínima.
 */

import { execSync } from 'child_process';
import chalk from 'chalk';

function hasBinary(cmd) {
    try {
        const probe = process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`;
        execSync(probe, { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

function binaryVersion(cmd, flag = '--version') {
    try {
        return execSync(`${cmd} ${flag}`, { stdio: ['ignore', 'pipe', 'ignore'] })
            .toString()
            .split('\n')[0]
            .trim();
    } catch {
        return null;
    }
}

export function checkDependencies({ silent = false } = {}) {
    const results = {
        ytdlp: {
            name: 'yt-dlp',
            ok: hasBinary('yt-dlp'),
            version: null,
            hint: 'pkg install python && pip install -U yt-dlp  (Termux) | pipx install yt-dlp (Linux/macOS)',
        },
        ffmpeg: {
            name: 'ffmpeg',
            ok: hasBinary('ffmpeg'),
            version: null,
            hint: 'pkg install ffmpeg (Termux) | apt install ffmpeg / brew install ffmpeg',
        },
    };

    if (results.ytdlp.ok) results.ytdlp.version = binaryVersion('yt-dlp');
    if (results.ffmpeg.ok) results.ffmpeg.version = binaryVersion('ffmpeg', '-version');

    if (!silent) {
        console.log(chalk.blueBright('\n🔧 Verificando dependências...'));
        for (const key of Object.keys(results)) {
            const r = results[key];
            if (r.ok) {
                console.log(chalk.green(`  ✓ ${r.name}`) + chalk.gray(` — ${r.version}`));
            } else {
                console.log(chalk.red(`  ✗ ${r.name} não encontrado`));
                console.log(chalk.gray(`    Instalar: ${r.hint}`));
            }
        }
    }

    const allOk = Object.values(results).every((r) => r.ok);
    return { allOk, results };
}

/** Falha rápido se faltarem dependências críticas. */
export function requireDependencies() {
    const { allOk, results } = checkDependencies({ silent: true });
    if (!allOk) {
        console.log(chalk.red('\n❌ Dependências faltando:'));
        for (const r of Object.values(results)) {
            if (!r.ok) {
                console.log(chalk.red(`   - ${r.name}`));
                console.log(chalk.gray(`     ${r.hint}`));
            }
        }
        process.exit(1);
    }
}
