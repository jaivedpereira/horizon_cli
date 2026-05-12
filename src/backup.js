/**
 * HORIZON CLI — Backup & Restore
 *
 * Empacota TODOS os arquivos de estado (~/.horizon/*.json + downloaded.txt)
 * num único JSON versionado. Útil pra levar suas preferências e inscrições
 * pra outra máquina sem perder nada.
 *
 * Não inclui os MP3 em si (são grandes demais); só os metadados.
 */

import fs from 'fs';
import path from 'path';
import {
    getAppDir,
    getSettingsFile,
    getHistoryFile,
    getArchiveFile,
} from './config.js';
import { log } from './logger.js';

const BACKUP_VERSION = 1;

const ITEMS = [
    { key: 'settings', file: getSettingsFile, kind: 'json' },
    { key: 'history', file: getHistoryFile, kind: 'json' },
    { key: 'subscriptions', file: () => path.join(getAppDir(), 'subscriptions.json'), kind: 'json' },
    { key: 'queue', file: () => path.join(getAppDir(), 'queue.json'), kind: 'json' },
    { key: 'archive', file: getArchiveFile, kind: 'text' },
];

function readIfExists(file, kind) {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf-8');
    if (kind === 'json') {
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }
    return raw;
}

export function createBackup(outPath) {
    const payload = {
        version: BACKUP_VERSION,
        createdAt: new Date().toISOString(),
        app: 'horizon-cli',
        items: {},
    };
    for (const item of ITEMS) {
        payload.items[item.key] = {
            kind: item.kind,
            data: readIfExists(item.file(), item.kind),
        };
    }
    const target = outPath || path.join(getAppDir(), `backup-${Date.now()}.json`);
    fs.writeFileSync(target, JSON.stringify(payload, null, 2));
    log.info(`backup: criado em ${target}`);
    return { ok: true, file: target };
}

export function restoreBackup(filePath, { merge = true } = {}) {
    if (!fs.existsSync(filePath)) {
        return { ok: false, reason: 'arquivo não encontrado' };
    }
    let payload;
    try {
        payload = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
        return { ok: false, reason: 'backup inválido (JSON quebrado)' };
    }
    if (payload.version !== BACKUP_VERSION) {
        return { ok: false, reason: `versão incompatível (${payload.version})` };
    }

    const report = { ok: true, restored: [] };
    for (const item of ITEMS) {
        const entry = payload.items?.[item.key];
        if (!entry?.data) continue;
        const file = item.file();

        if (entry.kind === 'json') {
            let final = entry.data;
            if (merge && fs.existsSync(file)) {
                try {
                    const current = JSON.parse(fs.readFileSync(file, 'utf-8'));
                    if (Array.isArray(current) && Array.isArray(entry.data)) {
                        // Merge com dedup superficial por JSON.stringify.
                        const seen = new Set(current.map((x) => JSON.stringify(x)));
                        for (const x of entry.data) {
                            if (!seen.has(JSON.stringify(x))) current.push(x);
                        }
                        final = current;
                    } else if (current && typeof current === 'object') {
                        final = { ...current, ...entry.data };
                    }
                } catch {
                    /* ignore, usa o do backup */
                }
            }
            fs.writeFileSync(file, JSON.stringify(final, null, 2));
        } else {
            // text: append único (arquivo de archive)
            if (merge && fs.existsSync(file)) {
                const before = new Set(fs.readFileSync(file, 'utf-8').split('\n').map((l) => l.trim()));
                const toAdd = entry.data.split('\n').filter((l) => l && !before.has(l.trim()));
                if (toAdd.length) fs.appendFileSync(file, '\n' + toAdd.join('\n') + '\n');
            } else {
                fs.writeFileSync(file, entry.data);
            }
        }
        report.restored.push(item.key);
    }
    log.info(`backup: restaurado (${report.restored.join(', ')})`);
    return report;
}
