/**
 * HORIZON CLI — Sistema Anti-Bloqueio (anti-ban) do YouTube
 *
 * O YouTube barra downloads suspeitos com erros tipo 429, 403 ou
 * "Sign in to confirm you're not a bot". Esse módulo aplica várias
 * camadas de proteção ao yt-dlp:
 *
 *   1. Player clients múltiplos (android/web/ios) — o yt-dlp tenta em
 *      cada um, e se um falha, cai pro próximo automaticamente.
 *   2. Sleep entre requests — reduz o padrão "bot" do tráfego.
 *   3. Rate-limit de banda — evita chamar atenção em downloads longos.
 *   4. User-Agent rotativo — troca a "assinatura" do cliente.
 *   5. Cookies do navegador (opcional) — usa sua sessão logada.
 *   6. Geo-bypass — tenta contornar bloqueio por região.
 *   7. Retries mais resilientes (5 tentativas, fragmentos retry=10).
 *   8. Circuit breaker — se falhar N vezes seguidas ou detectar um ban,
 *      pausa o app inteiro por X minutos (evita queimar o IP).
 */

import fs from 'fs';
import path from 'path';
import { getAppDir } from './config.js';
import { shellEscape } from './utils.js';
import { log } from './logger.js';

/** Pool de User-Agents reais e recentes. */
export const USER_AGENTS = [
    // Windows Chrome
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    // Mac Safari
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    // Linux Firefox
    'Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0',
    // Android Chrome
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
    // iPhone Safari
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
];

/** Perfis prontos de anti-ban (o usuário escolhe 1 em `horizon config`). */
export const ANTIBAN_MODES = {
    desligado: {
        label: 'Desligado — máxima velocidade, maior risco',
        sleep: 0,
        rate: null,
        clients: [],
    },
    seguro: {
        label: 'Seguro — recomendado (padrão)',
        sleep: 1,
        rate: null,
        clients: ['android', 'web'],
    },
    agressivo: {
        label: 'Agressivo — mais lento, quase nunca toma ban',
        sleep: 5,
        rate: '2M',
        clients: ['android', 'web', 'ios'],
    },
    furtivo: {
        label: 'Furtivo — usa cookies do navegador + delays altos',
        sleep: 8,
        rate: '1M',
        clients: ['android', 'web', 'ios'],
        wantsCookies: true,
    },
};

// =====================================================
//  CIRCUIT BREAKER
// =====================================================

const CIRCUIT_FILE = path.join(getAppDir(), 'circuit.json');
const CIRCUIT_THRESHOLD = 5;                   // 5 falhas seguidas abrem o circuito
const CIRCUIT_COOLDOWN_MS = 10 * 60 * 1000;    // pausa global de 10 minutos

function loadCircuit() {
    if (!fs.existsSync(CIRCUIT_FILE)) return { failures: 0, openedAt: null, reason: null };
    try {
        return JSON.parse(fs.readFileSync(CIRCUIT_FILE, 'utf-8'));
    } catch {
        return { failures: 0, openedAt: null, reason: null };
    }
}

function saveCircuit(state) {
    fs.writeFileSync(CIRCUIT_FILE, JSON.stringify(state, null, 2));
}

/** Retorna {open, remainingMs, reason} — sabe se o app está "pausado". */
export function circuitOpen() {
    const c = loadCircuit();
    if (!c.openedAt) return { open: false };
    const elapsed = Date.now() - c.openedAt;
    if (elapsed >= CIRCUIT_COOLDOWN_MS) {
        // Cooldown expirou: resetar.
        saveCircuit({ failures: 0, openedAt: null, reason: null });
        log.info('antiban: circuit breaker fechado (cooldown expirou)');
        return { open: false };
    }
    return {
        open: true,
        remainingMs: CIRCUIT_COOLDOWN_MS - elapsed,
        reason: c.reason || 'falhas repetidas',
    };
}

/** Ser chamado quando um download dá certo — zera o contador. */
export function recordSuccess() {
    const c = loadCircuit();
    if (c.failures || c.openedAt) {
        saveCircuit({ failures: 0, openedAt: null, reason: null });
    }
}

/** Detecta se um erro cheira a bloqueio do YouTube. */
function looksLikeBan(errorMessage) {
    const msg = String(errorMessage || '').toLowerCase();
    return (
        msg.includes('http error 429') ||
        msg.includes('http error 403') ||
        msg.includes('too many requests') ||
        msg.includes("sign in to confirm you're not a bot") ||
        msg.includes('sign in to confirm') ||
        msg.includes('video unavailable') && msg.includes('blocked') ||
        /rate.?limit/.test(msg) ||
        /bot.?check/.test(msg)
    );
}

/** Registra uma falha. Se detectar ban OU passar do threshold, abre o circuito. */
export function recordFailure(err) {
    const c = loadCircuit();
    c.failures = (c.failures || 0) + 1;
    const isBan = looksLikeBan(err?.message || err);
    if (isBan || c.failures >= CIRCUIT_THRESHOLD) {
        c.openedAt = Date.now();
        c.reason = isBan ? 'bloqueio do YouTube detectado' : `${c.failures} falhas seguidas`;
        log.warn(`antiban: CIRCUITO ABERTO — ${c.reason}`);
    }
    saveCircuit(c);
    return { opened: Boolean(c.openedAt) };
}

/** Zera o circuito manualmente (usado por `horizon antiban reset`). */
export function resetCircuit() {
    saveCircuit({ failures: 0, openedAt: null, reason: null });
}

export function circuitStatus() {
    return loadCircuit();
}

// =====================================================
//  FLAGS DO YT-DLP
// =====================================================

export function pickUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Monta as flags do yt-dlp para o modo anti-ban escolhido pelo usuário.
 * @param {object} settings  objeto de configurações (antibanMode, cookiesBrowser, ...)
 * @returns {string[]}  lista de flags prontas pra concatenar
 */
export function antibanFlags(settings = {}) {
    const modeKey = settings.antibanMode || 'seguro';
    const mode = ANTIBAN_MODES[modeKey] || ANTIBAN_MODES.seguro;
    const flags = [];

    // 1. Sleep entre VÍDEOS (não entre cada request HTTP — isso era muito lento).
    // --sleep-requests é REMOVIDO pois deixava cada vídeo N vezes mais lento.
    if (mode.sleep > 0) {
        flags.push(`--sleep-interval ${mode.sleep}`);
        flags.push(`--max-sleep-interval ${mode.sleep * 2}`);
    }

    // 2. Rate-limit de banda.
    if (mode.rate) {
        flags.push(`--limit-rate ${mode.rate}`);
    }

    // 3. Player clients múltiplos — o fallback mais eficaz contra bans.
    if (mode.clients?.length) {
        flags.push('--extractor-args');
        flags.push(shellEscape(`youtube:player_client=${mode.clients.join(',')}`));
    }

    // 4. User-Agent rotativo (opcional).
    if (settings.rotateUserAgent !== false) {
        flags.push('--user-agent');
        flags.push(shellEscape(pickUserAgent()));
    }

    // 5. Cookies do navegador (opcional, o mais poderoso — usa sua sessão).
    const wantsCookies = mode.wantsCookies || settings.useCookies;
    if (wantsCookies && settings.cookiesBrowser) {
        flags.push(`--cookies-from-browser ${settings.cookiesBrowser}`);
    }

    // 6. Geo-bypass.
    if (settings.geoBypass !== false) {
        flags.push('--geo-bypass');
    }

    // 7. Retries robustos (vale até no modo desligado).
    flags.push('--retries', '5');
    flags.push('--fragment-retries', '10');
    flags.push('--retry-sleep', 'linear=1::2');

    return flags;
}

/** Devolve a flag do postprocessor pra normalizar volume via ffmpeg (EBU R128). */
export function loudnessFlags(settings) {
    if (!settings?.normalizeVolume) return [];
    // loudnorm com alvos padrão de streaming: -14 LUFS, -1.5 dBTP, 11 LRA.
    return [
        '--postprocessor-args',
        shellEscape('ffmpeg:-af loudnorm=I=-14:TP=-1.5:LRA=11'),
    ];
}
