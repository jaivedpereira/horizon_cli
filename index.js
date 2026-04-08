#!/usr/bin/env node

/**
 * HORIZON CLI
 * Seu ecossistema musical direto do terminal.
 * Versão Clean (Sem Cookies) + Notificações Inteligentes (Anti-Spam).
 */

import figlet from 'figlet';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { execSync, exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import util from 'util';
import { createSpinner } from 'nanospinner';

const execPromise = util.promisify(exec);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- CONFIGURAÇÕES DE CAMINHO ---
function getMusicPath() {
    if (process.env.TERMUX_VERSION) {
        return "/sdcard/Music/Horizon";
    }
    return path.join(os.homedir(), 'Music/Horizon');
}

// --- INTERFACE VISUAL ---
function showSplash() {
    console.clear();
    console.log(
        chalk.cyanBright(
            figlet.textSync('HORIZON', { horizontalLayout: 'standard' })
        )
    );
    console.log(chalk.gray('  Seu ecossistema musical direto do terminal.\n'));
    console.log(chalk.blueBright('==================================================\n'));
}

// --- SISTEMA DE NOTIFICAÇÕES INTELIGENTES ---
function notificar(titulo, mensagem, tipo = 'normal') {
    if (process.env.TERMUX_VERSION) {
        try {
            // O uso do "-i 1000" faz a notificação atualizar em vez de criar uma nova (Anti-Spam)
            let cmd = `termux-notification -i 1000 -t "${titulo}" -c "${mensagem}"`;
            
            // Se for do tipo 'progresso', a notificação fica fixada e não dá pra arrastar pro lado
            if (tipo === 'progresso') {
                cmd += " --ongoing";
            }
            execSync(cmd);
        } catch(e) {}
    }
}

function atualizarGaleria(caminhoPasta) {
    if (process.env.TERMUX_VERSION) {
        try { execSync(`termux-media-scan -r "${caminhoPasta}"`); } catch(e) {}
    }
}

// --- LÓGICA DE FILA (MODO LOTE) ---
async function baixarFila(musicas, playlistName) {
    const baseDir = getMusicPath();
    const playlistDir = path.join(baseDir, playlistName);

    if (!fs.existsSync(playlistDir)) fs.mkdirSync(playlistDir, { recursive: true });

    console.log(chalk.yellow(`\n🚀 Iniciando o Modo Lote com ${musicas.length} músicas...\n`));

    for (let i = 0; i < musicas.length; i++) {
        const musica = musicas[i];
        console.log(chalk.cyanBright(`⏳ [${i + 1}/${musicas.length}] Baixando: ${musica}`));
        
        // Notificação inteligente em tempo real
        notificar("Horizon CLI (Baixando Lote)", `[${i + 1}/${musicas.length}]: ${musica}`, 'progresso');

        try {
            const downloadCmd = `yt-dlp "ytsearch1:${musica}" -x --audio-format mp3 --no-warnings --embed-thumbnail --add-metadata -o "${playlistDir}/%(title)s.%(ext)s"`;
            await execPromise(downloadCmd);
            console.log(chalk.green(`✅ SUCESSO: ${musica}\n`));

            if (i < musicas.length - 1) {
                const delayMs = Math.floor(Math.random() * (6000 - 3000 + 1) + 3000); 
                await sleep(delayMs);
            }
        } catch (error) {
            console.error(chalk.red(`❌ Erro ao baixar: ${musica}\n`));
        }
    }

    atualizarGaleria(playlistDir);
    notificar("Horizon CLI", `🎉 Fila concluída! ${musicas.length} músicas salvas em "${playlistName}".`, 'sucesso');
    console.log(chalk.green.bold(`🎉 Todas as músicas processadas! Salvo em: Horizon/${playlistName}`));
    setTimeout(mainMenu, 3000);
}

// --- LÓGICA DE BUSCA ---
async function handleSearch() {
    const { query } = await inquirer.prompt([
        {
            type: 'input',
            name: 'query',
            message: 'Busca (nome, link do YT ou lote por vírgula):'
        }
    ]);

    if (!query) return mainMenu();

    const musicas = query.split(',').map(m => m.trim()).filter(m => m !== "");

    if (musicas.length > 1) {
        const { playlist } = await inquirer.prompt([{ type: 'input', name: 'playlist', message: 'Pasta:', default: 'Geral' }]);
        return baixarFila(musicas, playlist);
    }

    const singleQuery = musicas[0];
    const isUrl = singleQuery.startsWith('http') || singleQuery.includes('youtu');

    if (isUrl) {
        const { playlist } = await inquirer.prompt([{ type: 'input', name: 'playlist', message: 'Pasta:', default: 'Geral' }]);
        return baixarMusicaUnica(singleQuery, playlist);
    }

    const spinner = createSpinner(`Buscando...`).start();
    try {
        const searchCmd = `yt-dlp "ytsearch5:${singleQuery}" --get-title --get-id --no-warnings --flat-playlist`;
        const outputRaw = execSync(searchCmd).toString().trim();
        spinner.success();

        const lines = outputRaw.split('\n').filter(line => line.trim() !== "");
        const choices = [];
        for (let i = 0; i < lines.length; i += 2) {
            if (lines[i] && lines[i+1]) choices.push({ name: lines[i], value: lines[i+1] });
        }

        if (choices.length === 0) {
            console.log(chalk.yellow('⚠️ Nenhuma música encontrada.'));
            return setTimeout(mainMenu, 2500);
        }

        const { selectedId } = await inquirer.prompt([{ type: 'rawlist', name: 'selectedId', message: 'Escolha a versão:', choices: choices }]);
        const { playlist } = await inquirer.prompt([{ type: 'input', name: 'playlist', message: 'Pasta:', default: 'Geral' }]);

        baixarMusicaUnica(selectedId, playlist);
    } catch (err) {
        spinner.error({ text: 'Erro na busca. Verifique a internet.' });
        setTimeout(mainMenu, 2000);
    }
}

function baixarMusicaUnica(inputUrlOrId, playlistName) {
    const baseDir = getMusicPath();
    const playlistDir = path.join(baseDir, playlistName);
    if (!fs.existsSync(playlistDir)) fs.mkdirSync(playlistDir, { recursive: true });

    const url = inputUrlOrId.startsWith('http') ? inputUrlOrId : `https://www.youtube.com/watch?v=${inputUrlOrId}`;
    
    console.log(chalk.cyanBright(`\n⏳ Baixando áudio...`));
    notificar("Horizon CLI", "Baixando música...", "progresso");

    const downloadCmd = `yt-dlp -x --audio-format mp3 --no-warnings --embed-thumbnail --add-metadata -o "${playlistDir}/%(title)s.%(ext)s" "${url}"`;

    try {
        execSync(downloadCmd, { stdio: 'inherit' });
        console.log(chalk.green(`\n✅ Concluído!`));
        atualizarGaleria(playlistDir);
        notificar("Horizon CLI", "✅ Música baixada com sucesso!", "sucesso");
    } catch (error) {
        console.error(chalk.red("\n❌ Erro no download. O YouTube pode estar bloqueando temporariamente."));
        notificar("Horizon CLI", "❌ Erro no download.", "sucesso"); // Tira o ongoing pra pessoa fechar
    }
    setTimeout(mainMenu, 3000);
}

// --- LÓGICA DE BAIXAR PLAYLISTS ---
async function handlePlaylistDownload() {
    console.clear();
    console.log(chalk.blueBright('=================================================='));
    console.log(chalk.yellowBright.bold(`💡 AVISO: MÚSICAS DE OUTRAS PLATAFORMAS 💡`));
    console.log(chalk.white(`O Horizon baixa playlists do YouTube nativamente.`));
    console.log(chalk.white(`Para baixar do `) + chalk.green(`Spotify`) + chalk.white(`, `) + chalk.magenta(`Deezer`) + chalk.white(` ou `) + chalk.red(`Apple Music`) + chalk.white(`:`));
    console.log(chalk.gray(`  1. Acesse o site gratuito `) + chalk.cyan.underline(`TuneMyMusic.com`));
    console.log(chalk.gray(`  2. Converta sua playlist de lá para o YouTube.`));
    console.log(chalk.gray(`  3. Cole o link da nova playlist do YouTube aqui.`));
    console.log(chalk.blueBright('==================================================\n'));
    
    const { url } = await inquirer.prompt([{ type: 'input', name: 'url', message: 'Cole o LINK da Playlist do YouTube:' }]);
    if (!url) return mainMenu();

    const { playlistName } = await inquirer.prompt([{ type: 'input', name: 'playlistName', message: 'Nome da pasta:', default: 'MinhaPlaylist' }]);
    const baseDir = getMusicPath();
    const playlistDir = path.join(baseDir, playlistName);

    if (!fs.existsSync(playlistDir)) fs.mkdirSync(playlistDir, { recursive: true });

    console.log(chalk.cyanBright(`\n⏳ Iniciando download em massa...`));
    notificar("Horizon CLI", `Lendo Playlist: ${playlistName}...`, "progresso");

    try {
        const ytdlCmd = `yt-dlp -x --audio-format mp3 --yes-playlist --no-warnings --embed-thumbnail --add-metadata -o "${playlistDir}/%(title)s.%(ext)s" "${url}"`;
        execSync(ytdlCmd, { stdio: 'inherit' });
        atualizarGaleria(playlistDir);
        notificar("Horizon CLI", `✅ Playlist [${playlistName}] baixada 100%!`, "sucesso");
    } catch (error) {
        console.error(chalk.red("\n❌ Erro na playlist."));
        notificar("Horizon CLI", `❌ Erro no download da Playlist.`, "sucesso");
    }
    setTimeout(mainMenu, 5000);
}

async function handlePlaylists() {
    const baseDir = getMusicPath();
    if (!fs.existsSync(baseDir)) return mainMenu();
    const folders = fs.readdirSync(baseDir).filter(f => fs.statSync(path.join(baseDir, f)).isDirectory());
    if (folders.length === 0) return mainMenu();

    const { selectedFolder } = await inquirer.prompt([{ type: 'rawlist', name: 'selectedFolder', message: 'Playlists:', choices: [...folders, '⬅️ Voltar'] }]);
    if (selectedFolder === '⬅️ Voltar') return mainMenu();

    const files = fs.readdirSync(path.join(baseDir, selectedFolder)).filter(f => f.endsWith('.mp3'));
    files.forEach(file => console.log(chalk.white(`  - ${file}`)));
    await inquirer.prompt([{ type: 'input', name: 'back', message: '\nEnter para voltar...' }]);
    handlePlaylists();
}

async function mainMenu() {
    showSplash();
    const { action } = await inquirer.prompt([
        {
            type: 'rawlist',
            name: 'action',
            message: 'Menu Principal:',
            choices: [
                { name: '🔍 Buscar (Nome / Link / Lote)', value: 'search' },
                { name: '📥 Baixar Playlist Completa', value: 'playlist_link' },
                { name: '📁 Ver Arquivos Baixados', value: 'playlists' },
                { name: '❌ Sair do Horizon', value: 'exit' }
            ]
        }
    ]);

    switch (action) {
        case 'search': handleSearch(); break;
        case 'playlist_link': handlePlaylistDownload(); break;
        case 'playlists': handlePlaylists(); break;
        case 'exit': 
            console.log(chalk.green('\nDesligando o Horizon. Até a próxima!\n'));
            process.exit(0); 
            break;
    }
}

mainMenu();

