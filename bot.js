/**
 * HORIZON BOT — v2.3 "Servidor"
 *
 * Modo servidor multiusuário: pensado para rodar 24/7 em VPS/Termux.
 *
 *  ✓ Whitelist + lista de admins (env)
 *  ✓ Estado persistente por usuário (bot-users.json)
 *  ✓ Quota diária por usuário (env DAILY_QUOTA)
 *  ✓ Concurrency global limitada (env MAX_CONCURRENT_DOWNLOADS)
 *  ✓ Pasta efêmera por usuário em ~/.horizon/bot-cache/<userId>
 *    → baixa, envia, e DELETA o arquivo
 *  ✓ Detecção de outras plataformas com aviso amigável
 *  ✓ Aviso pré-download em playlists grandes (com botão de cancelar)
 *  ✓ Comandos: /start /help /search /stats /cancel /me
 *  ✓ Comandos admin: /admin_users /admin_block /admin_unblock /admin_broadcast
 *  ✓ Anti-spam: edita mensagens em vez de criar novas
 *  ✓ Rate-limit + circuit breaker do anti-ban são respeitados
 *  ✓ Graceful shutdown (SIGINT / SIGTERM)
 *  ✓ Auto-update do yt-dlp na inicialização (env AUTO_UPDATE_YTDLP=1)
 *  ✓ Log estruturado em ~/.horizon/logs
 */

import { Telegraf, Markup } from 'telegraf';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

import {
    getAppDir,
    loadSettings,
    sanitizeName,
} from './src/config.js';
import { isYoutubeUrl, isOtherPlatform, isPlaylistUrl, formatDuration } from './src/utils.js';
import {
    searchYoutube,
    downloadOne,
    downloadPlaylist,
    ensurePlaylistDir,
} from './src/downloader.js';
import { requireDependencies } from './src/deps.js';
import { summary } from './src/history.js';
import { circuitOpen } from './src/antiban.js';
import { updateYtDlp } from './src/updater.js';
import { log } from './src/logger.js';
import {
    getUser,
    incrementDownload,
    setBlocked,
    listAllUsers,
    syncAdmins,
    globalStats,
    userCount,
} from './src/botState.js';

dotenv.config();

// ============================================================
//  CONFIG ENV
// ============================================================

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
    console.error('❌ ERRO: BOT_TOKEN não encontrado no .env');
    console.error('   Copie .env.example para .env e preencha seu token.');
    process.exit(1);
}

const ALLOWED = String(process.env.ALLOWED_USER_IDS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);

const ADMINS = String(process.env.ADMIN_USER_IDS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);

const RATE_LIMIT_MS = Number(process.env.RATE_LIMIT_MS || 1500);
const DAILY_QUOTA = Number(process.env.DAILY_QUOTA || 30);
const MAX_CONCURRENT_DOWNLOADS = Number(process.env.MAX_CONCURRENT_DOWNLOADS || 2);
const PLAYLIST_MAX = Number(process.env.PLAYLIST_MAX_TRACKS || 100);
const AUTO_UPDATE_YTDLP = process.env.AUTO_UPDATE_YTDLP === '1';

const MAX_FILE_MB_TELEGRAM = 49; // limite prático ~50MB pra bots normais
const CACHE_DIR = path.join(getAppDir(), 'bot-cache');

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

requireDependencies();
syncAdmins(ADMINS);

// ============================================================
//  CONCORRÊNCIA GLOBAL
// ============================================================

let activeDownloads = 0;
const downloadQueue = [];

/** Espera ter slot livre para baixar. */
function acquireSlot() {
    return new Promise((resolve) => {
        const tryAcquire = () => {
            if (activeDownloads < MAX_CONCURRENT_DOWNLOADS) {
                activeDownloads += 1;
                resolve();
            } else {
                downloadQueue.push(tryAcquire);
            }
        };
        tryAcquire();
    });
}

function releaseSlot() {
    activeDownloads = Math.max(0, activeDownloads - 1);
    const next = downloadQueue.shift();
    if (next) next();
}

// ============================================================
//  HELPERS
// ============================================================

function isAdmin(ctx) {
    return ADMINS.includes(String(ctx.from?.id));
}

/** Pasta efêmera por usuário. */
function userCacheDir(userId) {
    const dir = path.join(CACHE_DIR, String(userId));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

/** Apaga TUDO dentro da pasta do usuário (após enviar). */
function cleanUserCache(userId) {
    const dir = userCacheDir(userId);
    try {
        for (const f of fs.readdirSync(dir)) {
            try { fs.unlinkSync(path.join(dir, f)); } catch { /* ignore */ }
        }
    } catch { /* ignore */ }
}

/** Edita mensagem com fallback silencioso. */
async function safeEdit(ctx, msg, text, extra = {}) {
    try {
        await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, text, extra);
    } catch (err) {
        log.warn(`bot: edit falhou (${err.message})`);
    }
}

// ============================================================
//  BOT SETUP
// ============================================================

const bot = new Telegraf(BOT_TOKEN);
const userState = new Map(); // estado de conversa por usuário

function getConvState(uid) {
    if (!userState.has(uid)) userState.set(uid, {});
    return userState.get(uid);
}

// ============================================================
//  MIDDLEWARES
// ============================================================

// 1. Whitelist (se configurada).
bot.use(async (ctx, next) => {
    if (!ALLOWED.length) return next();
    const id = String(ctx.from?.id || '');
    if (!ALLOWED.includes(id)) {
        log.warn(`bot: acesso negado de ${id} (${ctx.from?.first_name || '?'})`);
        return ctx.reply('⛔ Acesso restrito. Seu ID não está na whitelist.');
    }
    return next();
});

// 2. Carrega/atualiza estado do usuário + verifica bloqueio.
bot.use(async (ctx, next) => {
    if (!ctx.from) return next();
    const user = getUser(ctx.from);
    ctx.user = user;
    if (user.blocked) {
        return ctx.reply('🚫 Você foi bloqueado pelo administrador.');
    }
    return next();
});

// 3. Rate-limit por usuário.
bot.use(async (ctx, next) => {
    const uid = ctx.from?.id;
    if (!uid) return next();
    const st = getConvState(uid);
    const now = Date.now();
    if (st.lastMsgAt && now - st.lastMsgAt < RATE_LIMIT_MS) {
        return ctx.reply('⏱️  Calma! Aguarde um instante entre mensagens.');
    }
    st.lastMsgAt = now;
    return next();
});

// ============================================================
//  COMANDOS PÚBLICOS
// ============================================================

bot.start((ctx) =>
    ctx.reply(
        '🌌 *Horizon Bot v2.3*\n\n' +
            'Manda o nome de uma música, um link do YouTube ou uma playlist do YouTube.\n' +
            'Eu baixo e te envio aqui no chat!\n\n' +
            '📌 *Comandos:*\n' +
            '/search <termo> — buscar 5 opções\n' +
            '/me — seu perfil e quota\n' +
            '/stats — estatísticas globais\n' +
            '/cancel — cancela a ação atual\n' +
            '/help — ajuda detalhada\n\n' +
            '💡 *Spotify/Deezer/Apple:* converta sua playlist em *TuneMyMusic.com* e cole o link do YouTube aqui.',
        { parse_mode: 'Markdown' },
    ),
);

bot.command('help', (ctx) =>
    ctx.reply(
        '📖 *Ajuda Horizon Bot*\n\n' +
            '*Como usar:*\n' +
            '• Mande um *nome* → mostro 5 opções com botões.\n' +
            '• Mande um *link do YouTube* → baixo direto.\n' +
            '• Mande uma *playlist do YouTube* → confirmo e baixo até ' +
            PLAYLIST_MAX + ' faixas.\n\n' +
            '*Comandos:*\n' +
            '/me — seu perfil, quota usada hoje\n' +
            '/stats — estatísticas do bot\n' +
            '/cancel — cancela o passo atual\n\n' +
            `*Limites:* ${DAILY_QUOTA} downloads por dia, arquivos até ${MAX_FILE_MB_TELEGRAM}MB.\n\n` +
            '⚙️  Configurações (formato/qualidade/anti-ban) são editadas no servidor pelo CLI.',
        { parse_mode: 'Markdown' },
    ),
);

bot.command('cancel', (ctx) => {
    userState.delete(ctx.from.id);
    return ctx.reply('🚫 Ação cancelada.');
});

bot.command('me', (ctx) => {
    const u = ctx.user;
    const restante = Math.max(0, DAILY_QUOTA - (u.todayDownloads || 0));
    return ctx.reply(
        `👤 *Seu perfil*\n\n` +
            `Nome: ${u.name}\n` +
            `ID: \`${u.id}\`\n` +
            `Membro desde: ${u.firstSeen.slice(0, 10)}\n\n` +
            `📥 *Downloads*\n` +
            `Hoje: ${u.todayDownloads || 0} / ${DAILY_QUOTA}\n` +
            `Restante hoje: ${restante}\n` +
            `Total: ${u.totalDownloads || 0}\n` +
            (u.isAdmin ? '\n👑 Você é admin.' : ''),
        { parse_mode: 'Markdown' },
    );
});

bot.command('stats', (ctx) => {
    const s = summary();
    const g = globalStats();
    const c = circuitOpen();
    const lines = [
        '📊 *Estatísticas globais*',
        '',
        `*Downloads:*`,
        `  Sucesso (geral): ${s.ok}`,
        `  Erros: ${s.err}`,
        `  Hoje (todos os usuários): ${g.todayDownloads}`,
        '',
        `*Usuários:*`,
        `  Cadastrados: ${g.users}`,
        `  Ativos (7d): ${g.active7d}`,
        `  Bloqueados: ${g.blocked}`,
        '',
        `*Servidor:*`,
        `  Downloads ativos: ${activeDownloads}/${MAX_CONCURRENT_DOWNLOADS}`,
        `  Fila do bot: ${downloadQueue.length}`,
    ];
    if (c.open) {
        const min = Math.ceil(c.remainingMs / 60_000);
        lines.push('', `🛡️  *Anti-ban ATIVO* (~${min}min) — ${c.reason}`);
    }
    return ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
});

bot.command('search', async (ctx) => {
    const q = ctx.message.text.replace(/^\/search\s*/i, '').trim();
    if (!q) return ctx.reply('Uso: /search <termo>');
    return handleSearchQuery(ctx, q);
});

// ============================================================
//  COMANDOS ADMIN
// ============================================================

bot.command('admin_users', (ctx) => {
    if (!isAdmin(ctx)) return;
    const users = listAllUsers().slice(-20);
    const lines = ['👥 *Últimos 20 usuários:*\n'];
    for (const u of users) {
        const flag = u.blocked ? '🚫' : u.isAdmin ? '👑' : '👤';
        lines.push(
            `${flag} \`${u.id}\` ${u.name} — ${u.totalDownloads || 0} dl  (hoje: ${u.todayDownloads || 0})`,
        );
    }
    return ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
});

bot.command('admin_block', (ctx) => {
    if (!isAdmin(ctx)) return;
    const id = ctx.message.text.split(/\s+/)[1];
    if (!id) return ctx.reply('Uso: /admin_block <id>');
    if (setBlocked(id, true)) {
        log.info(`bot: admin ${ctx.from.id} bloqueou ${id}`);
        return ctx.reply(`🚫 Usuário ${id} bloqueado.`);
    }
    return ctx.reply('Usuário não encontrado.');
});

bot.command('admin_unblock', (ctx) => {
    if (!isAdmin(ctx)) return;
    const id = ctx.message.text.split(/\s+/)[1];
    if (!id) return ctx.reply('Uso: /admin_unblock <id>');
    if (setBlocked(id, false)) {
        log.info(`bot: admin ${ctx.from.id} desbloqueou ${id}`);
        return ctx.reply(`✅ Usuário ${id} desbloqueado.`);
    }
    return ctx.reply('Usuário não encontrado.');
});

bot.command('admin_broadcast', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const msg = ctx.message.text.replace(/^\/admin_broadcast\s*/i, '').trim();
    if (!msg) return ctx.reply('Uso: /admin_broadcast <mensagem>');
    const users = listAllUsers().filter((u) => !u.blocked);
    let ok = 0;
    let err = 0;
    for (const u of users) {
        try {
            await ctx.telegram.sendMessage(u.id, `📢 *Aviso do admin:*\n\n${msg}`, {
                parse_mode: 'Markdown',
            });
            ok += 1;
            await new Promise((r) => setTimeout(r, 50)); // anti-flood do Telegram
        } catch {
            err += 1;
        }
    }
    log.info(`bot: broadcast por ${ctx.from.id} → ok=${ok} err=${err}`);
    return ctx.reply(`📢 Broadcast: ${ok} enviadas, ${err} falharam.`);
});

// ============================================================
//  HANDLERS DE BUSCA / DOWNLOAD
// ============================================================

async function handleSearchQuery(ctx, query) {
    const msg = await ctx.reply(`🔍 Buscando: "${query}"...`);
    try {
        const results = await searchYoutube(query, 5);
        if (!results.length) {
            return safeEdit(ctx, msg, '⚠️ Nenhum resultado.');
        }
        const buttons = results.map((r) => [
            Markup.button.callback(r.title.slice(0, 55), `dl_${r.videoId}`),
        ]);
        buttons.push([Markup.button.callback('❌ Cancelar', 'cancel')]);
        await safeEdit(ctx, msg, '🎵 Escolha a versão:', Markup.inlineKeyboard(buttons));
    } catch (err) {
        log.error(`bot: search falhou: ${err.message}`);
        return safeEdit(ctx, msg, '❌ Erro na busca. Tente de novo em alguns minutos.');
    }
}

async function performSingleDownload(ctx, statusMsg, target) {
    const userId = ctx.from.id;
    const isSearchTerm = !isYoutubeUrl(target);
    const folder = `bot-${userId}`;

    // Override pra salvar na pasta efêmera do usuário, não na biblioteca principal.
    const cacheDir = userCacheDir(userId);
    const overrides = { musicBaseDir: path.dirname(cacheDir) };
    // Trick: ensurePlaylistDir vai fazer baseDir + sanitize(folder).
    // O folder = "<userId>" porque cacheDir já é AppDir/bot-cache/<userId>
    // e musicBaseDir aponta pro AppDir/bot-cache.
    const playlistName = String(userId);

    await safeEdit(ctx, statusMsg, '⏳ Baixando...');

    await acquireSlot();
    try {
        const res = await downloadOne({
            target,
            playlist: playlistName,
            isSearchTerm,
            overrides,
        });

        if (!res.ok) {
            return safeEdit(ctx, statusMsg, '❌ Erro no download. Pode ter sido bloqueado pelo YouTube ou o link é inválido.');
        }

        // Pega o arquivo mais recente da pasta efêmera.
        const files = fs.readdirSync(cacheDir)
            .filter((f) => /\.(mp3|m4a|opus|flac)$/i.test(f))
            .map((name) => {
                const full = path.join(cacheDir, name);
                const stat = fs.statSync(full);
                return { name, full, mtime: stat.mtimeMs, sizeMB: stat.size / 1024 / 1024 };
            })
            .sort((a, b) => b.mtime - a.mtime);

        const latest = files[0];
        if (!latest) {
            return safeEdit(ctx, statusMsg, '⚠️ Download ok, mas o arquivo sumiu. Tenta de novo.');
        }

        if (latest.sizeMB > MAX_FILE_MB_TELEGRAM) {
            cleanUserCache(userId);
            return safeEdit(
                ctx,
                statusMsg,
                `⚠️ Arquivo muito grande (${latest.sizeMB.toFixed(1)}MB). Limite do Telegram: ${MAX_FILE_MB_TELEGRAM}MB.`,
            );
        }

        await safeEdit(ctx, statusMsg, '📤 Enviando...');
        await ctx.replyWithAudio({ source: latest.full, filename: latest.name });
        await safeEdit(ctx, statusMsg, `✅ ${latest.name}`);
        incrementDownload(userId);
    } catch (err) {
        log.error(`bot: download falhou para ${userId}: ${err.message}`);
        await safeEdit(ctx, statusMsg, `❌ Erro: ${String(err.message || err).slice(0, 200)}`);
    } finally {
        // SEMPRE limpa o cache do usuário (não acumula nada no servidor).
        cleanUserCache(userId);
        releaseSlot();
    }
}

async function performPlaylistDownload(ctx, statusMsg, url) {
    const userId = ctx.from.id;
    const cacheDir = userCacheDir(userId);
    const overrides = { musicBaseDir: path.dirname(cacheDir) };
    const playlistName = String(userId);

    await safeEdit(ctx, statusMsg, '📦 Baixando playlist (silencioso, pode demorar)...');

    await acquireSlot();
    try {
        const res = await downloadPlaylist({
            url,
            playlist: playlistName,
            overrides,
            silent: true,
        });

        if (!res.ok) {
            return safeEdit(ctx, statusMsg, '❌ Erro ao baixar a playlist.');
        }

        const files = fs.readdirSync(cacheDir)
            .filter((f) => /\.(mp3|m4a|opus|flac)$/i.test(f))
            .map((name) => {
                const full = path.join(cacheDir, name);
                return {
                    name,
                    full,
                    sizeMB: fs.statSync(full).size / 1024 / 1024,
                };
            });

        if (!files.length) {
            return safeEdit(ctx, statusMsg, '⚠️ Playlist baixada mas nada chegou — verifique se o link estava certo.');
        }

        const total = files.length;
        const skipped = files.filter((f) => f.sizeMB > MAX_FILE_MB_TELEGRAM);
        const sendable = files.filter((f) => f.sizeMB <= MAX_FILE_MB_TELEGRAM);

        await safeEdit(ctx, statusMsg, `📤 Enviando ${sendable.length} de ${total} faixas...`);

        let sent = 0;
        for (const f of sendable) {
            try {
                await ctx.replyWithAudio({ source: f.full, filename: f.name });
                incrementDownload(userId);
                sent += 1;
                // Anti-flood Telegram: leve pausa.
                await new Promise((r) => setTimeout(r, 400));
            } catch (err) {
                log.warn(`bot: falha enviando ${f.name}: ${err.message}`);
            }
        }

        const finalLines = [`✅ Playlist concluída.`, `Enviadas: ${sent}/${total}`];
        if (skipped.length) {
            finalLines.push(`⚠️ Ignoradas por tamanho (>${MAX_FILE_MB_TELEGRAM}MB): ${skipped.length}`);
        }
        await safeEdit(ctx, statusMsg, finalLines.join('\n'));
    } catch (err) {
        log.error(`bot: playlist falhou para ${userId}: ${err.message}`);
        await safeEdit(ctx, statusMsg, `❌ Erro: ${String(err.message || err).slice(0, 200)}`);
    } finally {
        cleanUserCache(userId);
        releaseSlot();
    }
}

// ============================================================
//  ROUTER PRINCIPAL DE TEXTO
// ============================================================

bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return;

    const uid = ctx.from.id;
    const user = ctx.user;
    const text = ctx.message.text.trim();
    const conv = getConvState(uid);

    if (conv.busy) {
        return ctx.reply('⏳ Já estou processando seu pedido anterior. Aguarde ou use /cancel.');
    }

    // Aviso de outras plataformas.
    if (isOtherPlatform(text)) {
        return ctx.reply(
            '💡 *Spotify / Deezer / Apple Music*\n\n' +
                '1. Acesse *TuneMyMusic.com*\n' +
                '2. Converta sua playlist para o YouTube\n' +
                '3. Cole o link do YouTube aqui',
            { parse_mode: 'Markdown' },
        );
    }

    // Quota diária.
    if (!user.isAdmin && (user.todayDownloads || 0) >= DAILY_QUOTA) {
        return ctx.reply(
            `🛑 Você atingiu a quota diária (${DAILY_QUOTA}). Tente novamente amanhã!`,
        );
    }

    // Circuit breaker do anti-ban.
    const cb = circuitOpen();
    if (cb.open) {
        const min = Math.ceil(cb.remainingMs / 60_000);
        return ctx.reply(
            `⛔ Servidor pausado por proteção anti-bloqueio (~${min}min). Motivo: ${cb.reason}.`,
        );
    }

    conv.busy = true;
    try {
        if (isYoutubeUrl(text)) {
            const isPL = isPlaylistUrl(text);

            if (isPL) {
                // Playlist: confirma antes (anti-spam de usuário malandro).
                const buttons = Markup.inlineKeyboard([
                    [Markup.button.callback(`✅ Sim, baixar até ${PLAYLIST_MAX} faixas`, `pl_yes`)],
                    [Markup.button.callback('❌ Cancelar', 'cancel')],
                ]);
                conv.pendingUrl = text;
                conv.pendingKind = 'playlist';
                await ctx.reply(
                    `📦 Detectei uma *playlist do YouTube*.\n` +
                        `Limite por playlist: *${PLAYLIST_MAX}* faixas.\n` +
                        `Posso baixar agora?`,
                    { parse_mode: 'Markdown', ...buttons },
                );
            } else {
                const status = await ctx.reply('🚀 Iniciando download...');
                await performSingleDownload(ctx, status, text);
            }
        } else {
            // Termo de busca.
            await handleSearchQuery(ctx, text);
        }
    } finally {
        conv.busy = false;
    }
});

// ============================================================
//  CALLBACKS (botões inline)
// ============================================================

bot.action('cancel', async (ctx) => {
    userState.delete(ctx.from.id);
    await ctx.answerCbQuery('Cancelado');
    try { await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); } catch { /* ignore */ }
    return ctx.reply('🚫 Ação cancelada.');
});

bot.action(/^dl_(.+)$/, async (ctx) => {
    const videoId = ctx.match[1];
    await ctx.answerCbQuery();
    try { await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); } catch { /* ignore */ }

    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const status = await ctx.reply('🚀 Iniciando download...');

    const conv = getConvState(ctx.from.id);
    conv.busy = true;
    try {
        await performSingleDownload(ctx, status, url);
    } finally {
        conv.busy = false;
    }
});

bot.action('pl_yes', async (ctx) => {
    const conv = getConvState(ctx.from.id);
    const url = conv.pendingUrl;
    if (!url) return ctx.answerCbQuery('Pedido expirado.');

    await ctx.answerCbQuery();
    try { await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); } catch { /* ignore */ }

    const status = await ctx.reply('🚀 Iniciando playlist...');
    conv.pendingUrl = null;
    conv.pendingKind = null;
    conv.busy = true;
    try {
        await performPlaylistDownload(ctx, status, url);
    } finally {
        conv.busy = false;
    }
});

// ============================================================
//  LIFECYCLE
// ============================================================

bot.catch((err, ctx) => {
    log.error(`bot: erro no update ${ctx?.updateType} — ${err.message}`);
    console.error('[bot] erro', err);
});

console.log('🌌 Horizon Bot v2.3 (modo servidor) iniciando...');
console.log(`   Users registrados: ${userCount()}`);
console.log(`   Whitelist: ${ALLOWED.length ? ALLOWED.join(', ') : 'ABERTA'}`);
console.log(`   Admins: ${ADMINS.length ? ADMINS.join(', ') : 'NENHUM'}`);
console.log(`   Quota diária: ${DAILY_QUOTA}`);
console.log(`   Concorrência máx: ${MAX_CONCURRENT_DOWNLOADS}`);
console.log(`   Cache: ${CACHE_DIR}`);

(async () => {
    if (AUTO_UPDATE_YTDLP) {
        console.log('   Atualizando yt-dlp na inicialização...');
        try { updateYtDlp(); } catch { /* ignore */ }
    }
    await bot.launch();
    console.log('✅ Bot online.');
    log.info('bot: online');
})();

const shutdown = async (sig) => {
    console.log(`\n👋 ${sig} recebido. Encerrando bot...`);
    log.info(`bot: shutdown ${sig}`);
    bot.stop(sig);
    // Limpa caches de todos os usuários ao desligar (defensive).
    try {
        if (fs.existsSync(CACHE_DIR)) {
            for (const dir of fs.readdirSync(CACHE_DIR)) {
                const full = path.join(CACHE_DIR, dir);
                if (fs.statSync(full).isDirectory()) {
                    for (const f of fs.readdirSync(full)) {
                        try { fs.unlinkSync(path.join(full, f)); } catch { /* ignore */ }
                    }
                }
            }
        }
    } catch { /* ignore */ }
    process.exit(0);
};
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
