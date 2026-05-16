/**
 * HORIZON CLI v2.5 — Playlist Resolver Universal
 *
 * Resolve e baixa playlists/tracks de QUALQUER plataforma:
 *   - YouTube (nativo yt-dlp)
 *   - Spotify (oEmbed + embed scraping)
 *   - Deezer (oEmbed + scraping)
 *   - SoundCloud (yt-dlp nativo)
 *   - Apple Music (scraping)
 *   - Tidal (scraping meta tags)
 */

import { log } from './logger.js';
import { searchYoutube, downloadOne, downloadBatch, downloadPlaylist } from './downloader.js';
import { resolveAndDownload, detectPlatform, previewSpotifyLink } from './spotify.js';
import { loadSettings } from './config.js';
import { isYoutubeUrl, isPlaylistUrl } from './utils.js';

const PLATFORM_PATTERNS = {
    spotify: /open\.spotify\.com\/(track|album|playlist|artist)\//i,
    youtube: /youtu(\.be|be\.com)\//i,
    deezer: /deezer\.com\/.+\/(track|album|playlist)\//i,
    soundcloud: /soundcloud\.com\//i,
    apple: /music\.apple\.com\//i,
    tidal: /tidal\.com\/(browse\/)?(track|album|playlist)\//i,
};

export function detectSource(url) {
    if (!url || typeof url !== 'string') return null;
    for (const [platform, regex] of Object.entries(PLATFORM_PATTERNS)) {
        if (regex.test(url)) {
            let type = 'track';
            if (url.includes('/playlist')) type = 'playlist';
            else if (url.includes('/album')) type = 'album';
            else if (url.includes('/artist')) type = 'artist';
            else if (isPlaylistUrl(url)) type = 'playlist';
            return { platform, type, url };
        }
    }
    if (/^https?:\/\//i.test(url)) return { platform: 'direct', type: 'url', url };
    return null;
}

async function resolveSoundCloud(url, options = {}) {
    const settings = loadSettings();
    const playlist = options.playlist || settings.defaultPlaylist;
    if (url.includes('/sets/') || url.includes('/likes')) {
        const res = await downloadPlaylist({ url, playlist, overrides: options.overrides || {}, silent: options.silent || false });
        return { ok: res.ok, platform: 'soundcloud', type: 'playlist', ...res };
    }
    const res = await downloadOne({ target: url, playlist, isSearchTerm: false, overrides: options.overrides || {} });
    return { ok: res.ok, platform: 'soundcloud', type: 'track', tracks: 1, ...res };
}

async function resolveTidal(url, options = {}) {
    const settings = loadSettings();
    const playlist = options.playlist || settings.defaultPlaylist;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });
        clearTimeout(timeout);
        if (!res.ok) return { ok: false, error: `Tidal HTTP ${res.status}` };
        const html = await res.text();
        const tracks = [];
        const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
        if (titleMatch) tracks.push(titleMatch[1]);
        const jsonMatches = html.matchAll(/"title"\s*:\s*"([^"]{2,80})"/g);
        for (const m of jsonMatches) { if (!tracks.includes(m[1]) && m[1].length > 2) tracks.push(m[1]); }
        if (!tracks.length) return { ok: false, error: 'Nao extraiu faixas do Tidal.' };
        if (tracks.length === 1) {
            const yt = await searchYoutube(tracks[0], 1);
            if (!yt.length) return { ok: false, error: `Sem resultado YT: ${tracks[0]}` };
            const dl = await downloadOne({ target: `https://www.youtube.com/watch?v=${yt[0].videoId}`, playlist, isSearchTerm: false });
            return { ok: dl.ok, platform: 'tidal', type: 'track', tracks: 1 };
        }
        const results = await downloadBatch(tracks, { playlist, concurrency: options.concurrency || settings.concurrency, onProgress: options.onProgress || (() => {}) });
        const ok = results.filter((r) => r.ok).length;
        return { ok: ok > 0, platform: 'tidal', type: 'playlist', tracks: tracks.length, downloaded: ok };
    } catch (err) {
        log.error(`tidal: ${err.message}`);
        return { ok: false, error: err.message };
    }
}

async function resolveYouTube(url, options = {}) {
    const settings = loadSettings();
    const playlist = options.playlist || settings.defaultPlaylist;
    if (isPlaylistUrl(url)) {
        const res = await downloadPlaylist({ url, playlist, overrides: options.overrides || {}, silent: options.silent || false });
        return { ok: res.ok, platform: 'youtube', type: 'playlist', ...res };
    }
    const res = await downloadOne({ target: url, playlist, isSearchTerm: false, overrides: options.overrides || {} });
    return { ok: res.ok, platform: 'youtube', type: 'track', tracks: 1, ...res };
}

export async function universalResolve(url, options = {}) {
    const source = detectSource(url);
    if (!source) return { ok: false, error: 'URL nao reconhecida. Suportados: YouTube, Spotify, Deezer, SoundCloud, Apple Music, Tidal.' };
    log.info(`resolver: ${source.platform}/${source.type} -> ${url}`);
    const onProgress = options.onProgress || (() => {});
    onProgress({ type: 'resolving', platform: source.platform, url });
    switch (source.platform) {
        case 'youtube': return resolveYouTube(url, options);
        case 'spotify': return resolveAndDownload(url, options);
        case 'deezer': return resolveAndDownload(url, options);
        case 'soundcloud': return resolveSoundCloud(url, options);
        case 'apple': return resolveAndDownload(url, options);
        case 'tidal': return resolveTidal(url, options);
        case 'direct': {
            const s = loadSettings();
            const res = await downloadOne({ target: url, playlist: options.playlist || s.defaultPlaylist, isSearchTerm: false, overrides: options.overrides || {} });
            return { ok: res.ok, platform: 'direct', type: 'track', tracks: 1, ...res };
        }
        default: return { ok: false, error: `Plataforma ${source.platform} nao implementada.` };
    }
}

export async function universalPreview(url) {
    const source = detectSource(url);
    if (!source) return { ok: false, error: 'URL nao reconhecida.' };
    if (source.platform === 'spotify') return previewSpotifyLink(url);
    return { ok: true, platform: source.platform, type: source.type, url, note: 'Sera resolvido no momento do download.' };
}

export function supportedPlatforms() {
    return [
        { name: 'YouTube', emoji: '▶️', patterns: ['youtube.com', 'youtu.be'] },
        { name: 'Spotify', emoji: '🟢', patterns: ['open.spotify.com'] },
        { name: 'Deezer', emoji: '🎵', patterns: ['deezer.com'] },
        { name: 'SoundCloud', emoji: '🟠', patterns: ['soundcloud.com'] },
        { name: 'Apple Music', emoji: '🍎', patterns: ['music.apple.com'] },
        { name: 'Tidal', emoji: '🌊', patterns: ['tidal.com'] },
    ];
}
