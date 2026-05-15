/**
 * HORIZON CLI — Config Profiles
 *
 * Salva conjuntos nomeados de configuração e alterna entre eles.
 * Útil pra quem tem cenários diferentes:
 *   - "servidor" (anti-ban agressivo, 192kbps, sem lyrics)
 *   - "qualidade" (320kbps, flac, normalização ligada)
 *   - "rapido" (anti-ban desligado, 128kbps, 6 paralelos)
 *
 * Perfis ficam em ~/.horizon/profiles/<nome>.json
 */

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { getAppDir, loadSettings, saveSettings } from './config.js';
import { log } from './logger.js';

const PROFILES_DIR = path.join(getAppDir(), 'profiles');

function ensureDir() {
    if (!fs.existsSync(PROFILES_DIR)) fs.mkdirSync(PROFILES_DIR, { recursive: true });
}

/** Lista todos os perfis salvos. */
export function listProfiles() {
    ensureDir();
    return fs
        .readdirSync(PROFILES_DIR)
        .filter((f) => f.endsWith('.json'))
        .map((f) => {
            const name = f.replace('.json', '');
            const full = path.join(PROFILES_DIR, f);
            try {
                const data = JSON.parse(fs.readFileSync(full, 'utf-8'));
                return {
                    name,
                    createdAt: data._createdAt || null,
                    description: data._description || null,
                    file: full,
                };
            } catch {
                return { name, createdAt: null, description: null, file: full };
            }
        });
}

/** Salva as configurações atuais como um perfil nomeado. */
export function saveProfile(name, description = '') {
    ensureDir();
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
    if (!safeName) return { ok: false, error: 'Nome inválido.' };

    const settings = loadSettings();
    const payload = {
        ...settings,
        _profileName: safeName,
        _description: description,
        _createdAt: new Date().toISOString(),
    };

    const file = path.join(PROFILES_DIR, `${safeName}.json`);
    fs.writeFileSync(file, JSON.stringify(payload, null, 2));
    log.info(`profiles: saved "${safeName}"`);
    return { ok: true, name: safeName, file };
}

/** Carrega um perfil e aplica como configuração ativa. */
export function loadProfile(name) {
    ensureDir();
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
    const file = path.join(PROFILES_DIR, `${safeName}.json`);

    if (!fs.existsSync(file)) {
        return { ok: false, error: `Perfil "${name}" não encontrado.` };
    }

    try {
        const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        // Remove campos internos do perfil antes de aplicar.
        const { _profileName, _description, _createdAt, ...settings } = data;
        saveSettings(settings);
        log.info(`profiles: loaded "${safeName}"`);
        return { ok: true, name: safeName, settings };
    } catch (err) {
        return { ok: false, error: `Erro ao ler perfil: ${err.message}` };
    }
}

/** Deleta um perfil. */
export function deleteProfile(name) {
    ensureDir();
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
    const file = path.join(PROFILES_DIR, `${safeName}.json`);

    if (!fs.existsSync(file)) {
        return { ok: false, error: `Perfil "${name}" não encontrado.` };
    }

    fs.unlinkSync(file);
    log.info(`profiles: deleted "${safeName}"`);
    return { ok: true };
}

/** Print formatado da lista de perfis. */
export function printProfiles() {
    const profiles = listProfiles();
    if (!profiles.length) {
        console.log(chalk.yellow('⚠️  Nenhum perfil salvo. Crie um com `horizon profiles save <nome>`.'));
        return;
    }
    console.log(chalk.blueBright(`\n🎚️  Perfis (${profiles.length}):\n`));
    for (const p of profiles) {
        const desc = p.description ? chalk.gray(` — ${p.description}`) : '';
        const date = p.createdAt ? chalk.gray(` (${p.createdAt.slice(0, 10)})`) : '';
        console.log(`  ${chalk.cyanBright(p.name)}${desc}${date}`);
    }
    console.log(chalk.gray('\n  Usar: horizon profiles load <nome>\n'));
}
