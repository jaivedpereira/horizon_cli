/**
 * HORIZON CLI — Utils
 * Helpers genéricos: sleep, shell escaping, URL detection, formatação.
 */

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Escapa uma string para uso seguro como argumento de shell (single quoted). */
export function shellEscape(value) {
    if (value === null || value === undefined) return "''";
    const str = String(value);
    // POSIX: envolve em aspas simples e escapa aspas simples internas.
    return `'${str.replace(/'/g, `'\\''`)}'`;
}

export function isYoutubeUrl(input) {
    if (!input || typeof input !== 'string') return false;
    return /^https?:\/\//.test(input) || /youtu\.?be/i.test(input);
}

export function isPlaylistUrl(input) {
    return typeof input === 'string' && /[?&]list=/.test(input);
}

export function isOtherPlatform(input) {
    if (!input) return false;
    return /spotify\.com|deezer\.com|music\.apple\.com|tidal\.com|soundcloud\.com/i.test(input);
}

/** Formata duração em ms para humanos (ex: "1m 23s"). */
export function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms < 0) return '0s';
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return [h ? `${h}h` : null, m ? `${m}m` : null, `${s}s`]
        .filter(Boolean)
        .join(' ');
}

/** Quebra array em chunks menores. */
export function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

/** Retry com backoff exponencial. */
export async function retry(fn, { retries = 2, baseDelay = 1500 } = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn(attempt);
        } catch (err) {
            lastErr = err;
            if (attempt < retries) {
                await sleep(baseDelay * 2 ** attempt);
            }
        }
    }
    throw lastErr;
}
