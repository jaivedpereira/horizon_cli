/**
 * HORIZON CLI — Sync
 * Sincroniza inscrições: lê arquivo de dedup, enfileira só os IDs novos.
 */

import fs from 'fs';
import { getArchiveFile } from './config.js';
import { listSubscriptions, fetchRemoteIds, touchSubscription } from './subscriptions.js';
import { enqueue } from './queue.js';
import { log } from './logger.js';

function loadArchiveIds() {
    const file = getArchiveFile();
    if (!fs.existsSync(file)) return new Set();
    const ids = fs
        .readFileSync(file, 'utf-8')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
            // yt-dlp salva como "youtube VIDEOID"
            const parts = l.split(/\s+/);
            return parts[parts.length - 1];
        });
    return new Set(ids);
}

export async function syncAll({ onProgress = () => {} } = {}) {
    const subs = listSubscriptions();
    if (!subs.length) return { subs: 0, enqueued: 0, checked: 0 };

    const archived = loadArchiveIds();
    let enqueuedTotal = 0;
    let checkedTotal = 0;

    for (const sub of subs) {
        onProgress({ type: 'sub_start', sub });
        try {
            const ids = await fetchRemoteIds(sub.url);
            checkedTotal += ids.length;
            const fresh = ids.filter((id) => !archived.has(id));
            if (fresh.length) {
                const urls = fresh.map((id) => `https://www.youtube.com/watch?v=${id}`);
                enqueue(urls, { playlist: sub.playlist, source: `sub:${sub.id}` });
                enqueuedTotal += fresh.length;
            }
            touchSubscription(sub.id);
            onProgress({
                type: 'sub_end',
                sub,
                total: ids.length,
                fresh: fresh.length,
            });
            log.info(`sync: ${sub.url} total=${ids.length} fresh=${fresh.length}`);
        } catch (err) {
            log.error(`sync: failed ${sub.url}: ${err.message}`);
            onProgress({ type: 'sub_error', sub, error: err });
        }
    }

    return { subs: subs.length, enqueued: enqueuedTotal, checked: checkedTotal };
}
