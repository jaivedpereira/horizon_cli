/**
 * HORIZON CLI — Dashboard
 * Imprime um mini-dashboard com gráfico ASCII dos últimos N dias.
 */

import chalk from 'chalk';
import { loadHistory } from './history.js';
import { queueStats } from './queue.js';
import { listSubscriptions } from './subscriptions.js';
import { listPlaylistFolders, listAudioFiles } from './export.js';
import { getMusicBaseDir } from './config.js';
import path from 'path';

function bucketByDay(entries, days = 14) {
    const now = new Date();
    const buckets = new Map();
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        buckets.set(d.toISOString().slice(0, 10), 0);
    }
    for (const e of entries) {
        if (!e.ts || e.status !== 'ok') continue;
        const day = e.ts.slice(0, 10);
        if (buckets.has(day)) buckets.set(day, buckets.get(day) + 1);
    }
    return buckets;
}

function bar(value, max, width = 28) {
    if (!max) return chalk.gray('·'.repeat(width));
    const len = Math.round((value / max) * width);
    return chalk.cyanBright('█'.repeat(len)) + chalk.gray('·'.repeat(Math.max(0, width - len)));
}

function totalStorage(folders) {
    const base = getMusicBaseDir();
    let totalFiles = 0;
    for (const f of folders) {
        totalFiles += listAudioFiles(path.join(base, f)).length;
    }
    return totalFiles;
}

export function renderDashboard() {
    const history = loadHistory();
    const ok = history.filter((h) => h.status === 'ok').length;
    const err = history.filter((h) => h.status === 'error').length;
    const q = queueStats();
    const subs = listSubscriptions();
    const folders = listPlaylistFolders();
    const totalFiles = totalStorage(folders);

    console.log(chalk.blueBright('\n📊 HORIZON — DASHBOARD\n'));
    console.log(
        chalk.white('  Histórico   ') +
            chalk.gray(': ') +
            chalk.white(history.length) +
            chalk.gray(' (') +
            chalk.green(`${ok} ok`) +
            chalk.gray(' / ') +
            chalk.red(`${err} err`) +
            chalk.gray(')'),
    );
    console.log(
        chalk.white('  Fila        ') +
            chalk.gray(': ') +
            chalk.yellow(`${q.pending} pendente`) +
            chalk.gray(' · ') +
            chalk.green(`${q.completed} concluída`) +
            chalk.gray(' · ') +
            chalk.red(`${q.failed} falhou`),
    );
    console.log(
        chalk.white('  Inscrições  ') +
            chalk.gray(': ') +
            chalk.white(subs.length),
    );
    console.log(
        chalk.white('  Pastas      ') +
            chalk.gray(': ') +
            chalk.white(folders.length) +
            chalk.gray(` · ${totalFiles} arquivos de áudio`),
    );
    console.log('');

    const buckets = bucketByDay(history, 14);
    const max = Math.max(...Array.from(buckets.values()), 1);
    console.log(chalk.gray('  Downloads (últimos 14 dias):\n'));
    for (const [day, n] of buckets) {
        const label = day.slice(5);
        console.log(`  ${chalk.gray(label)}  ${bar(n, max)}  ${chalk.white(n)}`);
    }
    console.log('');
}
