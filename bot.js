import { Telegraf, Markup } from 'telegraf';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import util from 'util';

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
    console.error("❌ ERRO: Token não encontrado no arquivo .env");
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const baseDir = "/sdcard/Music/Horizon";
const execPromise = util.promisify(exec);

// Memória temporária para guardar a escolha do usuário
const userState = new Map();

bot.start((ctx) => {
    ctx.reply(
        '🌌 *Horizon Bot!*\n\n' +
        'Envie o nome da música para buscar, ou cole um link do YouTube.\n\n' +
        '💡 *DICA PARA SPOTIFY / DEEZER:*\n' +
        'O Horizon baixa nativamente do YouTube. Se tiver uma playlist em outro app, acesse *TuneMyMusic.com*, converta para o YouTube e cole o link aqui!',
        { parse_mode: 'Markdown' }
    );
});

// Quando o usuário envia um texto
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();

    // 1. ALERTA INTELIGENTE PARA OUTRAS PLATAFORMAS (TuneMyMusic)
    if (text.includes('spotify.com') || text.includes('deezer.com') || text.includes('apple.com')) {
        return ctx.reply(
            '💡 *AVISO: MÚSICAS DE OUTRAS PLATAFORMAS*\n\n' +
            'Para baixar do Spotify, Deezer ou Apple Music:\n' +
            '1. Acesse o site gratuito *TuneMyMusic.com*\n' +
            '2. Converta sua playlist de lá para o YouTube.\n' +
            '3. Cole o link da nova playlist do YouTube aqui no chat.',
            { parse_mode: 'Markdown' }
        );
    }

    // 2. SE ESTIVER ESPERANDO A PASTA (PLAYLIST)
    if (userState.has(userId) && userState.get(userId).step === 'ESPERANDO_PLAYLIST') {
        const data = userState.get(userId);
        const playlistName = text;
        const playlistDir = path.join(baseDir, playlistName);

        if (!fs.existsSync(playlistDir)) fs.mkdirSync(playlistDir, { recursive: true });

        // Envia a mensagem de status (Vamos editar ela depois em vez de mandar várias)
        const statusMsg = await ctx.reply(`⏳ Iniciando os motores... Baixando em "${playlistName}".`);
        userState.delete(userId); // Limpa a memória

        const urlToDownload = data.url ? data.url : `https://youtu.be/${data.videoId}`;
        const isPlaylist = urlToDownload.includes('list=') || urlToDownload.includes('yes-playlist');
        const playlistArg = isPlaylist ? '--yes-playlist' : '--no-playlist';

        const downloadCmd = `yt-dlp -x --audio-format mp3 ${playlistArg} --no-warnings --embed-thumbnail --add-metadata -o "${playlistDir}/%(title)s.%(ext)s" "${urlToDownload}"`;

        try {
            await execPromise(downloadCmd);
            
            // Atualiza a galeria do Android silenciosamente
            try { exec(`termux-media-scan -r "${playlistDir}"`); } catch(e) {}

            if (!isPlaylist) {
                const files = fs.readdirSync(playlistDir).filter(f => f.endsWith('.mp3'));
                if (files.length > 0) {
                    const latestFile = files.map(f => ({
                        name: f,
                        time: fs.statSync(path.join(playlistDir, f)).mtime.getTime()
                    })).sort((a, b) => b.time - a.time)[0];

                    const filePath = path.join(playlistDir, latestFile.name);
                    
                    try {
                        await ctx.replyWithAudio({ source: filePath });
                        // Edita a mensagem "Iniciando os motores..." para Sucesso! (Anti-Spam)
                        await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, `✅ Salvo no celular em: Horizon/${playlistName}/${latestFile.name}`);
                    } catch (e) {
                        await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, '✅ Música salva no celular, mas o arquivo é muito grande para enviar pelo Telegram.');
                    }
                }
            } else {
                // Se for playlist, atualiza a mensagem final
                await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, `📦 Lote concluído! Como foi uma playlist inteira, salvei todas as músicas direto no seu celular na pasta Horizon/${playlistName} para não travar o chat!`);
            }

        } catch (err) {
            await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, '❌ Erro no download. O YouTube pode ter bloqueado ou o link é inválido.');
        }
        return;
    }

    // 3. SE FOR LINK DO YOUTUBE
    const isUrl = text.startsWith('http') || text.includes('youtu');
    if (isUrl) {
        userState.set(userId, { step: 'ESPERANDO_PLAYLIST', url: text });
        return ctx.reply('🔗 Link do YouTube detectado! Em qual pasta você quer salvar? (Ex: Geral, Trap)');
    }

    // 4. NOVA BUSCA
    const searchMsg = await ctx.reply(`🔍 Buscando as 5 melhores opções para: "${text}"...`);
    
    const searchCmd = `yt-dlp "ytsearch5:${text}" --get-title --get-id --no-warnings --ignore-errors --flat-playlist`;
    
    exec(searchCmd, async (err, stdout) => {
        if (err) return ctx.telegram.editMessageText(ctx.chat.id, searchMsg.message_id, undefined, '❌ Erro na busca. Tente novamente.');
        
        const lines = stdout.trim().split('\n');
        const buttons = [];
        
        for (let i = 0; i < lines.length; i += 2) {
            if (lines[i] && lines[i+1]) {
                const title = lines[i].substring(0, 40); 
                const videoId = lines[i+1];
                buttons.push([Markup.button.callback(title, `dl_${videoId}`)]);
            }
        }
        
        if (buttons.length === 0) return ctx.telegram.editMessageText(ctx.chat.id, searchMsg.message_id, undefined, '⚠️ Nenhuma música encontrada.');
        
        // Edita a mensagem "Buscando..." para mostrar os botões (Anti-Spam)
        await ctx.telegram.editMessageText(ctx.chat.id, searchMsg.message_id, undefined, '🎵 Escolha a versão correta:', Markup.inlineKeyboard(buttons));
    });
});

// Quando o usuário clica num botão
bot.action(/dl_(.+)/, async (ctx) => {
    const videoId = ctx.match[1];
    const userId = ctx.from.id;
    
    userState.set(userId, { step: 'ESPERANDO_PLAYLIST', videoId: videoId });
    
    await ctx.answerCbQuery();
    
    // Apaga os botões da mensagem anterior para o chat não virar uma bagunça
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    
    ctx.reply('📁 Boa escolha! Em qual pasta você quer salvar? (Ex: Geral)');
});

bot.launch();

