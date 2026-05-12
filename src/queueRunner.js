/**
 * HORIZON CLI — Queue Runner
 * Executa jobs pendentes respeitando a concorrência configurada.
 */

import cliProgress from 'cli-progress';
import chalk from 'chalk';
import { peek, popNext, markDone, queueStats } from './queue.js';
import { downloadOne } from './downloader.js';
import { isYoutubeUrl } from './utils.js';
import { loadSettings } from './config.js';

export async function runQueue({ concurrency, onProgress } = {}) {
    const settings = loadSettings();
    const workers = Math.max(1, concurrency || settings.concurrency || 2);

    const initial = queueStats();
    if (!initial.pending) {
        return { processed: 0, ok: 0, err: 0 };
    }

    const total = initial.pending;
    let done = 0;
    let ok = 0;
    let err = 0;

    const bar = new cliProgress.SingleBar(
        {
            format:
                chalk.cyan(' {bar}') +
                ' {percentage}% | {value}/{total} | ' +
                chalk.gray('{task}'),
            hideCursor: true,
            barCompleteChar: '█',
            barIncompleteChar: '░',
        },
        cliProgress.Presets.shades_classic,
    );
    bar.start(total, 0, { task: 'iniciando...' });

    async function worker() {
        while (true) {
            const job = popNext();
            if (!job) break;
            const isSearchTerm = !isYoutubeUrl(job.target);
            const res = await downloadOne({
                target: job.target,
                playlist: job.playlist,
                isSearchTerm,
            });
            markDone(job, res);
            done += 1;
            if (res.ok) ok += 1;
            else err += 1;
            bar.update(done, { task: job.target.slice(0, 60) });
            if (onProgress) onProgress({ job, res, done, total });
        }
    }

    await Promise.all(Array.from({ length: workers }, () => worker()));
    bar.stop();
    return { processed: done, ok, err };
}

export function previewQueue(n = 10) {
    return peek(n);
}
