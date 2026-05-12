#!/usr/bin/env node

/**
 * HORIZON CLI — Entry point
 * Modo interativo (menu) quando chamado sem argumentos.
 * Modo subcomando (commander) para uso por scripts / power users.
 *
 * Uso:
 *   horizon                         # menu interativo
 *   horizon search "nome da musica" [--playlist Geral]
 *   horizon url <link> [--playlist Geral]
 *   horizon batch "m1, m2, m3" [--playlist Favs --concurrency 3]
 *   horizon playlist <url-playlist-yt> [--playlist MinhaLista]
 *   horizon config
 *   horizon history [--clear]
 *   horizon doctor
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
import { loadHistory, clearHistory, summary } from './src/history.js';
import { showSplash, showOtherPlatformsTip, askPlaylist, askSettings } from './src/ui.js';

// ============================================================
//  AÇÕES DE ALTO NÍVEL (compartilhadas entre CLI e menu)
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
    } catch (err) {
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

    if (err) {
        console.log(chalk.gray('   Falhas registradas em ~/.horizon/history.json'));
    }
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

function listLocalPlaylistsSync() {
    const base = getMusicBaseDir();
    if (!fs.existsSync(base)) return [];
    return fs
        .readdirSync(base)
        .filter((f) => fs.statSync(path.join(base, f)).isDirectory());
}

async function browseLocalPlaylists() {
    const folders = listLocalPlaylistsSync();
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
    const files = fs.readdirSync(full).filter((f) => /\.(mp3|m4a|opus|flac)$/i.test(f));
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

// ============================================================
//  MENU INTERATIVO
// ============================================================

async function mainMenu() {
    showSplash();
    const { action } = await inquirer.prompt([
        {
            type: 'rawlist',
            name: 'action',
            message: 'Menu Principal:',
            choices: [
                { name: '🔍  Buscar (nome / link / lote)', value: 'search' },
                { name: '📥  Baixar Playlist completa do YouTube', value: 'playlist_link' },
                { name: '📁  Ver arquivos baixados', value: 'browse' },
                { name: '📜  Histórico', value: 'history' },
                { name: '⚙️   Configurações', value: 'config' },
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
        case 'browse':
            await browseLocalPlaylists();
            break;
        case 'history':
            doHistory();
            await inquirer.prompt([{ type: 'input', name: 'back', message: '\nEnter para voltar...' }]);
            break;
        case 'config':
            await doConfig();
            break;
        case 'doctor':
            checkDependencies();
            await inquirer.prompt([{ type: 'input', name: 'back', message: '\nEnter para voltar...' }]);
            break;
        case 'exit':
            console.log(chalk.green('\n👋  Até a próxima.\n'));
            process.exit(0);
    }

    await inquirer.prompt([{ type: 'input', name: 'next', message: '\nEnter para voltar ao menu...' }]);
    return mainMenu();
}

// ============================================================
//  COMMANDER — subcomandos
// ============================================================

const program = new Command();
program
    .name('horizon')
    .description('Horizon CLI — ecossistema musical no terminal')
    .version('2.0.0');

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

// Se nenhum subcomando foi passado, abrir menu interativo.
if (process.argv.length <= 2) {
    requireDependencies();
    mainMenu().catch((err) => {
        console.error(chalk.red('Erro fatal:'), err);
        process.exit(1);
    });
} else {
    program.parseAsync(process.argv).catch((err) => {
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
