/**
 * HORIZON CLI — UI helpers
 * Splash, banners e prompts de configuração (tudo em português, com seções).
 */

import chalk from 'chalk';
import figlet from 'figlet';
import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
    loadSettings,
    saveSettings,
    resetSettings,
    defaultSettings,
    AUDIO_QUALITIES,
    SUPPORTED_FORMATS,
    MAX_CONCURRENCY,
} from './config.js';
import { ANTIBAN_MODES } from './antiban.js';

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
            chalk.white(`formato: ${s.format} `) +
            chalk.white(`| qualidade: ${s.quality}K `) +
            chalk.white(`| paralelos: ${s.concurrency} `) +
            chalk.white(`| proteção: ${s.antibanMode}`),
    );
    console.log(chalk.gray(`  pasta padrão: ${s.defaultPlaylist}`));
    console.log(chalk.gray(`  biblioteca:   ${s.musicBaseDir}`));
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

// ============================================================
//  CONFIGURAÇÕES (tudo em português, por seção)
// ============================================================

function sectionTitle(title) {
    console.log('\n' + chalk.cyanBright('▸ ' + title));
    console.log(chalk.gray('─'.repeat(Math.min(60, title.length + 4))));
}

/** Valida e resolve o caminho da pasta base (criando se não existir). */
function resolvePath(raw) {
    if (!raw) throw new Error('Caminho vazio.');
    const expanded = raw.replace(/^~(?=$|\/|\\)/, os.homedir());
    const resolved = path.resolve(expanded);
    if (!fs.existsSync(resolved)) {
        fs.mkdirSync(resolved, { recursive: true });
    } else if (!fs.statSync(resolved).isDirectory()) {
        throw new Error('O caminho existe mas não é uma pasta.');
    }
    return resolved;
}

async function editBibliotecaSection(current) {
    sectionTitle('📁 Biblioteca (onde os áudios ficam)');
    const ans = await inquirer.prompt([
        {
            type: 'input',
            name: 'musicBaseDir',
            message: 'Pasta base da biblioteca (aceita ~ e caminho absoluto):',
            default: current.musicBaseDir,
            validate: (v) => {
                try {
                    resolvePath(v);
                    return true;
                } catch (e) {
                    return e.message;
                }
            },
            filter: (v) => resolvePath(v),
        },
        {
            type: 'input',
            name: 'defaultPlaylist',
            message: 'Nome da pasta padrão (quando você não especificar uma):',
            default: current.defaultPlaylist,
            validate: (v) => (v && v.trim().length ? true : 'Obrigatório.'),
        },
    ]);
    return ans;
}

async function editAudioSection(current) {
    sectionTitle('🎵 Áudio');
    return inquirer.prompt([
        {
            type: 'list',
            name: 'format',
            message: 'Formato:',
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
            type: 'confirm',
            name: 'embedThumbnail',
            message: 'Embutir capa (thumbnail) no arquivo?',
            default: current.embedThumbnail,
        },
        {
            type: 'confirm',
            name: 'embedMetadata',
            message: 'Embutir metadados (título, artista, álbum)?',
            default: current.embedMetadata,
        },
        {
            type: 'confirm',
            name: 'normalizeVolume',
            message: 'Normalizar volume (EBU R128, estilo streaming)?',
            default: current.normalizeVolume,
        },
    ]);
}

async function editPerformanceSection(current) {
    sectionTitle('⚡ Desempenho e organização');
    return inquirer.prompt([
        {
            type: 'number',
            name: 'concurrency',
            message: `Downloads simultâneos (1 a ${MAX_CONCURRENCY}):`,
            default: current.concurrency,
            validate: (v) =>
                v >= 1 && v <= MAX_CONCURRENCY ? true : `Use um número entre 1 e ${MAX_CONCURRENCY}.`,
        },
        {
            type: 'confirm',
            name: 'dedup',
            message: 'Evitar baixar o mesmo vídeo duas vezes (dedup global)?',
            default: current.dedup,
        },
        {
            type: 'confirm',
            name: 'writeLyrics',
            message: 'Baixar letras (.lrc) automaticamente após cada música?',
            default: current.writeLyrics,
        },
        {
            type: 'confirm',
            name: 'autoExportM3U',
            message: 'Atualizar .m3u e README.md da pasta a cada download?',
            default: current.autoExportM3U,
        },
    ]);
}

async function editAntibanSection(current) {
    sectionTitle('🛡️  Proteção contra bloqueios do YouTube');
    console.log(
        chalk.gray(
            '  O YouTube pode bloquear temporariamente downloads suspeitos.\n' +
                '  Aumente a proteção se começar a ver erros 429/403 ou "prove que não é um bot".\n',
        ),
    );

    const modeChoices = Object.entries(ANTIBAN_MODES).map(([key, cfg]) => ({
        name: `${key.padEnd(10)}  ${chalk.gray(cfg.label)}`,
        value: key,
    }));

    const base = await inquirer.prompt([
        {
            type: 'list',
            name: 'antibanMode',
            message: 'Perfil de proteção:',
            choices: modeChoices,
            default: current.antibanMode,
        },
        {
            type: 'confirm',
            name: 'rotateUserAgent',
            message: 'Rotacionar o User-Agent a cada download?',
            default: current.rotateUserAgent,
        },
        {
            type: 'confirm',
            name: 'geoBypass',
            message: 'Tentar contornar bloqueios por região (geo-bypass)?',
            default: current.geoBypass,
        },
        {
            type: 'confirm',
            name: 'useCookies',
            message:
                'Usar cookies do seu navegador? (Recurso mais forte contra bans; exige ter feito login no YouTube)',
            default: current.useCookies,
        },
    ]);

    let cookiesBrowser = current.cookiesBrowser;
    if (base.useCookies || base.antibanMode === 'furtivo') {
        const ans = await inquirer.prompt([
            {
                type: 'list',
                name: 'cookiesBrowser',
                message: 'De qual navegador importar cookies?',
                choices: ['chrome', 'firefox', 'edge', 'brave', 'safari', 'chromium'],
                default: current.cookiesBrowser,
            },
        ]);
        cookiesBrowser = ans.cookiesBrowser;
    }
    return { ...base, cookiesBrowser };
}

async function editInterfaceSection(current) {
    sectionTitle('🖥️  Interface');
    return inquirer.prompt([
        {
            type: 'confirm',
            name: 'showTips',
            message: 'Mostrar dicas contextuais pelo app?',
            default: current.showTips,
        },
    ]);
}

/** Menu principal de configurações com seções. */
export async function settingsMenu() {
    let keepGoing = true;
    while (keepGoing) {
        const current = loadSettings();
        showSplash();
        console.log(chalk.yellow('⚙️  Configurações — escolha uma seção:\n'));

        const { section } = await inquirer.prompt([
            {
                type: 'rawlist',
                name: 'section',
                message: 'Seção:',
                choices: [
                    { name: '📁  Biblioteca (pasta base + pasta padrão)', value: 'biblioteca' },
                    { name: '🎵  Áudio (formato, qualidade, loudness)', value: 'audio' },
                    { name: '⚡  Desempenho (paralelismo, dedup, letras, m3u)', value: 'performance' },
                    { name: '🛡️   Proteção anti-bloqueio do YouTube', value: 'antiban' },
                    { name: '🖥️   Interface (dicas)', value: 'interface' },
                    new inquirer.Separator(),
                    { name: '📝  Ver configurações atuais', value: 'ver' },
                    { name: '♻️   Restaurar padrões de fábrica', value: 'reset' },
                    { name: '⬅️   Voltar', value: 'back' },
                ],
            },
        ]);

        switch (section) {
            case 'biblioteca': {
                const patch = await editBibliotecaSection(current);
                saveSettings(patch);
                console.log(chalk.green('\n✅ Biblioteca atualizada.'));
                break;
            }
            case 'audio': {
                const patch = await editAudioSection(current);
                saveSettings(patch);
                console.log(chalk.green('\n✅ Áudio atualizado.'));
                break;
            }
            case 'performance': {
                const patch = await editPerformanceSection(current);
                saveSettings(patch);
                console.log(chalk.green('\n✅ Desempenho atualizado.'));
                break;
            }
            case 'antiban': {
                const patch = await editAntibanSection(current);
                saveSettings(patch);
                console.log(chalk.green('\n✅ Proteção atualizada.'));
                break;
            }
            case 'interface': {
                const patch = await editInterfaceSection(current);
                saveSettings(patch);
                console.log(chalk.green('\n✅ Interface atualizada.'));
                break;
            }
            case 'ver': {
                console.log(chalk.gray('\n' + JSON.stringify(loadSettings(), null, 2)));
                break;
            }
            case 'reset': {
                const { confirm } = await inquirer.prompt([
                    {
                        type: 'confirm',
                        name: 'confirm',
                        message:
                            'Restaurar TUDO ao padrão de fábrica? (isso zera formato, pasta, anti-ban...)',
                        default: false,
                    },
                ]);
                if (confirm) {
                    resetSettings();
                    console.log(chalk.green('\n✅ Configurações restauradas.'));
                }
                break;
            }
            case 'back':
                keepGoing = false;
                continue;
        }

        const { again } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'again',
                message: 'Editar outra seção?',
                default: false,
            },
        ]);
        keepGoing = again;
    }
}

// Mantido para compatibilidade com o código antigo (CLI subcomando `config` fallback).
export async function askSettings() {
    const current = loadSettings();
    const patch = {
        ...(await editBibliotecaSection(current)),
        ...(await editAudioSection(current)),
        ...(await editPerformanceSection(current)),
        ...(await editAntibanSection(current)),
    };
    return patch;
}

// Exporta para o `stats` e menu mostrarem default.
export { defaultSettings };
