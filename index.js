#!/usr/bin/env node

/**
 * HORIZON CLI — Entry point (v2.2 "Anti-Ban")
 *
 * Modos:
 *   horizon                         # menu interativo
 *   horizon search <termo>          # buscar + baixar
 *   horizon url <link>              # baixar de URL
 *   horizon batch "a, b, c"         # lote
 *   horizon playlist <url>          # playlist YT inteira
 *   horizon config                  # editar preferências (seções em PT)
 *   horizon history [--clear]
 *   horizon doctor
 *   horizon stats
 *   horizon logs [-n 50] [--path]
 *   horizon update [--ytdlp] [--self] [--all]
 *   horizon subs <add|list|remove>
 *   horizon sync
 *   horizon queue <run|retry|clear|list>
 *   horizon export <playlist>
 *   horizon lyrics <playlist>
 *   horizon completion <bash|zsh|fish>
 *
 * Novos em v2.2:
 *   horizon antiban <status|reset|test>
 *   horizon scan [--rebuild]
 *   horizon backup [--out <file>]
 *   horizon restore <file> [--no-merge]
 *   horizon health
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
import { showSplash, showOtherPlatformsTip, askPlaylist, settingsMenu } from './src/ui.js';
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
import {
    circuitStatus,
    circuitOpen,
    resetCircuit,
    ANTIBAN_MODES,
} from './src/antiban.js';
import { rebuildArchive, scanLibrary } from './src/scanner.js';
import { createBackup, restoreBackup } from './src/backup.js';
import { runHealthCheck, prettyPrintHealth } from './src/health.js';
import { resolveAndDownload, previewSpotifyLink, detectPlatform } from './src/spotify.js';
import { universalResolve, universalPreview, detectSource, supportedPlatforms } from './src/playlistResolver.js';
import { listFavorites, addFavorite, removeFavorite, favoritesCount, exportFavoritesAsTerms, clearFavorites } from './src/favorites.js';
import { play, listPlayable, detectPlayer } from './src/player.js';
import { planOrganize, executeOrganize, printPlan } from './src/organizer.js';
import { listProfiles, saveProfile, loadProfile, deleteProfile, printProfiles } from './src/profiles.js';
import { notifyCustom, getPushStatus } from './src/pushNotify.js';
import { startWebServer } from './src/webServer.js';

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
        spinner.error({ text: 'Erro na busca. Verifique a conexão ou aumente a proteção anti-ban.' });
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
            `\n🚀 Modo lote: ${list.length} itens | pasta: ${folder} | paralelos: ${concurrency} | proteção: ${settings.antibanMode}\n`,
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
                notify('Horizon CLI (Lote)', `[${ev.done}/${ev.total}] ${ev.target}`, 'progresso');
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

    const st = circuitStatus();
    if (st.openedAt) {
        console.log(
            chalk.yellow(
                `\n⛔ Proteção anti-ban foi ativada (${st.reason}). ` +
                    `Rode \`horizon antiban status\` ou aumente o perfil em \`horizon config\`.`,
            ),
        );
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
        console.log(chalk.cyan('  🏆 Pastas mais usadas:'));
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
        console.log(chalk.green(`\n✅ Processados ${out.processed}: ${out.ok} ok, ${out.err} err.`));
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

// -------------------- Novos em v2.2 --------------------

function doAntibanStatus() {
    const settings = loadSettings();
    const mode = ANTIBAN_MODES[settings.antibanMode] || ANTIBAN_MODES.seguro;
    const st = circuitStatus();
    const open = circuitOpen();
    console.log(chalk.blueBright('\n🛡️  Proteção anti-bloqueio\n'));
    console.log(chalk.white('  Perfil atual: ') + chalk.yellow(settings.antibanMode));
    console.log(chalk.gray(`    ${mode.label}`));
    console.log(
        chalk.white('  Cookies:      ') +
            (settings.useCookies ? chalk.green(`on (${settings.cookiesBrowser})`) : chalk.gray('off')),
    );
    console.log(
        chalk.white('  User-Agent:   ') +
            (settings.rotateUserAgent ? chalk.green('rotativo') : chalk.gray('fixo')),
    );
    console.log(
        chalk.white('  Geo-bypass:   ') + (settings.geoBypass ? chalk.green('on') : chalk.gray('off')),
    );
    console.log(chalk.white('\n  Circuit breaker:'));
    console.log(chalk.gray(`    falhas seguidas: ${st.failures || 0}`));
    if (open.open) {
        const min = Math.ceil(open.remainingMs / 60_000);
        console.log(chalk.red(`    ABERTO (~${min}min restantes) — motivo: ${open.reason}`));
    } else {
        console.log(chalk.green('    FECHADO — tudo certo'));
    }
    console.log('');
}

function doAntibanReset() {
    resetCircuit();
    console.log(chalk.green('✅ Circuit breaker resetado. Downloads liberados.'));
}

async function doAntibanTest() {
    console.log(chalk.cyan('\n🧪 Testando download com a proteção atual...\n'));
    const report = await runHealthCheck();
    prettyPrintHealth(report);
}

function doScan({ rebuild = false } = {}) {
    console.log(chalk.cyan('\n🔎 Escaneando biblioteca local...\n'));
    const spinner = createSpinner('lendo arquivos...').start();
    let lastFolder = '';
    const fn = rebuild ? rebuildArchive : scanLibrary;
    const res = fn({
        onProgress: ({ folder, totalScanned }) => {
            if (folder !== lastFolder) {
                lastFolder = folder;
                spinner.update({ text: `[${totalScanned}] ${folder}` });
            }
        },
    });
    spinner.success({
        text: `${res.found} arquivos, ${res.withId} com video_id identificável.`,
    });
    if (rebuild) {
        console.log(chalk.green(`✅ Arquivo dedup ganhou ${res.added} novas entradas.`));
        console.log(chalk.gray(`   ${res.archiveFile}`));
    }
    if (res.missing?.length) {
        const sample = res.missing.slice(0, 3).map((m) => '    - ' + m).join('\n');
        console.log(
            chalk.yellow(
                `\n⚠️  ${res.missing.length} arquivos sem video_id detectável (eles não serão protegidos pelo dedup).\n${sample}${res.missing.length > 3 ? '\n    ...' : ''}`,
            ),
        );
    }
}

function doBackup({ out } = {}) {
    const res = createBackup(out);
    if (res.ok) console.log(chalk.green(`✅ Backup salvo em: ${res.file}`));
}

function doRestore(file, { merge = true } = {}) {
    if (!file) {
        console.log(chalk.red('❌ Informe o arquivo de backup.'));
        return;
    }
    const res = restoreBackup(file, { merge });
    if (res.ok) {
        console.log(chalk.green(`✅ Restaurado: ${res.restored.join(', ')}`));
    } else {
        console.log(chalk.red(`❌ ${res.reason}`));
    }
}

async function doHealth() {
    const report = await runHealthCheck();
    prettyPrintHealth(report);
}

// ============================================================
//  MENU INTERATIVO
// ============================================================

async function mainMenu() {
    showSplash();

    const q = queueStats();
    if (q.pending) {
        console.log(chalk.yellow(`  ⚡ Fila pendente: ${q.pending} itens. Use "Fila" no menu.`));
    }
    const circuit = circuitOpen();
    if (circuit.open) {
        const min = Math.ceil(circuit.remainingMs / 60_000);
        console.log(
            chalk.redBright(
                `  ⛔ Proteção anti-ban ATIVA (~${min}min) — motivo: ${circuit.reason}`,
            ),
        );
    }
    console.log('');

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
                { name: '🛡️   Proteção anti-bloqueio', value: 'antiban' },
                { name: '🩺  Diagnóstico (doctor + health)', value: 'diagnose' },
                { name: '🔎  Escanear biblioteca (reconstruir dedup)', value: 'scan' },
                { name: '💾  Backup / Restaurar', value: 'backup' },
                { name: '🎤  Baixar letras (.lrc) de uma pasta', value: 'lyrics' },
                { name: '📤  Exportar .m3u + README de uma pasta', value: 'export' },
                { name: '🟢  Spotify / Deezer / Apple / Tidal / SoundCloud', value: 'spotify' },
                { name: '⭐  Favoritos', value: 'favorites' },
                { name: '🎵  Player (tocar no terminal)', value: 'player' },
                { name: '🗂️   Organizar biblioteca por artista', value: 'organize' },
                { name: '🎚️   Perfis de configuração', value: 'profiles' },
                { name: '🌐  Web Dashboard', value: 'web' },
                { name: '📝  Ver logs', value: 'logs' },
                { name: '🔄  Atualizar yt-dlp / Horizon', value: 'update' },
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
            await settingsMenu();
            break;
        case 'antiban': {
            const { a } = await inquirer.prompt([
                {
                    type: 'rawlist',
                    name: 'a',
                    message: 'Proteção anti-bloqueio:',
                    choices: [
                        { name: 'Ver status', value: 'status' },
                        { name: 'Rodar teste de download', value: 'test' },
                        { name: 'Resetar circuit breaker', value: 'reset' },
                        { name: 'Editar perfil em Configurações', value: 'cfg' },
                        { name: '⬅️  Voltar', value: 'back' },
                    ],
                },
            ]);
            if (a === 'status') doAntibanStatus();
            else if (a === 'test') await doAntibanTest();
            else if (a === 'reset') doAntibanReset();
            else if (a === 'cfg') await settingsMenu();
            break;
        }
        case 'diagnose': {
            checkDependencies();
            await doHealth();
            break;
        }
        case 'scan': {
            const { rebuild } = await inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'rebuild',
                    message: 'Reconstruir o arquivo de dedup com o que for encontrado?',
                    default: true,
                },
            ]);
            doScan({ rebuild });
            break;
        }
        case 'backup': {
            const { b } = await inquirer.prompt([
                {
                    type: 'rawlist',
                    name: 'b',
                    message: 'Backup / Restore:',
                    choices: [
                        { name: 'Criar backup', value: 'create' },
                        { name: 'Restaurar (mesclando)', value: 'restore' },
                        { name: '⬅️  Voltar', value: 'back' },
                    ],
                },
            ]);
            if (b === 'create') doBackup();
            else if (b === 'restore') {
                const { file } = await inquirer.prompt([
                    { type: 'input', name: 'file', message: 'Caminho do arquivo de backup:' },
                ]);
                if (file) doRestore(file);
            }
            break;
        }
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
        case 'spotify': {
            const { sub } = await inquirer.prompt([
                {
                    type: 'rawlist',
                    name: 'sub',
                    message: '🟢 Spotify / Deezer / Apple Music / Tidal / SoundCloud:',
                    choices: [
                        { name: '🎵 Baixar uma faixa (link)', value: 'track' },
                        { name: '📦 Baixar uma playlist / álbum (link)', value: 'playlist' },
                        { name: '👁️  Preview (mostrar faixas sem baixar)', value: 'preview' },
                        { name: '🌐 Ver plataformas suportadas', value: 'platforms' },
                        { name: '⬅️  Voltar', value: 'back' },
                    ],
                },
            ]);
            if (sub === 'back') break;
            if (sub === 'platforms') {
                const plats = supportedPlatforms();
                console.log(chalk.blueBright('\n🌐 Plataformas suportadas:\n'));
                for (const p of plats) {
                    console.log(`  ${p.emoji}  ${chalk.white(p.name.padEnd(14))} ${chalk.gray(p.patterns.join(', '))}`);
                }
                console.log('');
                break;
            }

            const { url } = await inquirer.prompt([
                { type: 'input', name: 'url', message: 'Cole o link (Spotify / Deezer / Apple / Tidal / SoundCloud):' },
            ]);
            if (!url) break;

            const info = detectSource(url);
            if (!info) {
                console.log(chalk.red('❌ Link não reconhecido. Suportados: YouTube, Spotify, Deezer, SoundCloud, Apple Music, Tidal.'));
                break;
            }

            if (sub === 'preview') {
                const spinner = createSpinner('Extraindo faixas...').start();
                const res = await universalPreview(url);
                spinner.stop();
                if (!res.ok) { console.log(chalk.red(`❌ ${res.error}`)); break; }
                console.log(chalk.blueBright(`\n🎶 ${res.platform} (${res.type}):`));
                if (res.tracks?.length) {
                    res.tracks.slice(0, 50).forEach((t, i) => console.log(chalk.white(`  ${i + 1}. ${t}`)));
                    if (res.tracks.length > 50) console.log(chalk.gray(`  ... e mais ${res.tracks.length - 50}`));
                } else {
                    console.log(chalk.gray(`  ${res.note || 'sem detalhes adicionais'}`));
                }
                console.log('');
                break;
            }

            // sub === 'track' ou 'playlist'
            const folder = await askPlaylist(sub === 'playlist' ? 'MinhaPlaylist' : undefined);
            const spinner = createSpinner(
                `Resolvendo ${info.platform} (${info.type})...`,
            ).start();
            const res = await universalResolve(url, { playlist: folder });
            spinner.stop();
            if (res.ok) {
                const txt = res.downloaded != null
                    ? `${res.downloaded}/${res.tracks || 1} faixas`
                    : `${res.tracks || 1} faixa(s)`;
                console.log(chalk.green(`✅ ${info.platform} pronto: ${txt} → ${folder}`));
                notify('Horizon CLI', `✅ ${info.platform}: ${txt}`, 'sucesso');
            } else {
                console.log(chalk.red(`❌ ${res.error || 'falha no download'}`));
            }
            break;
        }
        case 'favorites': {
            const { fAction } = await inquirer.prompt([
                {
                    type: 'rawlist',
                    name: 'fAction',
                    message: '⭐ Favoritos:',
                    choices: [
                        { name: 'Listar favoritos', value: 'list' },
                        { name: 'Adicionar favorito', value: 'add' },
                        { name: 'Remover favorito', value: 'remove' },
                        { name: 'Baixar TODOS os favoritos', value: 'download' },
                        { name: 'Limpar favoritos', value: 'clear' },
                        { name: '⬅️  Voltar', value: 'back' },
                    ],
                },
            ]);
            if (fAction === 'list') {
                const favs = listFavorites({});
                if (!favs.length) { console.log(chalk.yellow('⭐ Sem favoritos.')); break; }
                console.log(chalk.blueBright(`\n⭐ Favoritos (${favs.length}):\n`));
                favs.forEach((f, i) => {
                    const tags = f.tags?.length ? chalk.gray(` [${f.tags.join(', ')}]`) : '';
                    console.log(`  ${i + 1}. ${chalk.white(f.title)}${f.artist ? chalk.gray(' — ' + f.artist) : ''}${tags}`);
                });
                console.log('');
            } else if (fAction === 'add') {
                const ans = await inquirer.prompt([
                    { type: 'input', name: 'title', message: 'Título / nome da música:' },
                    { type: 'input', name: 'artist', message: 'Artista (opcional):' },
                    { type: 'input', name: 'url', message: 'URL (opcional):' },
                ]);
                if (ans.title) {
                    const r = addFavorite({ title: ans.title, artist: ans.artist, url: ans.url, source: 'cli' });
                    if (r.duplicate) console.log(chalk.yellow('⚠️  Já está nos favoritos.'));
                    else console.log(chalk.green(`✅ Adicionado: ${r.favorite.title}`));
                }
            } else if (fAction === 'remove') {
                const favs = listFavorites({});
                if (!favs.length) { console.log(chalk.yellow('⭐ Sem favoritos.')); break; }
                const { id } = await inquirer.prompt([
                    {
                        type: 'rawlist', name: 'id', message: 'Qual remover?',
                        choices: favs.map((f) => ({ name: `${f.title}${f.artist ? ' — ' + f.artist : ''}`, value: f.id })),
                    },
                ]);
                if (removeFavorite(id)) console.log(chalk.green('✅ Removido.'));
            } else if (fAction === 'download') {
                const terms = exportFavoritesAsTerms();
                if (!terms.length) { console.log(chalk.yellow('⭐ Sem favoritos.')); break; }
                const folder = await askPlaylist('Favoritos');
                await doBatch(terms, { playlist: folder });
            } else if (fAction === 'clear') {
                const { yes } = await inquirer.prompt([
                    { type: 'confirm', name: 'yes', message: 'Apagar TODOS os favoritos?', default: false },
                ]);
                if (yes) { clearFavorites(); console.log(chalk.green('✅ Favoritos limpos.')); }
            }
            break;
        }
        case 'player': {
            const playable = listPlayable();
            if (!playable.length) { console.log(chalk.yellow('⚠️  Nenhuma pasta com áudio.')); break; }
            const { folder } = await inquirer.prompt([
                { type: 'rawlist', name: 'folder', message: 'Qual pasta tocar?', choices: playable.map((p) => `${p.name} (${p.count})`) },
            ]);
            const name = folder.replace(/\s*\(\d+\)$/, '');
            const { shuffle } = await inquirer.prompt([
                { type: 'confirm', name: 'shuffle', message: 'Modo aleatório?', default: false },
            ]);
            await play(name, { shuffle });
            break;
        }
        case 'organize': {
            const folders = listPlaylistFolders();
            if (!folders.length) { console.log(chalk.yellow('⚠️  Nenhuma pasta.')); break; }
            const { folder } = await inquirer.prompt([
                { type: 'rawlist', name: 'folder', message: 'Pasta pra organizar:', choices: folders },
            ]);
            const plan = planOrganize(folder, 'artist');
            printPlan(plan);
            if (plan.ok && plan.moves.length) {
                const { go } = await inquirer.prompt([
                    { type: 'confirm', name: 'go', message: `Mover ${plan.moves.length} arquivo(s)?`, default: false },
                ]);
                if (go) {
                    const res = executeOrganize(plan);
                    console.log(chalk.green(`✅ ${res.moved} movidos.`));
                }
            }
            break;
        }
        case 'profiles': {
            const { pAction } = await inquirer.prompt([
                {
                    type: 'rawlist',
                    name: 'pAction',
                    message: 'Perfis:',
                    choices: [
                        { name: 'Listar', value: 'list' },
                        { name: 'Salvar config atual como perfil', value: 'save' },
                        { name: 'Carregar perfil', value: 'load' },
                        { name: 'Deletar perfil', value: 'delete' },
                        { name: '⬅️  Voltar', value: 'back' },
                    ],
                },
            ]);
            if (pAction === 'list') printProfiles();
            else if (pAction === 'save') {
                const { nome, desc } = await inquirer.prompt([
                    { type: 'input', name: 'nome', message: 'Nome do perfil:' },
                    { type: 'input', name: 'desc', message: 'Descrição (opcional):' },
                ]);
                if (nome) {
                    const r = saveProfile(nome, desc);
                    console.log(r.ok ? chalk.green(`✅ Salvo: ${r.name}`) : chalk.red(`❌ ${r.error}`));
                }
            } else if (pAction === 'load') {
                const profiles = listProfiles();
                if (!profiles.length) { console.log(chalk.yellow('Nenhum perfil.')); break; }
                const { nome } = await inquirer.prompt([
                    { type: 'rawlist', name: 'nome', message: 'Qual perfil?', choices: profiles.map((p) => p.name) },
                ]);
                const r = loadProfile(nome);
                console.log(r.ok ? chalk.green(`✅ Carregado: ${r.name}`) : chalk.red(`❌ ${r.error}`));
            } else if (pAction === 'delete') {
                const profiles = listProfiles();
                if (!profiles.length) { console.log(chalk.yellow('Nenhum perfil.')); break; }
                const { nome } = await inquirer.prompt([
                    { type: 'rawlist', name: 'nome', message: 'Qual perfil deletar?', choices: profiles.map((p) => p.name) },
                ]);
                const r = deleteProfile(nome);
                console.log(r.ok ? chalk.green('✅ Deletado.') : chalk.red(`❌ ${r.error}`));
            }
            break;
        }
        case 'web': {
            console.log(chalk.cyanBright('\n🌐 Iniciando Web Dashboard...\n'));
            startWebServer({ port: 3777 });
            // Não faz break — servidor roda até Ctrl+C.
            return;
        }
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
    .version('2.5.1');

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
    .description('Editar preferências em seções (biblioteca, áudio, desempenho, anti-ban)')
    .action(async () => {
        await settingsMenu();
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
    .command('health')
    .description('Rodar um download de teste pra ver se tudo está funcionando')
    .action(async () => {
        await doHealth();
        process.exit(0);
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

const subsCmd = program.command('subs').description('Gerenciar inscrições (playlists/canais)');
subsCmd.command('list').description('Listar inscrições').action(() => { doSubsList(); process.exit(0); });
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
    .action((id) => { doSubsRemove(id); process.exit(0); });

program
    .command('sync')
    .description('Sincronizar inscrições (enfileira novos e roda)')
    .option('--no-run', 'apenas enfileirar, não baixar agora')
    .action(async (opts) => {
        requireDependencies();
        await doSync({ runNow: opts.run !== false });
        process.exit(0);
    });

const queueCmd = program.command('queue').description('Gerenciar fila persistente');
queueCmd.command('list').description('Ver fila').action(() => { doQueueList(); process.exit(0); });
queueCmd.command('run').description('Processar fila pendente')
    .action(async () => { requireDependencies(); await doQueueRun(); process.exit(0); });
queueCmd.command('retry').description('Re-enfileirar os itens que falharam')
    .action(() => { doQueueRetry(); process.exit(0); });
queueCmd.command('clear [scope]').description('Limpar fila (all | pending | completed | failed)')
    .action((scope) => { doQueueClear(scope); process.exit(0); });

program
    .command('export <playlist>')
    .description('Gerar .m3u + README.md para uma pasta de playlist')
    .action((folder) => { doExport(folder); process.exit(0); });

program
    .command('lyrics <playlist>')
    .description('Baixar letras .lrc das músicas de uma pasta')
    .action(async (folder) => { await doLyrics(folder); process.exit(0); });

program
    .command('completion <shell>')
    .description('Gerar script de auto-complete (bash|zsh|fish)')
    .action((shell) => { doCompletion(shell); process.exit(0); });

// Novos v2.2:
const antibanCmd = program.command('antiban').description('Proteção contra bloqueios do YouTube');
antibanCmd.command('status').description('Ver estado da proteção e circuit breaker')
    .action(() => { doAntibanStatus(); process.exit(0); });
antibanCmd.command('reset').description('Resetar o circuit breaker (libera downloads)')
    .action(() => { doAntibanReset(); process.exit(0); });
antibanCmd.command('test').description('Testar download real com a proteção atual')
    .action(async () => { await doAntibanTest(); process.exit(0); });

program
    .command('scan')
    .description('Escanear biblioteca local (opcional: reconstruir dedup)')
    .option('--rebuild', 'reconstrói o arquivo de dedup com o que encontrar')
    .action((opts) => { doScan(opts); process.exit(0); });

program
    .command('backup')
    .description('Criar backup das configurações, inscrições, histórico e dedup')
    .option('--out <file>', 'caminho de saída')
    .action((opts) => { doBackup(opts); process.exit(0); });

program
    .command('restore <file>')
    .description('Restaurar backup (mescla por padrão)')
    .option('--no-merge', 'sobrescreve em vez de mesclar')
    .action((file, opts) => { doRestore(file, { merge: opts.merge !== false }); process.exit(0); });

// Novos v2.3:
program
    .command('bot')
    .description('Iniciar o bot do Telegram (modo servidor)')
    .action(async () => {
        // Delega para bot.js sem subprocess: import dinâmico mantém um único processo.
        await import('./bot.js');
    });

program
    .command('schedule')
    .description('Rodar sync das inscrições periodicamente (foreground)')
    .option('-i, --interval <h>', 'intervalo em horas (padrão 6)', (v) => parseFloat(v))
    .option('--no-immediate', 'não roda no start, espera o primeiro intervalo')
    .action(async (opts) => {
        requireDependencies();
        const { runScheduler } = await import('./src/scheduler.js');
        await runScheduler({
            intervalHours: opts.interval || 6,
            runOnStart: opts.immediate !== false,
        });
        process.exit(0);
    });

program
    .command('cleanup')
    .description('Limpar caches efêmeros do bot (~/.horizon/bot-cache)')
    .action(() => {
        const cacheDir = path.join(getMusicBaseDir(), '..', '.horizon', 'bot-cache');
        // Caminho seguro:
        const dir = path.join(process.env.HOME || '~', '.horizon', 'bot-cache');
        if (!fs.existsSync(dir)) {
            console.log(chalk.gray('Nada pra limpar.'));
            process.exit(0);
        }
        let removed = 0;
        for (const sub of fs.readdirSync(dir)) {
            const full = path.join(dir, sub);
            if (fs.statSync(full).isDirectory()) {
                for (const f of fs.readdirSync(full)) {
                    try { fs.unlinkSync(path.join(full, f)); removed += 1; } catch { /* ignore */ }
                }
            }
        }
        console.log(chalk.green(`✅ Cache do bot limpo: ${removed} arquivos removidos.`));
        process.exit(0);
    });

// Novos v2.5:
program
    .command('download <url>')
    .alias('dl')
    .description('Baixa de QUALQUER plataforma suportada (YouTube, Spotify, Deezer, SoundCloud, Apple, Tidal)')
    .option('-p, --playlist <nome>', 'pasta de destino')
    .option('--preview', 'mostra o que seria baixado sem baixar')
    .action(async (url, opts) => {
        requireDependencies();
        const info = detectSource(url);
        if (!info) {
            console.log(chalk.red('❌ Plataforma não reconhecida. Suportados: YouTube, Spotify, Deezer, SoundCloud, Apple Music, Tidal.'));
            process.exit(1);
        }
        if (opts.preview) {
            const spinner = createSpinner(`Resolvendo ${info.platform}...`).start();
            const res = await universalPreview(url);
            spinner.stop();
            if (!res.ok) { console.log(chalk.red(`❌ ${res.error}`)); process.exit(1); }
            console.log(chalk.blueBright(`\n🎶 ${res.platform} (${res.type}):\n`));
            if (res.tracks?.length) {
                res.tracks.forEach((t, i) => console.log(chalk.white(`  ${i + 1}. ${t}`)));
            } else {
                console.log(chalk.gray(`  ${res.note || ''}`));
            }
            console.log('');
            process.exit(0);
        }
        const spinner = createSpinner(`Baixando de ${info.platform} (${info.type})...`).start();
        const res = await universalResolve(url, { playlist: opts.playlist });
        spinner.stop();
        if (res.ok) {
            const txt = res.downloaded != null
                ? `${res.downloaded}/${res.tracks || 1} faixas`
                : 'concluído';
            console.log(chalk.green(`\n✅ ${info.platform}: ${txt}`));
        } else {
            console.log(chalk.red(`❌ ${res.error || 'falha no download'}`));
        }
        process.exit(res.ok ? 0 : 1);
    });

program
    .command('platforms')
    .description('Listar plataformas suportadas pelo resolver universal')
    .action(() => {
        const plats = supportedPlatforms();
        console.log(chalk.blueBright('\n🌐 Plataformas suportadas:\n'));
        for (const p of plats) {
            console.log(`  ${p.emoji}  ${chalk.white(p.name.padEnd(14))} ${chalk.gray(p.patterns.join(', '))}`);
        }
        console.log('');
        process.exit(0);
    });

const favCmd = program.command('fav').alias('favorites').description('Gerenciar favoritos');
favCmd.command('list').description('Listar favoritos')
    .option('-q, --query <texto>', 'busca por título/artista')
    .option('-t, --tag <tag>', 'filtra por tag')
    .action((opts) => {
        const favs = listFavorites({ search: opts.query, tag: opts.tag });
        if (!favs.length) { console.log(chalk.yellow('⭐ Nenhum favorito.')); process.exit(0); }
        console.log(chalk.blueBright(`\n⭐ Favoritos (${favs.length}):\n`));
        favs.forEach((f, i) => {
            const tags = f.tags?.length ? chalk.gray(` [${f.tags.join(', ')}]`) : '';
            console.log(`  ${i + 1}. ${chalk.white(f.title)}${f.artist ? chalk.gray(' — ' + f.artist) : ''}${tags}`);
            console.log(`     ${chalk.gray('id=' + f.id)}`);
        });
        console.log('');
        process.exit(0);
    });
favCmd.command('add <title...>').description('Adicionar favorito')
    .option('-a, --artist <nome>', 'artista')
    .option('-u, --url <url>', 'URL')
    .action((titleParts, opts) => {
        const r = addFavorite({ title: titleParts.join(' '), artist: opts.artist, url: opts.url, source: 'cli' });
        if (r.duplicate) { console.log(chalk.yellow('⚠️  Já está nos favoritos.')); process.exit(0); }
        console.log(chalk.green(`✅ Adicionado: ${r.favorite.title} (id=${r.favorite.id})`));
        process.exit(0);
    });
favCmd.command('remove <id>').description('Remover favorito por ID')
    .action((id) => {
        if (removeFavorite(id)) console.log(chalk.green('✅ Removido.'));
        else console.log(chalk.red('❌ Não encontrado.'));
        process.exit(0);
    });
favCmd.command('download').description('Baixar TODOS os favoritos como lote')
    .option('-p, --playlist <nome>', 'pasta de destino', 'Favoritos')
    .action(async (opts) => {
        requireDependencies();
        const terms = exportFavoritesAsTerms();
        if (!terms.length) { console.log(chalk.yellow('⭐ Sem favoritos pra baixar.')); process.exit(0); }
        await doBatch(terms, { playlist: opts.playlist });
        process.exit(0);
    });
favCmd.command('clear').description('Apagar todos os favoritos').action(() => {
    clearFavorites();
    console.log(chalk.green('✅ Favoritos limpos.'));
    process.exit(0);
});

// Novos v2.4:
program
    .command('spotify <url>')
    .description('Resolver e baixar de link Spotify/Deezer/Apple Music')
    .option('-p, --playlist <nome>', 'pasta de destino')
    .option('--preview', 'mostra as faixas que seriam baixadas sem baixar')
    .action(async (url, opts) => {
        requireDependencies();
        if (opts.preview) {
            const spinner = createSpinner('Extraindo faixas do Spotify...').start();
            const res = await previewSpotifyLink(url);
            spinner.stop();
            if (!res.ok) { console.log(chalk.red(`❌ ${res.error}`)); process.exit(1); }
            console.log(chalk.blueBright(`\n🟢 ${res.platform} (${res.type}) — ${res.tracks.length} faixas:\n`));
            res.tracks.forEach((t, i) => console.log(chalk.white(`  ${i + 1}. ${t}`)));
            console.log('');
            process.exit(0);
        }
        const spinner = createSpinner('Resolvendo Spotify e baixando...').start();
        const res = await resolveAndDownload(url, { playlist: opts.playlist });
        spinner.stop();
        if (res.ok) {
            console.log(chalk.green(`\n✅ Spotify: ${res.downloaded || 1} de ${res.tracks || 1} faixas baixadas.`));
        } else {
            console.log(chalk.red(`❌ ${res.error}`));
        }
        process.exit(res.ok ? 0 : 1);
    });

program
    .command('play [pasta]')
    .description('Tocar músicas no terminal (usa mpv/ffplay)')
    .option('-s, --shuffle', 'modo aleatório')
    .option('-l, --loop', 'repetir ao chegar no fim')
    .option('--list', 'listar pastas tocáveis')
    .action(async (pasta, opts) => {
        if (opts.list) {
            const playable = listPlayable();
            if (!playable.length) { console.log(chalk.yellow('⚠️  Nenhuma pasta com áudio.')); process.exit(0); }
            console.log(chalk.blueBright(`\n🎵 Pastas disponíveis:\n`));
            playable.forEach((p) => console.log(`  ${chalk.cyanBright(p.name)}  ${chalk.gray(`(${p.count} faixas)`)}`));
            console.log('');
            process.exit(0);
        }
        if (!pasta) {
            const playable = listPlayable();
            if (!playable.length) { console.log(chalk.yellow('⚠️  Nenhuma pasta com áudio.')); process.exit(0); }
            const { folder } = await inquirer.prompt([
                { type: 'rawlist', name: 'folder', message: 'Qual pasta tocar?', choices: playable.map((p) => p.name) },
            ]);
            pasta = folder;
        }
        await play(pasta, { shuffle: opts.shuffle, loop: opts.loop });
        process.exit(0);
    });

program
    .command('organize [pasta]')
    .description('Reorganizar biblioteca por artista (parse do nome do arquivo)')
    .option('-m, --mode <mode>', 'artist (padrão) ou flat', 'artist')
    .option('--execute', 'executar de verdade (sem isso, só mostra o plano)')
    .action(async (pasta, opts) => {
        if (!pasta) {
            const folders = listPlaylistFolders();
            if (!folders.length) { console.log(chalk.yellow('⚠️  Nenhuma pasta.')); process.exit(0); }
            const { folder } = await inquirer.prompt([
                { type: 'rawlist', name: 'folder', message: 'Pasta pra organizar:', choices: folders },
            ]);
            pasta = folder;
        }
        const plan = planOrganize(pasta, opts.mode);
        printPlan(plan);
        if (!plan.ok || !plan.moves.length) { process.exit(0); }
        if (!opts.execute) {
            console.log(chalk.yellow('⚠️  Modo preview. Adicione --execute pra mover de verdade.\n'));
            process.exit(0);
        }
        const { confirm } = await inquirer.prompt([
            { type: 'confirm', name: 'confirm', message: `Mover ${plan.moves.length} arquivo(s)?`, default: false },
        ]);
        if (!confirm) { process.exit(0); }
        const spinner = createSpinner('Reorganizando...').start();
        const res = executeOrganize(plan, ({ index, total }) => {
            spinner.update({ text: `[${index + 1}/${total}]` });
        });
        spinner.success({ text: `Movidos ${res.moved}/${res.total}${res.errors.length ? ` (${res.errors.length} erros)` : ''}` });
        process.exit(0);
    });

const profilesCmd = program.command('profiles').description('Gerenciar perfis de configuração');
profilesCmd.command('list').description('Listar perfis salvos')
    .action(() => { printProfiles(); process.exit(0); });
profilesCmd.command('save <nome>').description('Salvar config atual como perfil')
    .option('-d, --desc <texto>', 'descrição')
    .action((nome, opts) => {
        const res = saveProfile(nome, opts.desc || '');
        if (res.ok) console.log(chalk.green(`✅ Perfil "${res.name}" salvo.`));
        else console.log(chalk.red(`❌ ${res.error}`));
        process.exit(0);
    });
profilesCmd.command('load <nome>').description('Carregar perfil como config ativa')
    .action((nome) => {
        const res = loadProfile(nome);
        if (res.ok) console.log(chalk.green(`✅ Perfil "${res.name}" carregado.`));
        else console.log(chalk.red(`❌ ${res.error}`));
        process.exit(0);
    });
profilesCmd.command('delete <nome>').description('Deletar perfil')
    .action((nome) => {
        const res = deleteProfile(nome);
        if (res.ok) console.log(chalk.green(`✅ Deletado.`));
        else console.log(chalk.red(`❌ ${res.error}`));
        process.exit(0);
    });

program
    .command('web')
    .description('Iniciar o Web Dashboard (REST API + UI)')
    .option('--port <n>', 'porta (padrão 3777)', (v) => parseInt(v, 10))
    .action((opts) => {
        startWebServer({ port: opts.port || 3777 });
        // Não faz process.exit — servidor fica rodando.
    });

program
    .command('notify <mensagem...>')
    .description('Enviar notificação push para os admins via Telegram')
    .action(async (partes) => {
        const msg = partes.join(' ');
        const status = getPushStatus();
        if (!status.enabled) {
            console.log(chalk.red('❌ Push desabilitado. Defina BOT_TOKEN e ADMIN_USER_IDS no .env.'));
            process.exit(1);
        }
        await notifyCustom(`📢 *Manual:* ${msg}`);
        console.log(chalk.green(`✅ Notificação enviada para ${status.adminCount} admin(s).`));
        process.exit(0);
    });

// Sem argumentos → menu interativo.
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
