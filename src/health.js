/**
 * HORIZON CLI — Health check
 *
 * Tenta baixar uma música curta (90 segundos, podcast Creative Commons da NASA)
 * no formato mais leve, sem salvar em disco. Se funcionar, tua conexão + yt-dlp
 * + cookies estão saudáveis. Se falhar com padrão de ban, já avisa.
 */

import util from 'util';
import { exec } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import chalk from 'chalk';
import { loadSettings, getArchiveFile } from './config.js';
import { antibanFlags } from './antiban.js';
import { shellEscape } from './utils.js';
import { log } from './logger.js';

const execP = util.promisify(exec);

// Vídeo curto estável da própria NASA (domínio público) — não altera direitos.
const HEALTH_VIDEO = 'https://www.youtube.com/watch?v=21X5lGlDOfg';

export async function runHealthCheck() {
    const settings = loadSettings();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'horizon-health-'));
    const outTmpl = path.join(tmpDir, 'probe.%(ext)s');

    const flags = antibanFlags(settings);
    const cmd = [
        'yt-dlp',
        shellEscape(HEALTH_VIDEO),
        '-x',
        '--audio-format mp3',
        '--audio-quality 128K',
        '--no-warnings',
        // Não polui o archive real.
        '--no-download-archive',
        ...flags,
        '-o',
        shellEscape(outTmpl),
    ].join(' ');

    const start = Date.now();
    const report = {
        ok: false,
        durationMs: 0,
        bytes: 0,
        error: null,
        archivePath: getArchiveFile(),
    };

    try {
        await execP(cmd, { maxBuffer: 1024 * 1024 * 50 });
        const files = fs.readdirSync(tmpDir);
        if (files.length) {
            report.bytes = fs.statSync(path.join(tmpDir, files[0])).size;
        }
        report.ok = true;
        log.info(`health: OK (${report.bytes} bytes em ${Date.now() - start}ms)`);
    } catch (err) {
        report.error = String(err.message || err).slice(0, 500);
        log.error(`health: FAIL — ${report.error}`);
    } finally {
        report.durationMs = Date.now() - start;
        // Limpa tmp.
        try {
            for (const f of fs.readdirSync(tmpDir)) fs.unlinkSync(path.join(tmpDir, f));
            fs.rmdirSync(tmpDir);
        } catch {
            /* ignore */
        }
    }
    return report;
}

export function prettyPrintHealth(report) {
    console.log(chalk.blueBright('\n🩺 Health check\n'));
    if (report.ok) {
        console.log(
            chalk.green('  ✓ Download de teste OK') +
                chalk.gray(`  (${(report.bytes / 1024).toFixed(0)} KB em ${report.durationMs}ms)`),
        );
        console.log(chalk.gray('  Sua conexão + yt-dlp estão saudáveis.\n'));
    } else {
        console.log(chalk.red('  ✗ Download de teste falhou.'));
        console.log(chalk.gray('  Erro:'));
        console.log(chalk.gray('  ' + (report.error || 'desconhecido')));
        console.log('');
        console.log(chalk.yellow('  Sugestões:'));
        console.log(chalk.gray('    • horizon update --ytdlp  (atualiza yt-dlp)'));
        console.log(chalk.gray('    • horizon config          (mude antiban para "agressivo" ou "furtivo")'));
        console.log(chalk.gray('    • horizon antiban reset   (se o circuit breaker estiver aberto)'));
        console.log('');
    }
}
