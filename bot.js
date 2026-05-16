/**
 * HORIZON BOT — v2.5.1 "Universal Fixed"
 *
 * Bot Telegram multiusuario com suporte a TODAS as plataformas:
 *   YouTube, Spotify, Deezer, SoundCloud, Apple Music, Tidal
 *
 *  ✓ Resolver universal (cola qualquer link e baixa)
 *  ✓ /spotify, /deezer, /soundcloud — comandos dedicados
 *  ✓ /fav — sistema de favoritos
 *  ✓ /platforms — mostra plataformas suportadas
 *  ✓ /quality — altera qualidade on-the-fly
 *  ✓ /playlist — baixar playlist inteira de qualquer plataforma
 *  ✓ Deteccao automatica de plataforma em mensagens de texto
 *  ✓ Tudo da v2.3 (quota, admins, cache efemero, circuit breaker)
 *
 * v2.5.1 fixes:
 *  - Removido require() ilegal em ESM (admin_reset)
 *  - Race condition de conv.busy resolvida com travamento centralizado
 *  - playlist max passado corretamente ao resolver universal
 *  - Mensagens de erro mais explicitas para o usuario final
 */

import { Telegraf, Markup } from 'telegraf';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

import { getAppDir, loadSettings, sanitizeName } from './src/config.js';
import { isYoutubeUrl, isPlaylistUrl, formatDuration } from './src/utils.js';
import { searchYoutube, downloadOne, downloadPlaylist, ensurePlaylistDir } from './src/downloader.js';
import { requireDependencies } from './src/deps.js';
import { summary } from './src/history.js';
import { circuitOpen, resetCircuit } from './src/antiban.js';
import { updateYtDlp } from './src/updater.js';
import { log } from './src/logger.js';
import { getUser, incrementDownload, setBlocked, listAllUsers, syncAdmins, globalStats, userCount } from './src/botState.js';
import { universalResolve, detectSource, supportedPlatforms } from './src/playlistResolver.js';
import { addFavorite, listFavorites, removeFavorite, favoritesCount, exportFavoritesAsTerms } from './src/favorites.js';
import { downloadBatch } from './src/downloader.js';

dotenv.config();

// ============================================================
//  CONFIG ENV
// ============================================================

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN nao encontrado no .env');
    process.exit(1);
}

const ALLOWED = String(process.env.ALLOWED_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
const ADMINS = String(process.env.ADMIN_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
const RATE_LIMIT_MS = Number(process.env.RATE_LIMIT_MS || 1500);
const DAILY_QUOTA = Number(process.env.DAILY_QUOTA || 50);
const MAX_CONCURRENT_DOWNLOADS = Number(process.env.MAX_CONCURRENT_DOWNLOADS || 3);
const PLAYLIST_MAX = Number(process.env.PLAYLIST_MAX_TRACKS || 150);
const AUTO_UPDATE_YTDLP = process.env.AUTO_UPDATE_YTDLP === '1';
const MAX_FILE_MB_TELEGRAM = 49;
const CACHE_DIR = path.join(getAppDir(), 'bot-cache');

if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
requireDependencies();
syncAdmins(ADMINS);

// ============================================================
//  CONCORRENCIA GLOBAL
// ============================================================

let activeDownloads = 0;
const downloadQueue = [];

function acquireSlot() {
    return new Promise((resolve) => {
        const tryAcquire = () => {
            if (activeDownloads < MAX_CONCURRENT_DOWNLOADS) { activeDownloads += 1; resolve(); }
            else { downloadQueue.push(tryAcquire); }
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

function isAdmin(ctx) { return ADMINS.includes(String(ctx.from?.id)); }

function userCacheDir(userId) {
    // Mesmo path que o downloader vai usar (com sanitizeName).
    const dir = path.join(CACHE_DIR, sanitizeName(String(userId)));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function cleanUserCache(userId) {
    const dir = userCacheDir(userId);
    try { for (const f of fs.readdirSync(dir)) { try { fs.unlinkSync(path.join(dir, f)); } catch {} } } catch {}
}

async function safeEdit(ctx, msg, text, extra = {}) {
    try { await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, text, extra); } catch {}
}

function isPlatformUrl(text) {
    return detectSource(text) !== null;
}

// ============================================================
//  BOT SETUP
// ============================================================

const bot = new Telegraf(BOT_TOKEN);
const userState = new Map();
function getConvState(uid) { if (!userState.has(uid)) userState.set(uid, {}); return userState.get(uid); }

// ============================================================
//  MIDDLEWARES
// ============================================================

bot.use(async (ctx, next) => {
    if (!ALLOWED.length) return next();
    const id = String(ctx.from?.id || '');
    if (!ALLOWED.includes(id)) return ctx.reply('⛔ Acesso restrito.');
    return next();
});

bot.use(async (ctx, next) => {
    if (!ctx.from) return next();
    const user = getUser(ctx.from);
    ctx.user = user;
    if (user.blocked) return ctx.reply('🚫 Voce foi bloqueado pelo administrador.');
    return next();
});

bot.use(async (ctx, next) => {
    const uid = ctx.from?.id;
    if (!uid) return next();
    const st = getConvState(uid);
    const now = Date.now();
    if (st.lastMsgAt && now - st.lastMsgAt < RATE_LIMIT_MS) return ctx.reply('⏱️ Calma! Aguarde um instante.');
    st.lastMsgAt = now;
    return next();
});



// ============================================================
//  COMANDOS PUBLICOS
// ============================================================

bot.start((ctx) =>
    ctx.reply(
        '🌌 *Horizon Bot v2.5 — Universal*\n\n' +
        'Cole qualquer link e eu baixo pra voce:\n' +
        '▶️ YouTube · 🟢 Spotify · 🎵 Deezer\n' +
        '🟠 SoundCloud · 🍎 Apple Music · 🌊 Tidal\n\n' +
        '📌 *Comandos:*\n' +
        '/search <termo> — buscar musica\n' +
        '/spotify <url> — baixar do Spotify\n' +
        '/deezer <url> — baixar do Deezer\n' +
        '/soundcloud <url> — baixar do SoundCloud\n' +
        '/playlist <url> — baixar playlist inteira\n' +
        '/fav — seus favoritos\n' +
        '/quality <128|192|256|320> — mudar qualidade\n' +
        '/platforms — plataformas suportadas\n' +
        '/me — perfil e quota\n' +
        '/stats — estatisticas\n' +
        '/help — ajuda completa\n' +
        '/cancel — cancela acao atual',
        { parse_mode: 'Markdown' },
    ),
);

bot.command('help', (ctx) =>
    ctx.reply(
        '📖 *Ajuda Horizon Bot v2.5*\n\n' +
        '*Como usar:*\n' +
        '• Mande um *nome* → busco e mostro opcoes\n' +
        '• Mande um *link* de qualquer plataforma → baixo direto\n' +
        '• Mande uma *playlist* → confirmo e baixo tudo\n\n' +
        '*Plataformas suportadas:*\n' +
        '▶️ YouTube | 🟢 Spotify | 🎵 Deezer\n' +
        '🟠 SoundCloud | 🍎 Apple Music | 🌊 Tidal\n\n' +
        '*Comandos especiais:*\n' +
        '/spotify <url> — resolve e baixa do Spotify\n' +
        '/playlist <url> — playlist completa\n' +
        '/fav — gerenciar favoritos\n' +
        '/quality 320 — mudar qualidade pra 320K\n\n' +
        `*Limites:* ${DAILY_QUOTA} downloads/dia, max ${MAX_FILE_MB_TELEGRAM}MB por arquivo.`,
        { parse_mode: 'Markdown' },
    ),
);

bot.command('cancel', (ctx) => {
    userState.delete(ctx.from.id);
    return ctx.reply('🚫 Acao cancelada.');
});

bot.command('platforms', (ctx) => {
    const plats = supportedPlatforms();
    const lines = ['🌐 *Plataformas suportadas:*\n'];
    for (const p of plats) {
        lines.push(`${p.emoji} *${p.name}* — ${p.patterns.join(', ')}`);
    }
    lines.push('\n💡 Cole qualquer link dessas plataformas e eu resolvo automaticamente!');
    return ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
});

bot.command('quality', (ctx) => {
    const q = ctx.message.text.split(/\s+/)[1];
    const valid = ['128', '192', '256', '320'];
    if (!q || !valid.includes(q)) return ctx.reply(`Uso: /quality <${valid.join('|')}>\nAtual: ${loadSettings().quality}K`);
    const conv = getConvState(ctx.from.id);
    conv.qualityOverride = Number(q);
    return ctx.reply(`✅ Qualidade alterada para *${q}K* (para seus proximos downloads).`, { parse_mode: 'Markdown' });
});

bot.command('me', (ctx) => {
    const u = ctx.user;
    const restante = Math.max(0, DAILY_QUOTA - (u.todayDownloads || 0));
    return ctx.reply(
        `👤 *Seu perfil*\n\n` +
        `Nome: ${u.name}\nID: \`${u.id}\`\nMembro desde: ${u.firstSeen.slice(0, 10)}\n\n` +
        `📥 *Downloads*\nHoje: ${u.todayDownloads || 0} / ${DAILY_QUOTA}\nRestante: ${restante}\nTotal: ${u.totalDownloads || 0}\n` +
        `⭐ Favoritos: ${favoritesCount()}\n` +
        (u.isAdmin ? '\n👑 Voce e admin.' : ''),
        { parse_mode: 'Markdown' },
    );
});

bot.command('stats', (ctx) => {
    const s = summary();
    const g = globalStats();
    const c = circuitOpen();
    const lines = [
        '📊 *Estatisticas globais*', '',
        `*Downloads:*\n  Sucesso: ${s.ok}\n  Erros: ${s.err}\n  Hoje: ${g.todayDownloads}`, '',
        `*Usuarios:*\n  Cadastrados: ${g.users}\n  Ativos (7d): ${g.active7d}\n  Bloqueados: ${g.blocked}`, '',
        `*Servidor:*\n  Ativos: ${activeDownloads}/${MAX_CONCURRENT_DOWNLOADS}\n  Fila bot: ${downloadQueue.length}`,
    ];
    if (c.open) {
        const min = Math.ceil(c.remainingMs / 60_000);
        lines.push('', `🛡️ *Anti-ban ATIVO* (~${min}min) — ${c.reason}`);
    }
    return ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
});

bot.command('search', async (ctx) => {
    const q = ctx.message.text.replace(/^\/search\s*/i, '').trim();
    if (!q) return ctx.reply('Uso: /search <termo>');
    return handleSearchQuery(ctx, q);
});

// ============================================================
//  NOVOS COMANDOS v2.5
// ============================================================

bot.command('spotify', async (ctx) => {
    const url = ctx.message.text.replace(/^\/spotify\s*/i, '').trim();
    if (!url) return ctx.reply('Uso: /spotify <link do Spotify>\nEx: /spotify https://open.spotify.com/track/...');
    return handleUniversalDownload(ctx, url, 'spotify');
});

bot.command('deezer', async (ctx) => {
    const url = ctx.message.text.replace(/^\/deezer\s*/i, '').trim();
    if (!url) return ctx.reply('Uso: /deezer <link do Deezer>');
    return handleUniversalDownload(ctx, url, 'deezer');
});

bot.command('soundcloud', async (ctx) => {
    const url = ctx.message.text.replace(/^\/soundcloud\s*/i, '').trim();
    if (!url) return ctx.reply('Uso: /soundcloud <link do SoundCloud>');
    return handleUniversalDownload(ctx, url, 'soundcloud');
});

bot.command('playlist', async (ctx) => {
    const url = ctx.message.text.replace(/^\/playlist\s*/i, '').trim();
    if (!url) return ctx.reply('Uso: /playlist <url>\nFunciona com YouTube, Spotify, Deezer, SoundCloud...');
    const source = detectSource(url);
    if (!source) return ctx.reply('❌ Link nao reconhecido. Use /platforms pra ver suportados.');
    const buttons = Markup.inlineKeyboard([
        [Markup.button.callback(`✅ Sim, baixar playlist (max ${PLAYLIST_MAX})`, `upl_yes`)],
        [Markup.button.callback('❌ Cancelar', 'cancel')],
    ]);
    const conv = getConvState(ctx.from.id);
    conv.pendingUrl = url;
    conv.pendingKind = 'universal_playlist';
    return ctx.reply(
        `📦 Detectei: *${source.platform}* (${source.type})\nPosso baixar agora?`,
        { parse_mode: 'Markdown', ...buttons },
    );
});

bot.command('fav', async (ctx) => {
    const args = ctx.message.text.replace(/^\/fav\s*/i, '').trim();
    if (!args || args === 'list') {
        const favs = listFavorites({ limit: 10 });
        if (!favs.length) return ctx.reply('⭐ Nenhum favorito ainda. Use /fav add <nome> para adicionar.');
        const lines = ['⭐ *Seus favoritos:*\n'];
        favs.forEach((f, i) => { lines.push(`${i + 1}. ${f.title}${f.artist ? ` — ${f.artist}` : ''}`); });
        lines.push(`\nTotal: ${favoritesCount()}`);
        return ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
    }
    if (args.startsWith('add ')) {
        const title = args.slice(4).trim();
        if (!title) return ctx.reply('Uso: /fav add <nome da musica>');
        const res = addFavorite({ title, source: 'telegram' });
        if (res.duplicate) return ctx.reply('⚠️ Ja esta nos favoritos!');
        return ctx.reply(`⭐ Adicionado: "${title}"`);
    }
    if (args.startsWith('remove ')) {
        const id = args.slice(7).trim();
        if (removeFavorite(id)) return ctx.reply('✅ Removido dos favoritos.');
        return ctx.reply('❌ Nao encontrado.');
    }
    if (args === 'download') {
        const favs = listFavorites({});
        if (!favs.length) return ctx.reply('⭐ Nenhum favorito pra baixar.');
        const conv = getConvState(ctx.from.id);
        conv.pendingUrl = '__favs__';
        conv.pendingKind = 'fav_download';
        const buttons = Markup.inlineKeyboard([
            [Markup.button.callback(`✅ Baixar ${favs.length} favoritos`, 'fav_dl_yes')],
            [Markup.button.callback('❌ Cancelar', 'cancel')],
        ]);
        return ctx.reply(`⭐ Baixar todos os ${favs.length} favoritos?`, buttons);
    }
    return ctx.reply('Uso: /fav [list|add <nome>|remove <id>|download]');
});



// ============================================================
//  COMANDOS ADMIN
// ============================================================

bot.command('admin_users', (ctx) => {
    if (!isAdmin(ctx)) return;
    const users = listAllUsers().slice(-20);
    const lines = ['👥 *Ultimos 20 usuarios:*\n'];
    for (const u of users) {
        const flag = u.blocked ? '🚫' : u.isAdmin ? '👑' : '👤';
        lines.push(`${flag} \`${u.id}\` ${u.name} — ${u.totalDownloads || 0} dl`);
    }
    return ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' });
});

bot.command('admin_block', (ctx) => {
    if (!isAdmin(ctx)) return;
    const id = ctx.message.text.split(/\s+/)[1];
    if (!id) return ctx.reply('Uso: /admin_block <id>');
    if (setBlocked(id, true)) return ctx.reply(`🚫 Usuario ${id} bloqueado.`);
    return ctx.reply('Usuario nao encontrado.');
});

bot.command('admin_unblock', (ctx) => {
    if (!isAdmin(ctx)) return;
    const id = ctx.message.text.split(/\s+/)[1];
    if (!id) return ctx.reply('Uso: /admin_unblock <id>');
    if (setBlocked(id, false)) return ctx.reply(`✅ Usuario ${id} desbloqueado.`);
    return ctx.reply('Usuario nao encontrado.');
});

bot.command('admin_broadcast', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const msg = ctx.message.text.replace(/^\/admin_broadcast\s*/i, '').trim();
    if (!msg) return ctx.reply('Uso: /admin_broadcast <mensagem>');
    const users = listAllUsers().filter((u) => !u.blocked);
    let ok = 0, err = 0;
    for (const u of users) {
        try { await ctx.telegram.sendMessage(u.id, `📢 *Admin:*\n\n${msg}`, { parse_mode: 'Markdown' }); ok++; await new Promise((r) => setTimeout(r, 50)); } catch { err++; }
    }
    return ctx.reply(`📢 Broadcast: ${ok} enviadas, ${err} falharam.`);
});

bot.command('admin_reset', (ctx) => {
    if (!isAdmin(ctx)) return;
    resetCircuit();
    return ctx.reply('🛡️ Circuit breaker resetado.');
});

// ============================================================
//  HANDLERS DE DOWNLOAD UNIVERSAL
// ============================================================

async function handleSearchQuery(ctx, query) {
    const msg = await ctx.reply(`🔍 Buscando: "${query}"...`);
    try {
        const results = await searchYoutube(query, 5);
        if (!results.length) return safeEdit(ctx, msg, '⚠️ Nenhum resultado.');
        const buttons = results.map((r) => [Markup.button.callback(r.title.slice(0, 55), `dl_${r.videoId}`)]);
        buttons.push([Markup.button.callback('❌ Cancelar', 'cancel')]);
        await safeEdit(ctx, msg, '🎵 Escolha:', Markup.inlineKeyboard(buttons));
    } catch (err) {
        log.error(`bot: search fail: ${err.message}`);
        return safeEdit(ctx, msg, '❌ Erro na busca.');
    }
}

async function handleUniversalDownload(ctx, url, expectedPlatform) {
    const userId = ctx.from.id;
    const user = ctx.user;

    if (!user.isAdmin && (user.todayDownloads || 0) >= DAILY_QUOTA) {
        return ctx.reply(`🛑 Quota diaria atingida (${DAILY_QUOTA}).`);
    }

    const cb = circuitOpen();
    if (cb.open) {
        const min = Math.ceil(cb.remainingMs / 60_000);
        return ctx.reply(`⛔ Servidor pausado (~${min}min). Motivo: ${cb.reason}`);
    }

    const source = detectSource(url);
    if (!source) return ctx.reply('❌ Link nao reconhecido. Use /platforms.');
    if (expectedPlatform && source.platform !== expectedPlatform) {
        return ctx.reply(`⚠️ Esperava link do ${expectedPlatform}, mas recebi ${source.platform}.`);
    }

    // Pasta efemera: musicBaseDir aponta pra parent, e a "playlist" e o sanitize do userId.
    // O downloader usa sanitizeName, entao recriamos o mesmo caminho aqui pra ler depois.
    const playlistName = String(userId);
    const sanitized = sanitizeName(playlistName);
    const baseDir = path.join(getAppDir(), 'bot-cache');
    const cacheDir = path.join(baseDir, sanitized);
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    const overrides = { musicBaseDir: baseDir };

    const statusMsg = await ctx.reply(`🚀 Resolvendo ${source.platform} (${source.type})...`);

    await acquireSlot();
    try {
        const res = await universalResolve(url, {
            playlist: playlistName,
            overrides,
            silent: true,
            maxTracks: PLAYLIST_MAX,
        });

        if (!res.ok) {
            const errMsg = res.error
                ? `❌ ${res.error}`
                : '❌ Falha no download. Tente outro link ou aguarde alguns minutos.';
            await safeEdit(ctx, statusMsg, errMsg.slice(0, 350));
            return;
        }

        // Lista arquivos baixados na pasta efemera.
        const files = listAudioFilesIn(cacheDir);
        const sendable = files.filter((f) => f.sizeMB <= MAX_FILE_MB_TELEGRAM);
        const tooBig = files.filter((f) => f.sizeMB > MAX_FILE_MB_TELEGRAM);

        if (!files.length) {
            await safeEdit(ctx, statusMsg, '⚠️ Download concluido mas nenhum arquivo de audio encontrado. O resolver pode ter falhado em encontrar a faixa no YouTube.');
            return;
        }

        if (!sendable.length) {
            await safeEdit(ctx, statusMsg, `⚠️ Arquivo(s) muito grande(s) para o Telegram (max ${MAX_FILE_MB_TELEGRAM}MB). Use qualidade menor com /quality 128.`);
            return;
        }

        await safeEdit(ctx, statusMsg, `📤 Enviando ${sendable.length} arquivo(s)...`);
        let sent = 0;
        for (const f of sendable) {
            try {
                await ctx.replyWithAudio({ source: f.full, filename: f.name });
                incrementDownload(userId);
                sent++;
                if (sendable.length > 1) await new Promise((r) => setTimeout(r, 400));
            } catch (err) {
                log.warn(`bot: send fail ${f.name}: ${err.message}`);
            }
        }

        const finalLines = [`✅ Pronto! ${sent}/${files.length} enviado(s).`];
        if (tooBig.length) finalLines.push(`⚠️ ${tooBig.length} ignorado(s) por tamanho.`);
        await safeEdit(ctx, statusMsg, finalLines.join('\n'));
    } catch (err) {
        log.error(`bot: universal dl fail: ${err.message}`);
        await safeEdit(ctx, statusMsg, `❌ Erro: ${String(err.message).slice(0, 200)}`);
    } finally {
        cleanUserCache(userId);
        releaseSlot();
    }
}

/** Lista arquivos de audio em uma pasta com tamanho em MB. */
function listAudioFilesIn(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter((f) => /\.(mp3|m4a|opus|flac)$/i.test(f))
        .map((name) => {
            const full = path.join(dir, name);
            const stat = fs.statSync(full);
            return { name, full, sizeMB: stat.size / 1024 / 1024, mtime: stat.mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);
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

    if (conv.busy) return ctx.reply('⏳ Ja estou processando seu pedido. Aguarde ou /cancel.');

    // Quota
    if (!user.isAdmin && (user.todayDownloads || 0) >= DAILY_QUOTA) {
        return ctx.reply(`🛑 Quota diaria atingida (${DAILY_QUOTA}).`);
    }

    // Circuit breaker
    const cb = circuitOpen();
    if (cb.open) {
        const min = Math.ceil(cb.remainingMs / 60_000);
        return ctx.reply(`⛔ Servidor pausado (~${min}min). Motivo: ${cb.reason}`);
    }

    conv.busy = true;
    try {
        // Detecta se e um link de qualquer plataforma
        const source = detectSource(text);

        if (source && source.platform !== 'direct') {
            // Link de plataforma reconhecida — usa resolver universal
            if (source.type === 'playlist' || source.type === 'album') {
                // Playlist: confirma antes
                const buttons = Markup.inlineKeyboard([
                    [Markup.button.callback(`✅ Baixar ${source.type} (max ${PLAYLIST_MAX})`, 'upl_yes')],
                    [Markup.button.callback('❌ Cancelar', 'cancel')],
                ]);
                conv.pendingUrl = text;
                conv.pendingKind = 'universal_playlist';
                await ctx.reply(
                    `📦 Detectei: *${source.platform}* (${source.type})\nBaixar agora?`,
                    { parse_mode: 'Markdown', ...buttons },
                );
            } else {
                // Track individual — baixa direto
                await handleUniversalDownload(ctx, text, null);
            }
        } else if (isYoutubeUrl(text)) {
            // YouTube direto — usa resolver universal (que delega pra downloader.js)
            if (isPlaylistUrl(text)) {
                const buttons = Markup.inlineKeyboard([
                    [Markup.button.callback(`✅ Baixar playlist (max ${PLAYLIST_MAX})`, 'upl_yes')],
                    [Markup.button.callback('❌ Cancelar', 'cancel')],
                ]);
                conv.pendingUrl = text;
                conv.pendingKind = 'universal_playlist';
                await ctx.reply('📦 Playlist do YouTube detectada. Baixar?', { ...buttons });
            } else {
                await handleUniversalDownload(ctx, text, null);
            }
        } else {
            // Termo de busca
            await handleSearchQuery(ctx, text);
        }
    } finally {
        conv.busy = false;
    }
});

// ============================================================
//  CALLBACKS
// ============================================================

bot.action('cancel', async (ctx) => {
    userState.delete(ctx.from.id);
    await ctx.answerCbQuery('Cancelado');
    try { await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); } catch {}
    return ctx.reply('🚫 Cancelado.');
});

bot.action(/^dl_(.+)$/, async (ctx) => {
    const videoId = ctx.match[1];
    await ctx.answerCbQuery();
    try { await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); } catch {}
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const conv = getConvState(ctx.from.id);
    if (conv.busy) return ctx.reply('⏳ Ja estou processando outro pedido.');
    conv.busy = true;
    try {
        await handleUniversalDownload(ctx, url, null);
    } finally {
        conv.busy = false;
    }
});

bot.action('upl_yes', async (ctx) => {
    const conv = getConvState(ctx.from.id);
    const url = conv.pendingUrl;
    if (!url) return ctx.answerCbQuery('Pedido expirado.');
    if (conv.busy) return ctx.answerCbQuery('Ja estou processando!');
    await ctx.answerCbQuery();
    try { await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); } catch {}
    conv.pendingUrl = null;
    conv.pendingKind = null;
    conv.busy = true;
    try {
        await handleUniversalDownload(ctx, url, null);
    } finally {
        conv.busy = false;
    }
});

bot.action('fav_dl_yes', async (ctx) => {
    const conv = getConvState(ctx.from.id);
    if (conv.busy) return ctx.answerCbQuery('Ja estou processando!');
    await ctx.answerCbQuery();
    try { await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); } catch {}

    const terms = exportFavoritesAsTerms();
    if (!terms.length) return ctx.reply('⭐ Nenhum favorito.');

    const userId = ctx.from.id;
    const playlistName = String(userId);
    const sanitized = sanitizeName(playlistName);
    const baseDir = path.join(getAppDir(), 'bot-cache');
    const cacheDir = path.join(baseDir, sanitized);
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    const overrides = { musicBaseDir: baseDir };

    const statusMsg = await ctx.reply(`⏳ Baixando ${terms.length} favoritos...`);
    conv.busy = true;
    await acquireSlot();
    try {
        await downloadBatch(terms.slice(0, PLAYLIST_MAX), { playlist: playlistName, overrides });

        const files = listAudioFilesIn(cacheDir).filter((f) => f.sizeMB <= MAX_FILE_MB_TELEGRAM);
        let sent = 0;
        for (const f of files) {
            try {
                await ctx.replyWithAudio({ source: f.full, filename: f.name });
                incrementDownload(userId);
                sent++;
                await new Promise((r) => setTimeout(r, 400));
            } catch (err) {
                log.warn(`bot: fav send fail ${f.name}: ${err.message}`);
            }
        }
        await safeEdit(ctx, statusMsg, `✅ Favoritos: ${sent}/${terms.length} enviados.`);
    } catch (err) {
        await safeEdit(ctx, statusMsg, `❌ Erro: ${String(err.message).slice(0, 200)}`);
    } finally {
        cleanUserCache(userId);
        releaseSlot();
        conv.busy = false;
    }
});

// ============================================================
//  LIFECYCLE
// ============================================================

bot.catch((err, ctx) => {
    log.error(`bot: erro ${ctx?.updateType} — ${err.message}`);
    console.error('[bot] erro', err);
});

console.log('🌌 Horizon Bot v2.5.1 (Universal Fixed) iniciando...');
console.log(`   Users: ${userCount()} | Whitelist: ${ALLOWED.length ? ALLOWED.join(', ') : 'ABERTA'}`);
console.log(`   Admins: ${ADMINS.length ? ADMINS.join(', ') : 'NENHUM'}`);
console.log(`   Quota: ${DAILY_QUOTA}/dia | Concorrencia: ${MAX_CONCURRENT_DOWNLOADS}`);
console.log(`   Plataformas: YouTube, Spotify, Deezer, SoundCloud, Apple Music, Tidal`);

(async () => {
    if (AUTO_UPDATE_YTDLP) { try { updateYtDlp(); } catch {} }
    await bot.launch();
    console.log('✅ Bot online.');
    log.info('bot: online v2.5.1');
})();

const shutdown = async (sig) => {
    console.log(`\n👋 ${sig} — encerrando...`);
    bot.stop(sig);
    try {
        if (fs.existsSync(CACHE_DIR)) {
            for (const dir of fs.readdirSync(CACHE_DIR)) {
                const full = path.join(CACHE_DIR, dir);
                if (fs.statSync(full).isDirectory()) {
                    for (const f of fs.readdirSync(full)) { try { fs.unlinkSync(path.join(full, f)); } catch {} }
                }
            }
        }
    } catch {}
    process.exit(0);
};
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
