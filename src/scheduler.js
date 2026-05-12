/**
 * HORIZON CLI — Scheduler interno (sync automático)
 *
 * Roda em primeiro plano (use tmux/screen/systemd/Termux:Boot) e dispara
 * `syncAll` periodicamente.
 */

import chalk from 'chalk';
import { syncAll } from './sync.js';
import { runQueue } from './queueRunner.js';
import { log } from './logger.js';
import { circuitOpen } from './antiban.js';

export async function runScheduler({ intervalHours = 6, runOnStart = true } = {}) {
    const intervalMs = Math.max(1, intervalHours) * 60 * 60 * 1000;
    let stopped = false;

    process.once('SIGINT', () => { stopped = true; });
    process.once('SIGTERM', () => { stopped = true; });

    async function tick() {
        const now = new Date().toLocaleString('pt-BR');
        console.log(chalk.cyan(`\n[${now}] 🔄 Sync agendado iniciando...\n`));
        log.info(`scheduler: tick`);
        try {
            const cb = circuitOpen();
            if (cb.open) {
                console.log(chalk.yellow(`⛔ Circuit breaker aberto, pulando sync.`));
                return;
            }
            const res = await syncAll();
            console.log(
                chalk.gray(
                    `   Inscrições: ${res.subs} · novos: ${res.enqueued}`,
                ),
            );
            if (res.enqueued > 0) {
                const out = await runQueue();
                console.log(chalk.green(`   ✅ Fila: ${out.ok} ok / ${out.err} err`));
            }
        } catch (err) {
            log.error(`scheduler: erro: ${err.message}`);
            console.log(chalk.red(`   ❌ Erro: ${err.message}`));
        }
    }

    console.log(chalk.cyanBright(`🕐 Scheduler ativo: rodando a cada ${intervalHours}h`));
    if (runOnStart) await tick();

    while (!stopped) {
        await new Promise((r) => setTimeout(r, intervalMs));
        if (stopped) break;
        await tick();
    }

    console.log(chalk.green('\n👋 Scheduler encerrado.'));
}
