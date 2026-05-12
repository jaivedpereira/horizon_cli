/**
 * HORIZON CLI — UI helpers
 * Splash, banners, prompts comuns.
 */

import chalk from 'chalk';
import figlet from 'figlet';
import inquirer from 'inquirer';
import { loadSettings, AUDIO_QUALITIES, SUPPORTED_FORMATS, MAX_CONCURRENCY } from './config.js';

export function showSplash() {
    console.clear();
    console.log(
        chalk.cyanBright(
            figlet.textSync('HORIZON', { horizontalLayout: 'standard' }),
        ),
    );
    console.log(chalk.gray('  Seu ecossistema musical direto do terminal.\n'));

    const s = loadSettings();
    console.log(
        chalk.gray('  ') +
            chalk.white(`format: ${s.format} `) +
            chalk.white(`| quality: ${s.quality}K `) +
            chalk.white(`| paralelo: ${s.concurrency} `) +
            chalk.white(`| pasta padrão: ${s.defaultPlaylist}`),
    );
    console.log(chalk.blueBright('\n==================================================\n'));
}

export function showOtherPlatformsTip() {
    console.log(chalk.blueBright('=================================================='));
    console.log(chalk.yellowBright.bold('💡 AVISO: MÚSICAS DE OUTRAS PLATAFORMAS'));
    console.log(chalk.white('O Horizon baixa playlists do YouTube nativamente.'));
    console.log(
        chalk.white('Para ') +
            chalk.green('Spotify') +
            chalk.white(', ') +
            chalk.magenta('Deezer') +
            chalk.white(' ou ') +
            chalk.red('Apple Music') +
            chalk.white(':'),
    );
    console.log(chalk.gray('  1. Acesse ') + chalk.cyan.underline('https://www.tunemymusic.com'));
    console.log(chalk.gray('  2. Converta sua playlist para o YouTube.'));
    console.log(chalk.gray('  3. Cole o link da playlist do YouTube aqui.'));
    console.log(chalk.blueBright('==================================================\n'));
}

/** Prompt unificado para pedir nome de pasta/playlist. */
export async function askPlaylist(defaultName) {
    const s = loadSettings();
    const { playlist } = await inquirer.prompt([
        {
            type: 'input',
            name: 'playlist',
            message: 'Pasta (playlist) de destino:',
            default: defaultName || s.defaultPlaylist,
        },
    ]);
    return playlist;
}

export async function askSettings() {
    const current = loadSettings();
    const answers = await inquirer.prompt([
        {
            type: 'list',
            name: 'format',
            message: 'Formato de áudio:',
            choices: SUPPORTED_FORMATS,
            default: current.format,
        },
        {
            type: 'list',
            name: 'quality',
            message: 'Qualidade (kbps):',
            choices: AUDIO_QUALITIES,
            default: current.quality,
        },
        {
            type: 'number',
            name: 'concurrency',
            message: `Downloads simultâneos (1–${MAX_CONCURRENCY}):`,
            default: current.concurrency,
            validate: (v) => (v >= 1 && v <= MAX_CONCURRENCY) || `Use 1 a ${MAX_CONCURRENCY}`,
        },
        {
            type: 'input',
            name: 'defaultPlaylist',
            message: 'Pasta padrão:',
            default: current.defaultPlaylist,
        },
        {
            type: 'confirm',
            name: 'embedThumbnail',
            message: 'Embutir capa (thumbnail)?',
            default: current.embedThumbnail,
        },
        {
            type: 'confirm',
            name: 'embedMetadata',
            message: 'Embutir metadados (título, artista)?',
            default: current.embedMetadata,
        },
    ]);
    return answers;
}
