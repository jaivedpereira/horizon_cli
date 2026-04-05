import { Telegraf } from 'telegraf';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Carrega o Token do arquivo .env
dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
    console.error("❌ ERRO: Token não encontrado no arquivo .env");
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const baseDir = "/sdcard/Music/Horizon";

bot.start((ctx) => {
    ctx.reply('🌌 Horizon Bot Online!\n\nEnvie o nome de uma música para baixar na sua pasta "Telegram" e receber o arquivo aqui.');
});

bot.on('text', async (ctx) => {
    const query = ctx.message.text;
    const playlistName = "Telegram"; 
    const playlistDir = path.join(baseDir, playlistName);

    // Cria a pasta no Android se não existir
    if (!fs.existsSync(playlistDir)) {
        fs.mkdirSync(playlistDir, { recursive: true });
    }

    ctx.reply(`⏳ Buscando e processando: "${query}"...`);

    // Comando para baixar e salvar na pasta do Android
    const downloadCmd = `yt-dlp "ytsearch1:${query}" -x --audio-format mp3 --embed-thumbnail --add-metadata -o "${playlistDir}/%(title)s.%(ext)s"`;

    exec(downloadCmd, async (err) => {
        if (err) return ctx.reply('❌ Erro ao processar o download.');

        // Busca o arquivo recém baixado para enviar no chat
        const files = fs.readdirSync(playlistDir);
        const latestFile = files.map(f => ({
            name: f,
            time: fs.statSync(path.join(playlistDir, f)).mtime.getTime()
        })).sort((a, b) => b.time - a.time)[0];

        const filePath = path.join(playlistDir, latestFile.name);

        try {
            await ctx.replyWithAudio({ source: filePath });
            ctx.reply(`✅ Salvo em: Horizon/Telegram/${latestFile.name}`);
            
            // Notifica o Retro Music
            exec(`termux-media-scan -r "${playlistDir}"`);
        } catch (e) {
            ctx.reply('✅ Baixado na pasta, mas não consegui enviar o arquivo aqui.');
        }
    });
});

bot.launch();
console.log('🌌 Horizon Bot rodando no Termux...');

