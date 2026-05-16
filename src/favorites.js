/**
 * HORIZON CLI v2.5 — Favorites / Bookmarks
 *
 * Sistema de favoritos para salvar musicas preferidas.
 * Persistido em ~/.horizon/favorites.json
 */

import fs from 'fs';
import path from 'path';
import { getAppDir } from './config.js';
import { log } from './logger.js';

const FAVORITES_FILE = path.join(getAppDir(), 'favorites.json');

function loadFavorites() {
    try {
        if (fs.existsSync(FAVORITES_FILE)) {
            return JSON.parse(fs.readFileSync(FAVORITES_FILE, 'utf-8'));
        }
    } catch (err) {
        log.warn(`favorites: load fail: ${err.message}`);
    }
    return [];
}

function saveFavorites(favs) {
    try {
        const dir = path.dirname(FAVORITES_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(FAVORITES_FILE, JSON.stringify(favs, null, 2), 'utf-8');
    } catch (err) {
        log.error(`favorites: save fail: ${err.message}`);
    }
}

export function addFavorite(track) {
    const favs = loadFavorites();
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const entry = {
        id,
        title: track.title || 'Sem titulo',
        url: track.url || null,
        artist: track.artist || null,
        playlist: track.playlist || null,
        source: track.source || 'manual',
        addedAt: new Date().toISOString(),
        tags: track.tags || [],
    };
    if (entry.url && favs.some((f) => f.url === entry.url)) {
        return { duplicate: true, existing: favs.find((f) => f.url === entry.url) };
    }
    favs.push(entry);
    saveFavorites(favs);
    log.info(`favorites: + "${entry.title}" (${entry.id})`);
    return { ok: true, favorite: entry };
}

export function removeFavorite(idOrUrl) {
    const favs = loadFavorites();
    const idx = favs.findIndex((f) => f.id === idOrUrl || f.url === idOrUrl);
    if (idx === -1) return false;
    favs.splice(idx, 1);
    saveFavorites(favs);
    return true;
}

export function listFavorites({ limit, tag, search } = {}) {
    let favs = loadFavorites();
    if (tag) favs = favs.filter((f) => f.tags?.includes(tag));
    if (search) {
        const q = search.toLowerCase();
        favs = favs.filter((f) => (f.title || '').toLowerCase().includes(q) || (f.artist || '').toLowerCase().includes(q));
    }
    if (limit) favs = favs.slice(-limit);
    return favs;
}

export function favoritesCount() {
    return loadFavorites().length;
}

export function toggleTag(idOrUrl, tag) {
    const favs = loadFavorites();
    const fav = favs.find((f) => f.id === idOrUrl || f.url === idOrUrl);
    if (!fav) return null;
    if (!fav.tags) fav.tags = [];
    const idx = fav.tags.indexOf(tag);
    if (idx >= 0) fav.tags.splice(idx, 1);
    else fav.tags.push(tag);
    saveFavorites(favs);
    return fav;
}

export function exportFavoritesAsTerms() {
    return loadFavorites().map((f) => f.url || `${f.artist || ''} ${f.title}`.trim()).filter(Boolean);
}

export function clearFavorites() {
    saveFavorites([]);
    return true;
}
