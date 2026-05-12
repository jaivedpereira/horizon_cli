/**
 * HORIZON CLI — Logger
 * Logger leve com rotação em ~/.horizon/logs/.
 */

import fs from 'fs';
import path from 'path';
import { getAppDir } from './config.js';

const LOG_DIR = path.join(getAppDir(), 'logs');
const MAIN_LOG = path.join(LOG_DIR, 'horizon.log');
const MAX_SIZE = 2 * 1024 * 1024; // 2MB antes de rotacionar
const MAX_ROTATED = 5;

function ensureDir() {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function rotateIfNeeded() {
    try {
        if (!fs.existsSync(MAIN_LOG)) return;
        if (fs.statSync(MAIN_LOG).size <= MAX_SIZE) return;
        const rotatedName = path.join(LOG_DIR, `horizon.${Date.now()}.log`);
        fs.renameSync(MAIN_LOG, rotatedName);
        const rotated = fs
            .readdirSync(LOG_DIR)
            .filter((f) => /^horizon\.\d+\.log$/.test(f))
            .sort();
        while (rotated.length > MAX_ROTATED) {
            fs.unlinkSync(path.join(LOG_DIR, rotated.shift()));
        }
    } catch {
        /* ignore */
    }
}

function write(level, args) {
    ensureDir();
    rotateIfNeeded();
    const parts = args.map((a) => {
        if (a instanceof Error) return `${a.name}: ${a.message}`;
        if (typeof a === 'string') return a;
        try {
            return JSON.stringify(a);
        } catch {
            return String(a);
        }
    });
    const line = `[${new Date().toISOString()}] ${level.padEnd(5)} ${parts.join(' ')}\n`;
    try {
        fs.appendFileSync(MAIN_LOG, line);
    } catch {
        /* ignore */
    }
}

export const log = {
    info: (...a) => write('INFO', a),
    warn: (...a) => write('WARN', a),
    error: (...a) => write('ERROR', a),
    debug: (...a) => {
        if (process.env.HORIZON_DEBUG) write('DEBUG', a);
    },
};

export function tailLogs(n = 50) {
    if (!fs.existsSync(MAIN_LOG)) return [];
    const content = fs.readFileSync(MAIN_LOG, 'utf-8').split('\n').filter(Boolean);
    return content.slice(-n);
}

export function getLogPath() {
    return MAIN_LOG;
}

export function getLogDir() {
    return LOG_DIR;
}
