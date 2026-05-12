/**
 * HORIZON BOT — Telegram
 *
 * Melhorias v2:
 *  - Whitelist de usuários (opcional) via ALLOWED_USER_IDS.
 *  - Fila de jobs por usuário (evita corrida de estados).
 *  - Rate-limit simples (cooldown entre mensagens).
 *  - Mensagens editadas em vez de spam (anti-spam).
 *  - Comandos: /start, /help, /search, /stats, /cancel.
 *  - Graceful shutdown (SIGINT / SIGTERM).
 *  - Reusa a camada src/ (downloader, history, config, utils).
 */

import { Telegraf, Markup } from 'telegraf';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

import { getMusicBaseDir, loadSettings, sanitizeName } from './src/config.js';
import { isYoutubeUrl, isOtherPlatform, isPlaylistUrl } from './src/utils.js';
import {
    searchYoutube,
    downloadOne,
    downloadPlaylist,
} from './src/downloader.js';
import { requireDependencies } from './src/deps.js';
import { summary } from './src/history.js';

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
    console.error('❌ ERRO: BOT_TOKEN não encontrado no .env');
    console.error('   Copie .env.example para .env e preencha seu token.');
    process.exit(1);
}

requireDependencies();

const ALLOWED = String(process.env.ALLOWED_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const RATE_LIMIT_MS = Number(process.env.RATE_LIMIT_MS || 1500);
const MAX_FILE_MB_TELEGRAM = 49; // limite prático do Telegram ~50MB p/ bots normais

const bot = new Telegraf(BOT_TOKEN);

// Estado por usuário: { step, url|videoId, lastMsgAt, busy }
const userState = new Map();
function getState(userId) {
    if (!userState.has(userId)) userState.set(userId, {});
    return userState.get(userId);
}

// ============================================================
//  MIDDLEWARES
// ============================================================

// Whitelist (se configurada).
bot.use(async (ctx, next) => {
    if (!ALLOWED.length) return next();
    const id = String(ctx.from?.id || '');
    if (!ALLOWED.includes(id)) {
        return ctx.reply('⛔ Acesso restrito. Seu ID não está na whitelist.');
    }
    return next();
});

// Rate-limit simples.
bot.use(async (ctx, next) => {
    const uid = ctx.from?.id;
    if (!uid) return next();
    const st = getState(uid);
    const now = Date.now();
    if (st.lastMsgAt && now - st.lastMsgAt < RATE_LIMIT_MS) {
        return ctx.reply('⏱️  Calma aí! Aguarde um instante entre mensagens.');
    }
    st.lastMsgAt = now;
    return next();
});

// ============================================================
//  COMANDOS
// ============================================================

bot.start((ctx) =>
    ctx.reply(
        '🌌 *Horizon Bot v2*\n\n' +
            'Envie o nome de uma música, um link do YouTube ou uma playlist do YouTube.\n\n' +
            '📌 Comandos:\n' +
            '/search <termo> — buscar 5 opções\n' +
            '/stats — estatísticas de download\n' +
            '/cancel — cancelar a ação atual\n' +
            '/help — ajuda detalhada\n\n' +
            '💡 *Spotify/Deezer/Apple:* converta sua playlist em *TuneMyMusic.com* e cole o link do YouTube aqui.',
        { parse_mode: 'Markdown' },
    ),
);

bot.command('help', (ctx) =>
    ctx.reply(
        '📖 *Ajuda Horizon*\n\n' +
            '• Mande um *nome* → mostro 5 opções.\n' +
            '• Mande um *link do YouTube* → baixo direto.\n' +
            '• Mande uma *playlist do YouTube* → baixo tudo.\n' +
            '• /stats — total baixado / erros.\n' +
            '• /cancel — cancela o passo atual.\n\n' +
            '⚙️  Configurações (formato/qualidade) são editadas pelo CLI: `horizon config`',
        { parse_mode: 'Markdown' },
    ),
);

bot.command('cancel', (ctx) => {
    userState.delete(ctx.from.id);
    return ctx.reply('🚫 Ação cancelada.');
});

bot.command('stats', (ctx) => {
    const s = summary();
    return ctx.reply(
        `📊 *Estatísticas*\n\n` +
            `Total: ${s.total}\n` +
            `✅ Sucesso: ${s.ok}\n` +
            `❌ Erros: ${s.err}`,
        { parse_mode: 'Markdown' },
    );
});

bot.command('search', async (ctx) => {
    const q = ctx.message.text.replace(/^\/search\s*/i, '').trim();
    if (!q) return ctx.reply('Uso: /search <termo>');
    return handleSearchQuery(ctx, q);
});

// ============================================================
//  HANDLERS
// ============================================================

async function handleSearchQuery(ctx, query) {
    const msg = await ctx.reply(`🔍 Buscando: "${query}"...`);
    try {
        const results = await searchYoutube(query, 5);
        if (!results.length) {
            return ctx.telegram.editMessageText(
                ctx.chat.id,
                msg.message_id,
                undefined,
                '⚠️ Nenhum resultado.',
            );
        }
        const buttons = results.map((r) => [
            Markup.button.callback(r.title.slice(0, 55), `dl_${r.videoId}`),
        ]);
        buttons.push([Markup.button.callback('❌ Cancelar', 'cancel')]);
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            msg.message_id,
            undefined,
            '🎵 Escolha a versão:',
            Markup.inlineKeyboard(buttons),
        );
    } catch (err) {
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            msg.message_id,
            undefined,
            '❌ Erro na busca.',
        );
    }
}

async function performDownload(ctx, statusMsg, target, playlistName, isPlaylist) {
    const folder = sanitizeName(playlistName);
    try {
        if (isPlaylist) {
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                statusMsg.message_id,
                undefined,
                `📦 Baixando playlist em "${folder}"... isso pode demorar.`,
            );
            const res = await downloadPlaylist({ url: target, playlist: folder });
            const finalTxt = res.ok
                ? `✅ Playlist salva em: Horizon/${folder}`
                : '❌ Erro ao baixar a playlist.';
            return ctx.telegram.editMessageText(
                ctx.chat.id,
                statusMsg.message_id,
                undefined,
                finalTxt,
            );
        }

        await ctx.telegram.editMessageText(
            ctx.chat.id,
            statusMsg.message_id,
            undefined,
            `⏳ Baixando em "${folder}"...`,
        );

        const res = await downloadOne({
            target,
            playlist: folder,
            isSearchTerm: !isYoutubeUrl(target),
        });

        if (!res.ok) {
            return ctx.telegram.editMessageText(
                ctx.chat.id,
                statusMsg.message_id,
                undefined,
                '❌ Erro no download. O YouTube pode ter bloqueado ou o link é inválido.',
            );
        }

        // Envia o arquivo mais recente do diretório se couber no limite do Telegram.
        const files = fs
            .readdirSync(res.dir)
            .filter((f) => /\.(mp3|m4a|opus|flac)$/i.test(f))
            .map((name) => {
                const full = path.join(res.dir, name);
                const stat = fs.statSync(full);
                return { name, full, mtime: stat.mtimeMs, sizeMB: stat.size / 1024 / 1024 };
            })
            .sort((a, b) => b.mtime - a.mtime);

        const latest = files[0];
        if (!latest) {
            return ctx.telegram.editMessageText(
                ctx.chat.id,
                statusMsg.message_id,
                undefined,
                `✅ Salvo em: Horizon/${folder}`,
            );
        }

        if (latest.sizeMB > MAX_FILE_MB_TELEGRAM) {
            return ctx.telegram.editMessageText(
                ctx.chat.id,
                statusMsg.message_id,
                undefined,
                `✅ Salvo em: Horizon/${folder}/${latest.name}\n⚠️  Arquivo muito grande (${latest.sizeMB.toFixed(1)}MB) para envio pelo Telegram.`,
            );
        }

        try {
            await ctx.replyWithAudio({ source: latest.full });
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                statusMsg.message_id,
                undefined,
                `✅ Salvo em: Horizon/${folder}/${latest.name}`,
            );
        } catch (e) {
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                statusMsg.message_id,
                undefined,
                `✅ Salvo no celular, mas falhou o envio pelo Telegram (${e.message || 'erro'}).`,
            );
        }
    } catch (err) {
        try {
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                statusMsg.message_id,
                undefined,
                `❌ Erro inesperado: ${String(err.message || err).slice(0, 200)}`,
            );
        } catch {
            /* ignore */
        }
    }
}

// Mensagens de texto (roteador principal).
bot.on('text', async (ctx) => {
    // Ignora comandos — já tratados acima.
    if (ctx.message.text.startsWith('/')) return;

    const uid = ctx.from.id;
    const text = ctx.message.text.trim();
    const state = getState(uid);

    if (state.busy) {
        return ctx.reply('⏳ Ainda estou processando seu pedido anterior. Aguarde ou use /cancel.');
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

    // Se estamos esperando o nome da pasta.
    if (state.step === 'AWAITING_FOLDER') {
        const target = state.url || `https://youtu.be/${state.videoId}`;
        const isPlaylist = state.forcedPlaylist || isPlaylistUrl(target);
        const statusMsg = await ctx.reply('🚀 Iniciando download...');
        state.busy = true;
        try {
            await performDownload(ctx, statusMsg, target, text, isPlaylist);
        } finally {
            state.busy = false;
            userState.delete(uid);
        }
        return;
    }

    // URL do YouTube.
    if (isYoutubeUrl(text)) {
        state.step = 'AWAITING_FOLDER';
        state.url = text;
        state.forcedPlaylist = isPlaylistUrl(text);
        const s = loadSettings();
        return ctx.reply(
            `🔗 Link detectado${state.forcedPlaylist ? ' *(playlist inteira)*' : ''}.\n` +
                `Em qual pasta você quer salvar? (padrão: ${s.defaultPlaylist})`,
            { parse_mode: 'Markdown' },
        );
    }

    // Busca por termo.
    return handleSearchQuery(ctx, text);
});

// Callback dos botões de busca.
bot.action('cancel', async (ctx) => {
    userState.delete(ctx.from.id);
    await ctx.answerCbQuery('Cancelado');
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    return ctx.reply('🚫 Ação cancelada.');
});

bot.action(/^dl_(.+)$/, async (ctx) => {
    const videoId = ctx.match[1];
    const uid = ctx.from.id;
    const state = getState(uid);
    state.step = 'AWAITING_FOLDER';
    state.videoId = videoId;
    state.url = null;
    state.forcedPlaylist = false;

    await ctx.answerCbQuery();
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    const s = loadSettings();
    return ctx.reply(`📁 Em qual pasta? (padrão: ${s.defaultPlaylist})`);
});

// ============================================================
//  LIFECYCLE
// ============================================================

bot.catch((err, ctx) => {
    console.error('[bot] erro no update', ctx?.updateType, err);
});

console.log('🌌 Horizon Bot iniciando...');
console.log(`   Base Dir: ${getMusicBaseDir()}`);
console.log(`   Whitelist: ${ALLOWED.length ? ALLOWED.join(', ') : 'aberta (sem whitelist)'}`);

bot.launch().then(() => console.log('✅ Bot online.'));

const shutdown = (sig) => {
    console.log(`\n👋 ${sig} recebido. Encerrando bot...`);
    bot.stop(sig);
    process.exit(0);
};
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
