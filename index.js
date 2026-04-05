#!/usr/bin/env node

/**
 * HORIZON CLI
 * Seu ecossistema musical direto do terminal.
 * Desenvolvido para Termux (Android) e a-Shell (iOS).
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
    // Detecta se está no Termux
    if (process.env.TERMUX_VERSION) {
        return "/sdcard/Music/Horizon";
    }
    // Padrão para iOS (a-Shell) ou Computador
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

// --- LÓGICA DE FILA (MODO LOTE) ---

async function baixarFila(musicas, playlistName) {
    const baseDir = getMusicPath();
    const playlistDir = path.join(baseDir, playlistName);

    if (!fs.existsSync(playlistDir)) {
        fs.mkdirSync(playlistDir, { recursive: true });
    }

    console.log(chalk.yellow(`\n🚀 Iniciando o Modo Lote com ${musicas.length} músicas...\n`));

    for (let i = 0; i < musicas.length; i++) {
        const musica = musicas[i];
        console.log(chalk.cyanBright(`⏳ [${i + 1}/${musicas.length}] Baixando: ${musica}`));

        // 🔔 Notificação de início
        if (process.env.TERMUX_VERSION) {
            try { execSync(`termux-notification -t "Horizon CLI" -c "Baixando: ${musica} (${i + 1}/${musicas.length})"`); } catch(e) {}
        }

        try {
            const downloadCmd = `yt-dlp "ytsearch1:${musica}" -x --audio-format mp3 --no-warnings --embed-thumbnail --add-metadata -o "${playlistDir}/%(title)s.%(ext)s"`;
            await execPromise(downloadCmd);
            
            console.log(chalk.green(`✅ SUCESSO: ${musica}\n`));

            // ⏱️ Pausa anti-bloqueio se não for a última música
            if (i < musicas.length - 1) {
                const delayMs = Math.floor(Math.random() * (8000 - 4000 + 1) + 4000); // Entre 4 e 8 segundos
                console.log(chalk.gray(`⏱️ Proteção ativada: Pausando por ${delayMs / 1000}s...\n`));
                await sleep(delayMs);
            }
        } catch (error) {
            console.error(chalk.red(`❌ Erro ao baixar: ${musica}\n`));
            if (process.env.TERMUX_VERSION) {
                try { execSync(`termux-notification -t "Horizon CLI" -c "Erro na música: ${musica}"`); } catch(e) {}
            }
        }
    }

    // 🔄 Notifica o Android e finaliza
    if (process.env.TERMUX_VERSION) {
        try {
            execSync(`termux-media-scan -r "${playlistDir}"`);
            execSync(`termux-notification -t "Horizon CLI" -c "🎉 Fila concluída! Salvo em ${playlistName}"`);
        } catch (e) {}
    }
    
    console.log(chalk.green.bold(`🎉 Todas as músicas processadas! Salvo em: Horizon/${playlistName}`));
    setTimeout(mainMenu, 3000);
}

// --- LÓGICA DE BUSCA E DOWNLOAD (ÚNICA) ---

async function handleSearch() {
    const { query } = await inquirer.prompt([
        {
            type: 'input',
            name: 'query',
            message: 'Qual música ou artista? (Para Modo Lote, separe por vírgula)'
        }
    ]);

    if (!query) return mainMenu();

    // Divide a string por vírgulas, remove espaços e descarta vazios
    const musicas = query.split(',').map(m => m.trim()).filter(m => m !== "");

    // ➡️ SE TIVER VÍRGULA, VAI PRO MODO LOTE
    if (musicas.length > 1) {
        const { playlist } = await inquirer.prompt([
            {
                type: 'input',
                name: 'playlist',
                message: 'Em qual playlist salvar o lote? (Enter para "Geral")',
                default: 'Geral'
            }
        ]);
        return baixarFila(musicas, playlist);
    }

    // ➡️ SE FOR SÓ UMA MÚSICA, CONTINUA O FLUXO NORMAL (COM SPINNER)
    const singleQuery = musicas[0];
    const spinner = createSpinner(`Buscando no YouTube por "${singleQuery}"...`).start();
    
    try {
        const searchCmd = `yt-dlp "ytsearch5:${singleQuery}" --get-title --get-id --no-warnings`;
        const outputRaw = execSync(searchCmd).toString().trim();
        
        spinner.success({ text: 'Busca concluída!' });

        const lines = outputRaw.split('\n').filter(line => line.trim() !== "");
        const choices = [];
        
        for (let i = 0; i < lines.length; i += 2) {
            if (lines[i] && lines[i+1]) {
                choices.push({
                    name: lines[i], 
                    value: lines[i+1] 
                });
            }
        }

        if (choices.length === 0) {
            console.log(chalk.yellow('⚠️ Nenhuma música encontrada.'));
            return setTimeout(mainMenu, 1500);
        }

        const { selectedId } = await inquirer.prompt([
            {
                type: 'rawlist',
                name: 'selectedId',
                message: 'Selecione a versão para baixar:',
                choices: choices
            }
        ]);

        const { playlist } = await inquirer.prompt([
            {
                type: 'input',
                name: 'playlist',
                message: 'Em qual playlist salvar? (Enter para "Geral")',
                default: 'Geral'
            }
        ]);

        baixarMusica(selectedId, playlist);

    } catch (err) {
        spinner.error({ text: 'Erro na busca. Verifique sua conexão ou o yt-dlp.' });
        setTimeout(mainMenu, 2000);
    }
}

function baixarMusica(id, playlistName) {
    const baseDir = getMusicPath();
    const playlistDir = path.join(baseDir, playlistName);

    if (!fs.existsSync(playlistDir)) {
        fs.mkdirSync(playlistDir, { recursive: true });
    }

    // Corrigido o formato da URL para evitar erros de ID
    const url = `https://youtu.be/${id}`;
    console.log(chalk.cyanBright(`\n⏳ Baixando e processando áudio...`));

    // 🔔 Notificação de download único
    if (process.env.TERMUX_VERSION) {
        try { execSync(`termux-notification -t "Horizon CLI" -c "Baixando áudio..."`); } catch(e) {}
    }

    const downloadCmd = `yt-dlp -x --audio-format mp3 --no-warnings --embed-thumbnail --add-metadata -o "${playlistDir}/%(title)s.%(ext)s" "${url}"`;

    try {
        execSync(downloadCmd, { stdio: 'inherit' });
        console.log(chalk.green(`\n✅ SUCESSO! Música salva em: Horizon/${playlistName}`));

        if (process.env.TERMUX_VERSION) {
            try {
                execSync(`termux-media-scan -r "${playlistDir}"`);
                execSync(`termux-notification -t "Horizon CLI" -c "✅ Música baixada com sucesso!"`);
                console.log(chalk.gray(`🔄 Sistema Android notificado sobre a nova música.`));
            } catch (e) {}
        }
    } catch (error) {
        console.error(chalk.red("\n❌ Erro durante o download. Verifique o yt-dlp."));
        if (process.env.TERMUX_VERSION) {
            try { execSync(`termux-notification -t "Horizon CLI" -c "❌ Erro no download."`); } catch(e) {}
        }
    }
    
    setTimeout(mainMenu, 3000);
}

// --- GERENCIAMENTO DE PLAYLISTS ---

async function handlePlaylists() {
    const baseDir = getMusicPath();
    
    if (!fs.existsSync(baseDir)) {
        console.log(chalk.yellow('\nVocê ainda não baixou nenhuma música.'));
        return setTimeout(mainMenu, 2000);
    }

    const folders = fs.readdirSync(baseDir).filter(f => {
        return fs.statSync(path.join(baseDir, f)).isDirectory();
    });

    if (folders.length === 0) {
        console.log(chalk.yellow('\nNenhuma playlist encontrada.'));
        return setTimeout(mainMenu, 2000);
    }

    const { selectedFolder } = await inquirer.prompt([
        {
            type: 'rawlist',
            name: 'selectedFolder',
            message: 'Suas Playlists:',
            choices: [...folders, '⬅️ Voltar']
        }
    ]);

    if (selectedFolder === '⬅️ Voltar') return mainMenu();

    const files = fs.readdirSync(path.join(baseDir, selectedFolder)).filter(f => f.endsWith('.mp3'));
    
    console.log(chalk.magenta(`\n🎵 Músicas em [${selectedFolder}]:`));
    if (files.length === 0) {
        console.log(chalk.gray('  (Esta playlist está vazia)'));
    } else {
        files.forEach(file => console.log(chalk.white(`  - ${file}`)));
    }

    await inquirer.prompt([{ type: 'input', name: 'back', message: '\nPressione Enter para voltar...' }]);
    handlePlaylists();
}

// --- MENU PRINCIPAL ---

async function mainMenu() {
    showSplash();

    const { action } = await inquirer.prompt([
        {
            type: 'rawlist',
            name: 'action',
            message: 'O que deseja fazer?',
            choices: [
                { name: '🔍 Buscar e Baixar Música', value: 'search' },
                { name: '📁 Ver minhas Playlists', value: 'playlists' },
                { name: '❌ Sair do Horizon', value: 'exit' }
            ]
        }
    ]);

    switch (action) {
        case 'search':
            handleSearch();
            break;
        case 'playlists':
            handlePlaylists();
            break;
        case 'exit':
            console.log(chalk.green('\nDesligando o Horizon. Até a próxima!\n'));
            process.exit(0);
            break;
    }
}

// Inicialização
mainMenu();

