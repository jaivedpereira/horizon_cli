#!/usr/bin/env node

/**
 * HORIZON CLI — Entry point
 *
 * Modos:
 *   horizon                         # menu interativo
 *   horizon search <termo>          # buscar + baixar
 *   horizon url <link>              # baixar de URL
 *   horizon batch "a, b, c"         # lote
 *   horizon playlist <url>          # playlist YT inteira
 *   horizon config                  # editar preferências
 *   horizon history [--clear]       # histórico
 *   horizon doctor                  # checar deps
 *   horizon stats                   # dashboard
 *   horizon logs [-n 50] [--path]   # logs
 *   horizon update [--ytdlp] [--self] [--all]
 *   horizon subs <add|list|remove>  # inscrições
 *   horizon sync                    # baixar novidades das inscrições
 *   horizon queue <run|retry|clear|list>
 *   horizon export <playlist>       # gera .m3u + README.md
 *   horizon lyrics <playlist>       # baixa .lrc das músicas da pasta
 *   horizon completion <bash|zsh|fish>
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import { Command } from 'commander';
import { createSpinner } from 'nanospinner';
import cliProgress from 'cli-progress';
import fs from 'fs';
import path from 'path';

import {
    getMusicBaseDir,
    loadSettings,
    saveSettings,
    MAX_CONCURRENCY,
} from './src/config.js';
import { isYoutubeUrl, isOtherPlatform, formatDuration } from './src/utils.js';
import { checkDependencies, requireDependencies } from './src/deps.js';
import { notify, clearNotification } from './src/notifier.js';
import {
    searchYoutube,
    downloadOne,
    downloadBatch,
    downloadPlaylist,
} from './src/downloader.js';
import { loadHistory, clearHistory, summary, topPlaylists } from './src/history.js';
import { showSplash, showOtherPlatformsTip, askPlaylist, askSettings } from './src/ui.js';
import { renderDashboard } from './src/stats.js';
import { tailLogs, getLogPath, getLogDir, log } from './src/logger.js';
import { updateYtDlp, updateSelf } from './src/updater.js';
import { listSubscriptions, addSubscription, removeSubscription } from './src/subscriptions.js';
import { syncAll } from './src/sync.js';
import { enqueue, clearQueue, retryFailed, queueStats, listAll as listQueue } from './src/queue.js';
import { runQueue, previewQueue } from './src/queueRunner.js';
import { exportAll, listPlaylistFolders, listAudioFiles } from './src/export.js';
import { saveLyricsForFolder } from './src/lyrics.js';
import { getCompletion } from './src/completions.js';

// ============================================================
//  AÇÕES DE ALTO NÍVEL
// ============================================================

async function doSingleSearch(term, playlist) {
    if (isOtherPlatform(term)) {
        showOtherPlatformsTip();
        return;
    }

    const spinner = createSpinner('Buscando 5 melhores resultados...').start();
    let choices;
    try {
        const results = await searchYoutube(term, 5);
        spinner.success();
        choices = results.map((r) => ({ name: r.title, value: r.videoId }));
    } catch {
        spinner.error({ text: 'Erro na busca. Verifique a conexão.' });
        return;
    }

    if (!choices.length) {
        console.log(chalk.yellow('⚠️  Nenhum resultado.'));
        return;
    }

    const { videoId } = await inquirer.prompt([
        {
            type: 'rawlist',
            name: 'videoId',
            message: 'Escolha a versão:',
            choices,
        },
    ]);

    const folder = playlist || (await askPlaylist());
    await doUrl(`https://www.youtube.com/watch?v=${videoId}`, folder);
}

async function doUrl(url, playlist) {
    if (isOtherPlatform(url)) {
        showOtherPlatformsTip();
        return;
    }
    if (!isYoutubeUrl(url)) {
        console.log(chalk.red('❌ URL inválida. Use um link do YouTube.'));
        return;
    }

    const folder = playlist || (await askPlaylist());
    const start = Date.now();
    console.log(chalk.cyanBright('\n⏳ Baixando áudio...'));
    notify('Horizon CLI', 'Baixando música...', 'progresso');

    const res = await downloadOne({ target: url, playlist: folder });
    clearNotification();

    if (res.ok) {
        console.log(chalk.green(`✅ Concluído em ${formatDuration(Date.now() - start)} — ${res.dir}`));
        notify('Horizon CLI', '✅ Música baixada!', 'sucesso');
    } else {
        console.log(chalk.red('❌ Falha no download após tentativas.'));
        notify('Horizon CLI', '❌ Erro no download.', 'erro');
    }
}

async function doBatch(items, options = {}) {
    const list = items.filter(Boolean);
    if (!list.length) {
        console.log(chalk.yellow('⚠️  Lista vazia.'));
        return;
    }

    const folder = options.playlist || (await askPlaylist());
    const settings = loadSettings();
    const concurrency = options.concurrency || settings.concurrency;

    const start = Date.now();
    console.log(
        chalk.yellow(
            `\n🚀 Modo lote: ${list.length} itens | pasta: ${folder} | paralelo: ${concurrency}\n`,
        ),
    );

    const bar = new cliProgress.SingleBar(
        {
            format:
                chalk.cyan(' {bar}') +
                ' {percentage}% | {value}/{total} | ' +
                chalk.gray('{task}'),
            barCompleteChar: '█',
            barIncompleteChar: '░',
            hideCursor: true,
        },
        cliProgress.Presets.shades_classic,
    );
    bar.start(list.length, 0, { task: 'iniciando...' });

    const results = await downloadBatch(list, {
        playlist: folder,
        concurrency,
        onProgress: (ev) => {
            if (ev.type === 'end') {
                bar.update(ev.done, { task: ev.target.slice(0, 60) });
                notify(
                    'Horizon CLI (Lote)',
                    `[${ev.done}/${ev.total}] ${ev.target}`,
                    'progresso',
                );
            }
        },
    });
    bar.stop();
    clearNotification();

    const ok = results.filter((r) => r.ok).length;
    const err = results.length - ok;
    console.log(
        chalk.green(`\n🎉 Concluído em ${formatDuration(Date.now() - start)}: `) +
            chalk.green(`${ok} ok`) +
            (err ? chalk.red(`, ${err} falhas`) : ''),
    );
    notify('Horizon CLI', `🎉 Lote pronto: ${ok}/${results.length}`, 'sucesso');
}

async function doPlaylistUrl(url, playlist) {
    if (isOtherPlatform(url)) {
        showOtherPlatformsTip();
        return;
    }
    if (!isYoutubeUrl(url)) {
        console.log(chalk.red('❌ URL inválida. Use um link de playlist do YouTube.'));
        return;
    }
    const folder = playlist || (await askPlaylist('MinhaPlaylist'));
    console.log(chalk.cyanBright(`\n⏳ Baixando playlist em massa para "${folder}"...\n`));
    notify('Horizon CLI', `Baixando playlist ${folder}...`, 'progresso');

    const res = await downloadPlaylist({ url, playlist: folder });
    clearNotification();

    if (res.ok) {
        console.log(chalk.green(`\n✅ Playlist completa: ${res.dir}`));
        notify('Horizon CLI', `✅ Playlist ${folder} pronta!`, 'sucesso');
    } else {
        console.log(chalk.red('\n❌ Erro ao baixar a playlist.'));
        notify('Horizon CLI', '❌ Erro na playlist.', 'erro');
    }
}

async function browseLocalPlaylists() {
    const folders = listPlaylistFolders();
    if (!folders.length) {
        console.log(chalk.yellow('⚠️  Nenhuma playlist baixada ainda.'));
        return;
    }
    const { folder } = await inquirer.prompt([
        {
            type: 'rawlist',
            name: 'folder',
            message: 'Playlists locais:',
            choices: [...folders, '⬅️  Voltar'],
        },
    ]);
    if (folder.startsWith('⬅️')) return;

    const full = path.join(getMusicBaseDir(), folder);
    const files = listAudioFiles(full);
    console.log(chalk.blueBright(`\n📁 ${full}  (${files.length} arquivos)\n`));
    files.forEach((f) => console.log(chalk.white(`  • ${f}`)));
    console.log('');
    await inquirer.prompt([{ type: 'input', name: 'back', message: 'Enter para voltar...' }]);
    return browseLocalPlaylists();
}

async function doConfig() {
    const answers = await askSettings();
    const saved = saveSettings(answers);
    console.log(chalk.green('\n✅ Preferências salvas:'));
    console.log(chalk.gray(JSON.stringify(saved, null, 2)));
}

function doHistory({ clear = false } = {}) {
    if (clear) {
        clearHistory();
        console.log(chalk.green('✅ Histórico limpo.'));
        return;
    }
    const entries = loadHistory();
    const s = summary();
    console.log(
        chalk.blueBright(
            `\n📜 Histórico: ${s.total} entradas | ${chalk.green(s.ok + ' ok')} | ${chalk.red(s.err + ' erros')}\n`,
        ),
    );

    const top = topPlaylists(5);
    if (top.length) {
        console.log(chalk.cyan('  🏆 Top playlists:'));
        top.forEach(({ playlist, count }) => {
            console.log(`    ${chalk.white(playlist)}  ${chalk.gray(`(${count})`)}`);
        });
        console.log('');
    }

    entries
        .slice(-20)
        .reverse()
        .forEach((e) => {
            const icon = e.status === 'ok' ? chalk.green('✓') : chalk.red('✗');
            const when = e.ts?.slice(0, 16).replace('T', ' ');
            console.log(`${icon} ${chalk.gray(when)}  [${e.playlist || '-'}]  ${e.target}`);
        });
    if (entries.length > 20) {
        console.log(chalk.gray(`\n  ... mostrando últimas 20 de ${entries.length}`));
    }
}

async function doSubsAdd({ url, playlist, name }) {
    if (!url) {
        const ans = await inquirer.prompt([
            { type: 'input', name: 'url', message: 'URL da playlist / canal do YouTube:' },
            { type: 'input', name: 'playlist', message: 'Pasta de destino:', default: 'Inscricoes' },
            { type: 'input', name: 'name', message: 'Nome amigável (opcional):' },
        ]);
        url = ans.url;
        playlist = playlist || ans.playlist;
        name = name || ans.name;
    }
    try {
        const sub = addSubscription({ url, playlist, name });
        console.log(chalk.green(`✅ Inscrito: ${sub.name} → ${sub.playlist}  (id ${sub.id})`));
    } catch (err) {
        console.log(chalk.red(`❌ ${err.message}`));
    }
}

function doSubsList() {
    const list = listSubscriptions();
    if (!list.length) {
        console.log(chalk.yellow('⚠️  Nenhuma inscrição. Use `horizon subs add`.'));
        return;
    }
    console.log(chalk.blueBright(`\n🔔 Inscrições (${list.length}):\n`));
    list.forEach((s) => {
        const last = s.lastSync ? s.lastSync.slice(0, 16).replace('T', ' ') : 'nunca';
        console.log(
            `  ${chalk.gray(s.id)}  ${chalk.white(s.name)}  ` +
                chalk.gray(`→ ${s.playlist}  · sync: ${last}`),
        );
        console.log(`    ${chalk.gray(s.url)}`);
    });
    console.log('');
}

function doSubsRemove(idOrUrl) {
    if (!idOrUrl) {
        console.log(chalk.red('❌ Informe o id ou URL da inscrição.'));
        return;
    }
    if (removeSubscription(idOrUrl)) {
        console.log(chalk.green('✅ Inscrição removida.'));
    } else {
        console.log(chalk.red('❌ Não encontrada.'));
    }
}

async function doSync({ runNow = true } = {}) {
    const spinner = createSpinner('Sincronizando inscrições...').start();
    const res = await syncAll({
        onProgress: (ev) => {
            if (ev.type === 'sub_end') {
                spinner.update({
                    text: `${ev.sub.name}: ${ev.fresh} novos / ${ev.total}`,
                });
            }
        },
    });
    spinner.success({
        text: `Checadas ${res.subs} inscrições · ${res.checked} vídeos · ${res.enqueued} enfileirados.`,
    });

    if (runNow && res.enqueued > 0) {
        console.log(chalk.cyanBright('\n🚀 Executando fila...\n'));
        const out = await runQueue();
        console.log(
            chalk.green(`\n✅ Processados ${out.processed}: ${out.ok} ok, ${out.err} err.`),
        );
    }
}

async function doQueueRun() {
    const stats = queueStats();
    if (!stats.pending) {
        console.log(chalk.yellow('⚠️  Fila vazia.'));
        return;
    }
    console.log(chalk.cyan(`\n🚀 Rodando fila (${stats.pending} itens)...\n`));
    const out = await runQueue();
    console.log(chalk.green(`\n✅ ${out.ok} ok, ${out.err} err (total ${out.processed}).`));
}

function doQueueList() {
    const stats = queueStats();
    const preview = previewQueue(10);
    console.log(
        chalk.blueBright(
            `\n📥 Fila — pendente: ${stats.pending} · concluída: ${stats.completed} · falhou: ${stats.failed}\n`,
        ),
    );
    if (preview.length) {
        console.log(chalk.cyan('  Próximos:'));
        preview.forEach((j, i) => {
            console.log(
                `  ${String(i + 1).padStart(2)}. ${chalk.white(j.target.slice(0, 70))}  ` +
                    chalk.gray(`→ ${j.playlist}`),
            );
        });
    }
    console.log('');
}

function doQueueClear(scope) {
    clearQueue(scope || 'all');
    console.log(chalk.green(`✅ Fila limpa (${scope || 'all'}).`));
}

function doQueueRetry() {
    const moved = retryFailed();
    console.log(chalk.green(`✅ Movidos ${moved} itens de failed → pending.`));
}

function doExport(folder) {
    if (!folder) {
        console.log(chalk.red('❌ Informe a pasta. Ex: horizon export Favs'));
        return;
    }
    const res = exportAll(folder);
    if (res.m3u.ok) {
        console.log(chalk.green(`✅ M3U: ${res.m3u.file} (${res.m3u.count} faixas)`));
    } else {
        console.log(chalk.yellow(`⚠️  M3U: pasta vazia ou inexistente.`));
    }
    if (res.readme.ok) {
        console.log(chalk.green(`✅ README: ${res.readme.file}`));
    }
}

async function doLyrics(folder) {
    if (!folder) {
        console.log(chalk.red('❌ Informe a pasta. Ex: horizon lyrics Favs'));
        return;
    }
    const full = path.join(getMusicBaseDir(), folder);
    if (!fs.existsSync(full)) {
        console.log(chalk.red(`❌ Pasta não encontrada: ${full}`));
        return;
    }
    const spinner = createSpinner('Buscando letras...').start();
    const res = await saveLyricsForFolder(full, ({ index, total, file, status }) => {
        spinner.update({
            text: `[${index + 1}/${total}] ${status} — ${path.basename(file)}`,
        });
    });
    spinner.success({
        text: `Letras — total ${res.found} · salvas ${res.saved} · ignoradas ${res.skipped}`,
    });
}

function doLogs({ n = 50, showPath = false }) {
    if (showPath) {
        console.log(getLogPath());
        console.log(chalk.gray('dir: ') + getLogDir());
        return;
    }
    const lines = tailLogs(n);
    if (!lines.length) {
        console.log(chalk.yellow('⚠️  Nenhum log ainda.'));
        return;
    }
    console.log(chalk.blueBright(`\n📝 Últimas ${lines.length} linhas:\n`));
    for (const l of lines) {
        if (l.includes(' ERROR ')) console.log(chalk.red(l));
        else if (l.includes(' WARN ')) console.log(chalk.yellow(l));
        else console.log(chalk.gray(l));
    }
}

function doUpdate({ ytdlp, self, all }) {
    const targets = all
        ? { ytdlp: true, self: true }
        : { ytdlp: Boolean(ytdlp), self: Boolean(self) };
    if (!targets.ytdlp && !targets.self) {
        console.log(chalk.yellow('⚠️  Nada a fazer. Use --ytdlp, --self ou --all.'));
        return;
    }
    if (targets.ytdlp) updateYtDlp();
    if (targets.self) updateSelf();
}

function doCompletion(shell) {
    const script = getCompletion(shell);
    if (!script) {
        console.log(chalk.red(`❌ Shell não suportado: ${shell}. Use bash, zsh ou fish.`));
        process.exit(1);
    }
    process.stdout.write(script);
}

// ============================================================
//  MENU INTERATIVO
// ============================================================

async function mainMenu() {
    showSplash();
    const q = queueStats();
    if (q.pending) {
        console.log(chalk.yellow(`  ⚡ Fila pendente: ${q.pending} itens. Use "Fila" no menu.\n`));
    }
    const { action } = await inquirer.prompt([
        {
            type: 'rawlist',
            name: 'action',
            message: 'Menu Principal:',
            choices: [
                { name: '🔍  Buscar (nome / link / lote)', value: 'search' },
                { name: '📥  Baixar playlist do YouTube', value: 'playlist_link' },
                { name: '🔔  Inscrições (auto-sync)', value: 'subs' },
                { name: '📦  Fila de downloads', value: 'queue' },
                { name: '📁  Ver arquivos baixados', value: 'browse' },
                { name: '📊  Dashboard', value: 'dashboard' },
                { name: '📜  Histórico', value: 'history' },
                { name: '⚙️   Configurações', value: 'config' },
                { name: '🎤  Baixar letras (.lrc) de uma pasta', value: 'lyrics' },
                { name: '📤  Exportar .m3u + README de uma pasta', value: 'export' },
                { name: '📝  Ver logs', value: 'logs' },
                { name: '🔄  Atualizar yt-dlp / Horizon', value: 'update' },
                { name: '🩺  Doctor (checar dependências)', value: 'doctor' },
                { name: '❌  Sair', value: 'exit' },
            ],
        },
    ]);

    switch (action) {
        case 'search': {
            const { query } = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'query',
                    message: 'Busca (nome, URL, ou lote separado por vírgula):',
                },
            ]);
            if (!query) break;
            const items = query.split(',').map((i) => i.trim()).filter(Boolean);
            if (items.length > 1) {
                await doBatch(items);
            } else if (isYoutubeUrl(items[0])) {
                await doUrl(items[0]);
            } else {
                await doSingleSearch(items[0]);
            }
            break;
        }
        case 'playlist_link': {
            showOtherPlatformsTip();
            const { url } = await inquirer.prompt([
                { type: 'input', name: 'url', message: 'URL da playlist do YouTube:' },
            ]);
            if (url) await doPlaylistUrl(url);
            break;
        }
        case 'subs': {
            const { subAction } = await inquirer.prompt([
                {
                    type: 'rawlist',
                    name: 'subAction',
                    message: 'Inscrições:',
                    choices: [
                        { name: 'Listar', value: 'list' },
                        { name: 'Adicionar', value: 'add' },
                        { name: 'Remover', value: 'remove' },
                        { name: 'Sincronizar agora', value: 'sync' },
                        { name: '⬅️  Voltar', value: 'back' },
                    ],
                },
            ]);
            if (subAction === 'list') doSubsList();
            else if (subAction === 'add') await doSubsAdd({});
            else if (subAction === 'remove') {
                doSubsList();
                const { id } = await inquirer.prompt([
                    { type: 'input', name: 'id', message: 'ID da inscrição:' },
                ]);
                if (id) doSubsRemove(id);
            } else if (subAction === 'sync') await doSync({ runNow: true });
            break;
        }
        case 'queue': {
            const { qAction } = await inquirer.prompt([
                {
                    type: 'rawlist',
                    name: 'qAction',
                    message: 'Fila:',
                    choices: [
                        { name: 'Listar', value: 'list' },
                        { name: 'Rodar', value: 'run' },
                        { name: 'Tentar de novo os falhos', value: 'retry' },
                        { name: 'Limpar tudo', value: 'clear' },
                        { name: '⬅️  Voltar', value: 'back' },
                    ],
                },
            ]);
            if (qAction === 'list') doQueueList();
            else if (qAction === 'run') await doQueueRun();
            else if (qAction === 'retry') doQueueRetry();
            else if (qAction === 'clear') doQueueClear('all');
            break;
        }
        case 'browse':
            await browseLocalPlaylists();
            break;
        case 'dashboard':
            renderDashboard();
            break;
        case 'history':
            doHistory();
            break;
        case 'config':
            await doConfig();
            break;
        case 'lyrics': {
            const folders = listPlaylistFolders();
            if (!folders.length) {
                console.log(chalk.yellow('⚠️  Nenhuma pasta encontrada.'));
                break;
            }
            const { folder } = await inquirer.prompt([
                { type: 'rawlist', name: 'folder', message: 'Pasta:', choices: folders },
            ]);
            await doLyrics(folder);
            break;
        }
        case 'export': {
            const folders = listPlaylistFolders();
            if (!folders.length) {
                console.log(chalk.yellow('⚠️  Nenhuma pasta encontrada.'));
                break;
            }
            const { folder } = await inquirer.prompt([
                { type: 'rawlist', name: 'folder', message: 'Pasta:', choices: folders },
            ]);
            doExport(folder);
            break;
        }
        case 'logs':
            doLogs({ n: 40 });
            break;
        case 'update': {
            const { what } = await inquirer.prompt([
                {
                    type: 'rawlist',
                    name: 'what',
                    message: 'O que atualizar?',
                    choices: [
                        { name: 'yt-dlp', value: 'ytdlp' },
                        { name: 'Horizon (git pull + npm i)', value: 'self' },
                        { name: 'Tudo', value: 'all' },
                        { name: '⬅️  Voltar', value: 'back' },
                    ],
                },
            ]);
            if (what !== 'back') doUpdate({ [what]: true });
            break;
        }
        case 'doctor':
            checkDependencies();
            break;
        case 'exit':
            console.log(chalk.green('\n👋  Até a próxima.\n'));
            process.exit(0);
    }

    await inquirer.prompt([{ type: 'input', name: 'next', message: '\nEnter para voltar ao menu...' }]);
    return mainMenu();
}

// ============================================================
//  COMMANDER
// ============================================================

const program = new Command();
program
    .name('horizon')
    .description('Horizon CLI — ecossistema musical no terminal')
    .version('2.1.0');

program
    .command('search <termo...>')
    .description('Buscar e baixar uma música do YouTube')
    .option('-p, --playlist <nome>', 'pasta de destino')
    .action(async (termo, opts) => {
        requireDependencies();
        await doSingleSearch(termo.join(' '), opts.playlist);
        process.exit(0);
    });

program
    .command('url <link>')
    .description('Baixar a partir de uma URL do YouTube')
    .option('-p, --playlist <nome>', 'pasta de destino')
    .action(async (link, opts) => {
        requireDependencies();
        await doUrl(link, opts.playlist);
        process.exit(0);
    });

program
    .command('batch <lista>')
    .description('Baixar várias músicas (separadas por vírgula)')
    .option('-p, --playlist <nome>', 'pasta de destino')
    .option(
        '-c, --concurrency <n>',
        `downloads simultâneos (1-${MAX_CONCURRENCY})`,
        (v) => Math.min(Math.max(parseInt(v, 10) || 1, 1), MAX_CONCURRENCY),
    )
    .action(async (lista, opts) => {
        requireDependencies();
        const items = lista.split(',').map((i) => i.trim()).filter(Boolean);
        await doBatch(items, opts);
        process.exit(0);
    });

program
    .command('playlist <url>')
    .description('Baixar playlist inteira do YouTube')
    .option('-p, --playlist <nome>', 'pasta de destino')
    .action(async (url, opts) => {
        requireDependencies();
        await doPlaylistUrl(url, opts.playlist);
        process.exit(0);
    });

program
    .command('history')
    .description('Mostrar ou limpar o histórico de downloads')
    .option('--clear', 'limpar histórico')
    .action((opts) => {
        doHistory(opts);
        process.exit(0);
    });

program
    .command('config')
    .description('Editar preferências (formato, qualidade, concorrência...)')
    .action(async () => {
        await doConfig();
        process.exit(0);
    });

program
    .command('doctor')
    .description('Verificar se yt-dlp e ffmpeg estão instalados')
    .action(() => {
        const { allOk } = checkDependencies();
        process.exit(allOk ? 0 : 1);
    });

program
    .command('stats')
    .description('Dashboard (gráfico + resumo)')
    .action(() => {
        renderDashboard();
        process.exit(0);
    });

program
    .command('logs')
    .description('Ver logs do Horizon')
    .option('-n, --lines <n>', 'número de linhas (padrão 50)', (v) => parseInt(v, 10))
    .option('--path', 'mostrar apenas o caminho do arquivo de log')
    .action((opts) => {
        doLogs({ n: opts.lines || 50, showPath: Boolean(opts.path) });
        process.exit(0);
    });

program
    .command('update')
    .description('Atualizar yt-dlp e/ou o próprio Horizon')
    .option('--ytdlp', 'atualizar yt-dlp')
    .option('--self', 'atualizar o Horizon (git pull + npm i)')
    .option('--all', 'atualizar tudo')
    .action((opts) => {
        doUpdate(opts);
        process.exit(0);
    });

const subsCmd = program
    .command('subs')
    .description('Gerenciar inscrições (playlists/canais)');
subsCmd
    .command('list')
    .description('Listar inscrições')
    .action(() => {
        doSubsList();
        process.exit(0);
    });
subsCmd
    .command('add <url>')
    .description('Adicionar inscrição')
    .option('-p, --playlist <nome>', 'pasta de destino')
    .option('-n, --name <nome>', 'nome amigável')
    .action(async (url, opts) => {
        await doSubsAdd({ url, playlist: opts.playlist, name: opts.name });
        process.exit(0);
    });
subsCmd
    .command('remove <id>')
    .description('Remover inscrição (por id ou URL)')
    .action((id) => {
        doSubsRemove(id);
        process.exit(0);
    });

program
    .command('sync')
    .description('Sincronizar inscrições (enfileira novos e roda)')
    .option('--no-run', 'apenas enfileirar, não baixar agora')
    .action(async (opts) => {
        requireDependencies();
        await doSync({ runNow: opts.run !== false });
        process.exit(0);
    });

const queueCmd = program
    .command('queue')
    .description('Gerenciar fila persistente');
queueCmd
    .command('list')
    .description('Ver fila')
    .action(() => {
        doQueueList();
        process.exit(0);
    });
queueCmd
    .command('run')
    .description('Processar fila pendente')
    .action(async () => {
        requireDependencies();
        await doQueueRun();
        process.exit(0);
    });
queueCmd
    .command('retry')
    .description('Re-enfileirar os itens que falharam')
    .action(() => {
        doQueueRetry();
        process.exit(0);
    });
queueCmd
    .command('clear [scope]')
    .description('Limpar fila (all | pending | completed | failed)')
    .action((scope) => {
        doQueueClear(scope);
        process.exit(0);
    });

program
    .command('export <playlist>')
    .description('Gerar .m3u + README.md para uma pasta de playlist')
    .action((folder) => {
        doExport(folder);
        process.exit(0);
    });

program
    .command('lyrics <playlist>')
    .description('Baixar letras .lrc das músicas de uma pasta')
    .action(async (folder) => {
        await doLyrics(folder);
        process.exit(0);
    });

program
    .command('completion <shell>')
    .description('Gerar script de auto-complete (bash|zsh|fish)')
    .action((shell) => {
        doCompletion(shell);
        process.exit(0);
    });

// Sem argumentos: menu interativo.
if (process.argv.length <= 2) {
    requireDependencies();
    mainMenu().catch((err) => {
        log.error('fatal', err);
        console.error(chalk.red('Erro fatal:'), err);
        process.exit(1);
    });
} else {
    program.parseAsync(process.argv).catch((err) => {
        log.error('cli', err);
        console.error(chalk.red('Erro:'), err);
        process.exit(1);
    });
}

// Graceful shutdown.
process.on('SIGINT', () => {
    clearNotification();
    console.log(chalk.yellow('\n\n👋  Interrompido pelo usuário.'));
    process.exit(130);
});
