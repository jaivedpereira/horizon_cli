#!/usr/bin/env node

/**
 * HORIZON CLI
 * Seu ecossistema musical direto do terminal.
 * Desenvolvido para Termux (Android) e a-Shell (iOS).
 */

import figlet from 'figlet';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createSpinner } from 'nanospinner';

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

// --- LÓGICA DE BUSCA E DOWNLOAD ---

async function handleSearch() {
    const { query } = await inquirer.prompt([
        {
            type: 'input',
            name: 'query',
            message: 'Qual música ou artista você quer buscar?'
        }
    ]);

    if (!query) return mainMenu();

    const spinner = createSpinner(`Buscando no YouTube por "${query}"...`).start();
    
    try {
        // Busca 5 resultados usando yt-dlp
        const searchCmd = `yt-dlp "ytsearch5:${query}" --get-title --get-id --no-warnings`;
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

    // Cria as pastas se não existirem
    if (!fs.existsSync(playlistDir)) {
        fs.mkdirSync(playlistDir, { recursive: true });
    }

    const url = `https://www.youtube.com/watch?v=${id}`;
    console.log(chalk.cyanBright(`\n⏳ Baixando e processando áudio...`));

    // Comando yt-dlp otimizado para MP3 com metadados e sem ID no nome
    const downloadCmd = `yt-dlp -x --audio-format mp3 --no-warnings --embed-thumbnail --add-metadata -o "${playlistDir}/%(title)s.%(ext)s" "${url}"`;

    try {
        execSync(downloadCmd, { stdio: 'inherit' });
        console.log(chalk.green(`\n✅ SUCESSO! Música salva em: Horizon/${playlistName}`));

        // Força o Android a atualizar a galeria de música imediatamente
        if (process.env.TERMUX_VERSION) {
            try {
                execSync(`termux-media-scan -r "${playlistDir}"`);
                console.log(chalk.gray(`🔄 Sistema Android notificado sobre a nova música.`));
            } catch (e) {
                // Falha silenciosa caso o termux-api não esteja instalado
            }
        }
    } catch (error) {
        console.error(chalk.red("\n❌ Erro durante o download. Verifique o yt-dlp."));
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
