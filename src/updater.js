/**
 * HORIZON CLI — Self-updater
 * Atualiza o yt-dlp e, opcionalmente, o próprio CLI (via git pull + npm install).
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { log } from './logger.js';

function run(cmd, opts = {}) {
    try {
        execSync(cmd, { stdio: 'inherit', ...opts });
        return true;
    } catch {
        return false;
    }
}

export function updateYtDlp() {
    console.log(chalk.cyan('\n🔄 Atualizando yt-dlp...'));
    // Tenta na ordem: self-update, pipx, pip3, pip.
    const strategies = [
        ['yt-dlp -U', 'yt-dlp -U'],
        ['pipx upgrade yt-dlp', 'pipx upgrade yt-dlp'],
        ['pip3 install -U yt-dlp', 'pip3 install -U yt-dlp'],
        ['pip install -U yt-dlp', 'pip install -U yt-dlp'],
    ];
    for (const [label, cmd] of strategies) {
        console.log(chalk.gray(`   tentando: ${label}`));
        if (run(cmd)) {
            log.info(`updater: ytdlp via "${cmd}"`);
            console.log(chalk.green('✅ yt-dlp atualizado.'));
            return true;
        }
    }
    log.warn('updater: ytdlp falhou em todas as estratégias');
    console.log(chalk.red('❌ Nenhuma estratégia funcionou. Verifique se yt-dlp/pip está instalado.'));
    return false;
}

export function updateSelf() {
    // Descobre a raiz do projeto (pasta acima de src/).
    const here = path.dirname(fileURLToPath(import.meta.url));
    const projectRoot = path.resolve(here, '..');
    console.log(chalk.cyan(`\n🔄 Atualizando Horizon em ${projectRoot}...`));
    const ok = run('git pull --ff-only', { cwd: projectRoot }) &&
        run('npm install', { cwd: projectRoot });
    if (ok) {
        console.log(chalk.green('✅ Horizon atualizado. Rode de novo para ver as mudanças.'));
        log.info('updater: self update ok');
    } else {
        console.log(chalk.red('❌ Falha no self-update. Você pode atualizar manualmente com `git pull && npm i`.'));
        log.warn('updater: self update failed');
    }
    return ok;
}
