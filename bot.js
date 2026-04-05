import { Telegraf, Markup } from 'telegraf';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
    console.error("❌ ERRO: Token não encontrado no arquivo .env");
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const baseDir = "/sdcard/Music/Horizon";

// Memória temporária para guardar a escolha do usuário
const userState = new Map();

bot.start((ctx) => {
    ctx.reply('🌌 Horizon Bot!\nEnvie o nome da música para buscar as 5 melhores opções.');
});

// Quando o usuário envia um texto
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;

    // Se o bot estava esperando o nome da playlist
    if (userState.has(userId) && userState.get(userId).step === 'ESPERANDO_PLAYLIST') {
        const data = userState.get(userId);
        const playlistName = text;
        const playlistDir = path.join(baseDir, playlistName);

        if (!fs.existsSync(playlistDir)) {
            fs.mkdirSync(playlistDir, { recursive: true });
        }

        ctx.reply(`⏳ Baixando na playlist "${playlistName}"...`);
        userState.delete(userId); // Limpa a memória

        const url = `https://www.youtube.com/watch?v=${data.videoId}`;
        const downloadCmd = `yt-dlp -x --audio-format mp3 --embed-thumbnail --add-metadata -o "${playlistDir}/%(title)s.%(ext)s" "${url}"`;

        exec(downloadCmd, async (err) => {
            if (err) return ctx.reply('❌ Erro no download.');

            // Pega o arquivo mais recente da pasta para enviar
            const files = fs.readdirSync(playlistDir);
            const latestFile = files.map(f => ({
                name: f,
                time: fs.statSync(path.join(playlistDir, f)).mtime.getTime()
            })).sort((a, b) => b.time - a.time)[0];

            const filePath = path.join(playlistDir, latestFile.name);

            try {
                await ctx.replyWithAudio({ source: filePath });
                ctx.reply(`✅ Salvo em: Horizon/${playlistName}/${latestFile.name}`);
                exec(`termux-media-scan -r "${playlistDir}"`);
            } catch (e) {
                ctx.reply('✅ Arquivo salvo na pasta, mas falhou ao enviar aqui no Telegram.');
            }
        });
        return;
    }

    // Se não estava esperando playlist, é uma nova busca
    ctx.reply(`🔍 Buscando as 5 melhores opções para: "${text}"...`);
    
    const searchCmd = `yt-dlp "ytsearch5:${text}" --get-title --get-id --no-warnings`;
    
    exec(searchCmd, (err, stdout) => {
        if (err) return ctx.reply('❌ Erro na busca.');
        
        const lines = stdout.trim().split('\n');
        const buttons = [];
        
        // Monta os botões do Telegram com os resultados
        for (let i = 0; i < lines.length; i += 2) {
            if (lines[i] && lines[i+1]) {
                const title = lines[i].substring(0, 40); // Limita tamanho do texto no botão
                const videoId = lines[i+1];
                buttons.push([Markup.button.callback(title, `dl_${videoId}`)]);
            }
        }
        
        if (buttons.length === 0) return ctx.reply('⚠️ Nenhuma música encontrada.');
        
        ctx.reply('🎵 Escolha a música:', Markup.inlineKeyboard(buttons));
    });
});

// Quando o usuário clica em um botão
bot.action(/dl_(.+)/, (ctx) => {
    const videoId = ctx.match[1];
    const userId = ctx.from.id;
    
    // Salva o ID da música na memória e avança o passo
    userState.set(userId, { step: 'ESPERANDO_PLAYLIST', videoId: videoId });
    
    ctx.answerCbQuery();
    ctx.reply('📁 Em qual playlist você quer salvar? (Digite o nome da pasta, ex: "Rap", "Geral")');
});

bot.launch();

