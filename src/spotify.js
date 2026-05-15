/**
 * HORIZON CLI — Spotify Resolver
 *
 * Resolve links do Spotify (track, album, playlist) para o YouTube e baixa.
 * NÃO precisa de API key do Spotify — usa web scraping leve do embed público.
 *
 * Fluxo:
 *   1. Detecta tipo (track/album/playlist) pelo URL.
 *   2. Extrai metadados (artista + título) via oEmbed do Spotify (endpoint público).
 *   3. Busca no YouTube com esses metadados.
 *   4. Baixa normalmente usando o downloader existente.
 *
 * Também suporta Deezer e Apple Music pelo mesmo mecanismo (nome → YouTube).
 */

import { log } from './logger.js';
import { searchYoutube, downloadOne, downloadBatch } from './downloader.js';
import { loadSettings } from './config.js';

const SPOTIFY_TRACK_RX = /open\.spotify\.com\/track\/([a-zA-Z0-9]+)/;
const SPOTIFY_ALBUM_RX = /open\.spotify\.com\/album\/([a-zA-Z0-9]+)/;
const SPOTIFY_PLAYLIST_RX = /open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/;
const DEEZER_TRACK_RX = /deezer\.com\/.*?\/track\/(\d+)/;
const APPLE_MUSIC_RX = /music\.apple\.com/;

/** Detecta o tipo do link. */
export function detectPlatform(url) {
    if (!url) return null;
    if (SPOTIFY_TRACK_RX.test(url)) return { platform: 'spotify', type: 'track', id: url.match(SPOTIFY_TRACK_RX)[1] };
    if (SPOTIFY_ALBUM_RX.test(url)) return { platform: 'spotify', type: 'album', id: url.match(SPOTIFY_ALBUM_RX)[1] };
    if (SPOTIFY_PLAYLIST_RX.test(url)) return { platform: 'spotify', type: 'playlist', id: url.match(SPOTIFY_PLAYLIST_RX)[1] };
    if (DEEZER_TRACK_RX.test(url)) return { platform: 'deezer', type: 'track', id: url.match(DEEZER_TRACK_RX)[1] };
    if (APPLE_MUSIC_RX.test(url)) return { platform: 'apple', type: 'unknown', id: null };
    return null;
}

/**
 * Busca metadados via Spotify oEmbed (público, sem API key).
 * Retorna { title, artist, description } ou null.
 */
async function fetchSpotifyOembed(url) {
    try {
        const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(oembedUrl, { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) return null;
        const data = await res.json();
        // data.title é geralmente "NomeDaMusica - Artista" ou "NomeDaPlaylist"
        return {
            title: data.title || null,
            description: data.description || null,
            provider: data.provider_name || 'Spotify',
            thumbnailUrl: data.thumbnail_url || null,
        };
    } catch (err) {
        log.warn(`spotify: oembed falhou para ${url}: ${err.message}`);
        return null;
    }
}

/**
 * Extrai termos de busca a partir de um link Spotify.
 * Para tracks: "Artista - Título"
 * Para playlists/albums: retorna o título pra depois tentar extrair faixas.
 */
async function extractSearchTerms(url, info) {
    const oembed = await fetchSpotifyOembed(url);
    if (!oembed?.title) {
        log.warn('spotify: não conseguiu extrair metadados do link');
        return null;
    }

    if (info.type === 'track') {
        // oEmbed de track retorna "Título - Artista" ou "Título"
        return [oembed.title];
    }

    // Para playlist/album, tentamos o endpoint de embed page pra extrair faixas.
    const tracks = await extractPlaylistTracks(url);
    if (tracks?.length) return tracks;

    // Fallback: retorna só o nome da playlist/album como busca genérica.
    return [oembed.title];
}

/**
 * Tenta extrair nomes de faixas do HTML embed da playlist/album.
 * Usa o endpoint público de embed (não precisa auth).
 */
async function extractPlaylistTracks(url) {
    try {
        // O embed público mostra track titles no HTML.
        const embedUrl = url.replace('open.spotify.com', 'open.spotify.com/embed');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(embedUrl, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
        });
        clearTimeout(timeout);
        if (!res.ok) return null;

        const html = await res.text();
        // O Spotify embed coloca track names em data attributes e no JSON embutido.
        // Procuramos pelo padrão "name":"Track Name" dentro do __NEXT_DATA__ ou similar.
        const trackNames = [];
        const nameMatches = html.matchAll(/"name"\s*:\s*"([^"]{2,80})"/g);
        const seen = new Set();
        for (const m of nameMatches) {
            const name = m[1];
            // Filtra nomes que parecem tracks (não muito longos, sem caracteres de URL).
            if (name.length < 3 || name.includes('http') || name.includes('spotify')) continue;
            if (seen.has(name.toLowerCase())) continue;
            seen.add(name.toLowerCase());
            trackNames.push(name);
        }

        // Pega artistas também pra melhorar a busca.
        const artistMatches = html.matchAll(/"artists"\s*:\s*\[\s*\{[^}]*"name"\s*:\s*"([^"]+)"/g);
        const artists = [];
        for (const m of artistMatches) {
            if (!artists.includes(m[1])) artists.push(m[1]);
        }

        if (!trackNames.length) return null;

        // Se temos artistas, combina "Artista - Track"
        const mainArtist = artists[0] || '';
        return trackNames.map((t) =>
            mainArtist ? `${mainArtist} - ${t}` : t,
        );
    } catch (err) {
        log.warn(`spotify: extractPlaylistTracks falhou: ${err.message}`);
        return null;
    }
}

/**
 * Resolve e baixa a partir de um link Spotify/Deezer/Apple Music.
 * @param {string} url       Link da plataforma.
 * @param {object} options   { playlist, concurrency, onProgress }
 * @returns {object}         { ok, tracks, results }
 */
export async function resolveAndDownload(url, options = {}) {
    const info = detectPlatform(url);
    if (!info) {
        return { ok: false, error: 'URL não reconhecida como Spotify/Deezer/Apple Music.' };
    }

    log.info(`spotify: resolvendo ${info.platform}/${info.type} ${url}`);

    const terms = await extractSearchTerms(url, info);
    if (!terms?.length) {
        return { ok: false, error: 'Não consegui extrair informações do link. Tenta colar o nome da música manualmente.' };
    }

    const settings = loadSettings();
    const playlist = options.playlist || settings.defaultPlaylist;
    const concurrency = options.concurrency || settings.concurrency;

    if (terms.length === 1) {
        // Single track — busca top-1 e baixa direto.
        const results = await searchYoutube(terms[0], 1);
        if (!results.length) {
            return { ok: false, error: `Nenhum resultado no YouTube para: "${terms[0]}"` };
        }
        const ytUrl = `https://www.youtube.com/watch?v=${results[0].videoId}`;
        const res = await downloadOne({ target: ytUrl, playlist, isSearchTerm: false });
        return { ok: res.ok, tracks: 1, results: [{ term: terms[0], ...res }] };
    }

    // Múltiplas faixas — modo lote.
    const onProgress = options.onProgress || (() => {});
    onProgress({ type: 'resolve', total: terms.length, platform: info.platform });

    const results = await downloadBatch(terms, {
        playlist,
        concurrency,
        onProgress,
    });

    const ok = results.filter((r) => r.ok).length;
    return {
        ok: ok > 0,
        tracks: terms.length,
        downloaded: ok,
        failed: terms.length - ok,
        results,
    };
}

/**
 * Lista as faixas que seriam baixadas (dry-run / preview).
 */
export async function previewSpotifyLink(url) {
    const info = detectPlatform(url);
    if (!info) return { ok: false, error: 'URL não reconhecida.' };

    const terms = await extractSearchTerms(url, info);
    return {
        ok: Boolean(terms?.length),
        platform: info.platform,
        type: info.type,
        tracks: terms || [],
    };
}
