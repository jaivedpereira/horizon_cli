/**
 * HORIZON CLI — Web Dashboard
 *
 * Servidor Express com:
 *   - REST API pra controlar o Horizon remotamente
 *   - Dashboard HTML embutido (single-file, sem build)
 *   - Autenticação básica via token no .env (WEB_TOKEN)
 *
 * Porta padrão: 3777 (env WEB_PORT)
 *
 * Rodar: horizon web [--port 3777]
 *
 * API Endpoints:
 *   GET  /api/status        — saúde geral (versão, anti-ban, fila)
 *   GET  /api/history       — últimos downloads
 *   GET  /api/queue         — fila pendente/completed/failed
 *   GET  /api/subs          — inscrições
 *   GET  /api/stats         — estatísticas brutas
 *   GET  /api/playlists     — pastas locais
 *   GET  /api/antiban       — estado do circuit breaker
 *   POST /api/search        — buscar no YouTube { query }
 *   POST /api/download      — baixar { target, playlist }
 *   POST /api/spotify       — resolver Spotify { url, playlist }
 *   POST /api/sync          — rodar sync
 *   POST /api/antiban/reset — resetar circuit breaker
 *   POST /api/queue/run     — processar fila
 *   POST /api/queue/retry   — retry dos falhos
 *   POST /api/queue/clear   — limpar fila
 */

import { createServer } from 'http';
import { log } from './logger.js';
import { loadSettings } from './config.js';
import { loadHistory, summary } from './history.js';
import { queueStats, listAll as listQueue, clearQueue, retryFailed } from './queue.js';
import { listSubscriptions } from './subscriptions.js';
import { listPlaylistFolders, listAudioFiles } from './export.js';
import { circuitStatus, circuitOpen, resetCircuit } from './antiban.js';
import { searchYoutube, downloadOne } from './downloader.js';
import { resolveAndDownload } from './spotify.js';
import { syncAll } from './sync.js';
import { runQueue } from './queueRunner.js';
import { getMusicBaseDir } from './config.js';
import { globalStats } from './botState.js';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const WEB_TOKEN = process.env.WEB_TOKEN || '';

// ============================================================
//  MINI ROUTER (sem Express — zero dependência extra!)
// ============================================================

function parseBody(req) {
    return new Promise((resolve) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString()));
            } catch {
                resolve({});
            }
        });
    });
}

function json(res, data, status = 200) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    res.end(JSON.stringify(data));
}

function html(res, content) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(content);
}

function auth(req) {
    if (!WEB_TOKEN) return true; // Sem token = aberto.
    const header = req.headers.authorization || '';
    const token = header.replace(/^Bearer\s+/i, '').trim();
    const query = new URL(req.url, 'http://localhost').searchParams.get('token');
    return token === WEB_TOKEN || query === WEB_TOKEN;
}

// ============================================================
//  ROTAS
// ============================================================

const routes = {
    'GET /api/status': async () => {
        const s = loadSettings();
        const cb = circuitOpen();
        const q = queueStats();
        return {
            version: '2.4.0',
            antiban: s.antibanMode,
            circuitOpen: cb.open,
            circuitReason: cb.reason || null,
            queue: q,
            musicBaseDir: getMusicBaseDir(),
        };
    },

    'GET /api/history': async () => {
        return { history: loadHistory().slice(-50).reverse(), summary: summary() };
    },

    'GET /api/queue': async () => {
        return listQueue();
    },

    'GET /api/subs': async () => {
        return { subscriptions: listSubscriptions() };
    },

    'GET /api/stats': async () => {
        try {
            return globalStats();
        } catch {
            return summary();
        }
    },

    'GET /api/playlists': async () => {
        const folders = listPlaylistFolders();
        return {
            playlists: folders.map((name) => ({
                name,
                files: listAudioFiles(path.join(getMusicBaseDir(), name)).length,
            })),
        };
    },

    'GET /api/antiban': async () => {
        const s = loadSettings();
        const st = circuitStatus();
        const open = circuitOpen();
        return { mode: s.antibanMode, circuit: st, open: open.open, remainingMs: open.remainingMs || 0 };
    },

    'POST /api/search': async (body) => {
        if (!body.query) return { error: 'query obrigatório' };
        const results = await searchYoutube(body.query, body.limit || 5);
        return { results };
    },

    'POST /api/download': async (body) => {
        if (!body.target) return { error: 'target obrigatório' };
        const res = await downloadOne({
            target: body.target,
            playlist: body.playlist || loadSettings().defaultPlaylist,
            isSearchTerm: !body.target.startsWith('http'),
        });
        return res;
    },

    'POST /api/spotify': async (body) => {
        if (!body.url) return { error: 'url obrigatório' };
        const res = await resolveAndDownload(body.url, { playlist: body.playlist });
        return res;
    },

    'POST /api/sync': async () => {
        const res = await syncAll();
        if (res.enqueued > 0) await runQueue();
        return res;
    },

    'POST /api/antiban/reset': async () => {
        resetCircuit();
        return { ok: true, message: 'Circuit breaker resetado.' };
    },

    'POST /api/queue/run': async () => {
        const res = await runQueue();
        return res;
    },

    'POST /api/queue/retry': async () => {
        const moved = retryFailed();
        return { ok: true, moved };
    },

    'POST /api/queue/clear': async (body) => {
        clearQueue(body.scope || 'all');
        return { ok: true };
    },
};

// ============================================================
//  DASHBOARD HTML (single-file, sem build, sem CDN de peso)
// ============================================================

function getDashboardHTML(token) {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Horizon — Dashboard</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d1117; color: #c9d1d9; min-height: 100vh; }
.header { background: linear-gradient(135deg, #1a1b26 0%, #0d1117 100%); border-bottom: 1px solid #21262d; padding: 1rem 2rem; display: flex; align-items: center; gap: 1rem; }
.header h1 { font-size: 1.5rem; color: #58a6ff; }
.header .badge { background: #238636; color: #fff; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; }
.container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
.card { background: #161b22; border: 1px solid #21262d; border-radius: 8px; padding: 1.25rem; }
.card h3 { color: #58a6ff; font-size: 0.9rem; margin-bottom: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; }
.card .value { font-size: 2rem; font-weight: bold; color: #f0f6fc; }
.card .sub { font-size: 0.8rem; color: #8b949e; margin-top: 0.25rem; }
.section { margin-bottom: 2rem; }
.section h2 { color: #c9d1d9; margin-bottom: 1rem; font-size: 1.2rem; }
.search-box { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
.search-box input { flex: 1; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; padding: 0.75rem 1rem; color: #c9d1d9; font-size: 1rem; }
.search-box input:focus { outline: none; border-color: #58a6ff; }
.btn { background: #238636; color: #fff; border: none; padding: 0.75rem 1.5rem; border-radius: 6px; cursor: pointer; font-size: 0.9rem; font-weight: 500; }
.btn:hover { background: #2ea043; }
.btn-danger { background: #da3633; }
.btn-danger:hover { background: #f85149; }
.btn-secondary { background: #30363d; color: #c9d1d9; }
.btn-secondary:hover { background: #484f58; }
.table { width: 100%; border-collapse: collapse; }
.table th, .table td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #21262d; font-size: 0.85rem; }
.table th { color: #8b949e; font-weight: 500; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
.status-ok { background: #3fb950; }
.status-err { background: #f85149; }
.status-warn { background: #d29922; }
.toast { position: fixed; bottom: 2rem; right: 2rem; background: #238636; color: #fff; padding: 1rem 1.5rem; border-radius: 8px; display: none; z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.4); }
.results { max-height: 300px; overflow-y: auto; }
.result-item { padding: 0.5rem 0.75rem; border-bottom: 1px solid #21262d; cursor: pointer; display: flex; align-items: center; gap: 0.75rem; }
.result-item:hover { background: #1c2128; }
#loading { display: none; color: #58a6ff; }
</style>
</head>
<body>
<div class="header">
    <h1>🌌 Horizon</h1>
    <span class="badge">v2.4</span>
    <span id="circuit-badge" style="display:none" class="badge" style="background:#da3633">⛔ Anti-ban ativo</span>
</div>
<div class="container">
    <div class="grid" id="cards"></div>

    <div class="section">
        <h2>🔍 Buscar e baixar</h2>
        <div class="search-box">
            <input type="text" id="searchInput" placeholder="Nome da música, link do YouTube ou link do Spotify..." />
            <button class="btn" onclick="doSearch()">Buscar</button>
        </div>
        <div id="loading">⏳ Processando...</div>
        <div class="results" id="results"></div>
    </div>

    <div class="section">
        <h2>📜 Últimos downloads</h2>
        <table class="table" id="historyTable">
            <thead><tr><th></th><th>Quando</th><th>Pasta</th><th>Música</th></tr></thead>
            <tbody></tbody>
        </table>
    </div>

    <div class="section">
        <h2>⚡ Ações rápidas</h2>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
            <button class="btn" onclick="doSync()">🔄 Sync inscrições</button>
            <button class="btn btn-secondary" onclick="doQueueRun()">📦 Rodar fila</button>
            <button class="btn btn-secondary" onclick="doQueueRetry()">♻️ Retry falhos</button>
            <button class="btn btn-danger" onclick="doAntibanReset()">🛡️ Resetar anti-ban</button>
        </div>
    </div>
</div>

<div class="toast" id="toast"></div>

<script>
const TOKEN = '${token}';
const BASE = location.origin;

function headers() {
    const h = { 'Content-Type': 'application/json' };
    if (TOKEN) h['Authorization'] = 'Bearer ' + TOKEN;
    return h;
}

async function api(method, path, body) {
    const opts = { method, headers: headers() };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(BASE + path, opts);
    return res.json();
}

function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 3000);
}

async function loadDashboard() {
    const status = await api('GET', '/api/status');
    const history = await api('GET', '/api/history');
    const playlists = await api('GET', '/api/playlists');

    // Cards
    const cards = document.getElementById('cards');
    const q = status.queue || {};
    cards.innerHTML = \`
        <div class="card"><h3>📥 Downloads</h3><div class="value">\${history.summary?.total || 0}</div><div class="sub">✅ \${history.summary?.ok || 0} ok · ❌ \${history.summary?.err || 0} erros</div></div>
        <div class="card"><h3>📦 Fila</h3><div class="value">\${q.pending || 0}</div><div class="sub">concluídos: \${q.completed || 0} · falhos: \${q.failed || 0}</div></div>
        <div class="card"><h3>📁 Playlists</h3><div class="value">\${playlists.playlists?.length || 0}</div><div class="sub">\${playlists.playlists?.reduce((s,p) => s + p.files, 0) || 0} arquivos</div></div>
        <div class="card"><h3>🛡️ Anti-ban</h3><div class="value">\${status.antiban}</div><div class="sub">\${status.circuitOpen ? '⛔ CIRCUIT ABERTO' : '✅ OK'}</div></div>
    \`;

    if (status.circuitOpen) {
        document.getElementById('circuit-badge').style.display = 'inline';
    }

    // History table
    const tbody = document.querySelector('#historyTable tbody');
    const entries = (history.history || []).slice(0, 15);
    tbody.innerHTML = entries.map(e => \`
        <tr>
            <td><span class="status-dot \${e.status === 'ok' ? 'status-ok' : 'status-err'}"></span></td>
            <td>\${(e.ts || '').slice(0, 16).replace('T', ' ')}</td>
            <td>\${e.playlist || '-'}</td>
            <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${e.target || ''}</td>
        </tr>
    \`).join('');
}

async function doSearch() {
    const input = document.getElementById('searchInput').value.trim();
    if (!input) return;
    const loading = document.getElementById('loading');
    const resultsDiv = document.getElementById('results');
    loading.style.display = 'block';
    resultsDiv.innerHTML = '';

    // Detecta se é Spotify.
    if (input.includes('spotify.com') || input.includes('deezer.com')) {
        const res = await api('POST', '/api/spotify', { url: input });
        loading.style.display = 'none';
        if (res.ok) {
            toast(\`✅ Baixado! \${res.downloaded || 1} faixa(s)\`);
        } else {
            toast('❌ ' + (res.error || 'Erro'));
        }
        loadDashboard();
        return;
    }

    // Se for URL do YouTube, baixa direto.
    if (input.startsWith('http') && (input.includes('youtu') || input.includes('youtube'))) {
        const res = await api('POST', '/api/download', { target: input });
        loading.style.display = 'none';
        toast(res.ok ? '✅ Baixado!' : '❌ Erro no download');
        loadDashboard();
        return;
    }

    // Busca no YouTube.
    const res = await api('POST', '/api/search', { query: input });
    loading.style.display = 'none';
    if (!res.results?.length) {
        resultsDiv.innerHTML = '<p style="color:#8b949e">Nenhum resultado.</p>';
        return;
    }
    resultsDiv.innerHTML = res.results.map(r => \`
        <div class="result-item" onclick="downloadResult('\${r.videoId}')">
            <span>🎵</span>
            <span>\${r.title}</span>
        </div>
    \`).join('');
}

async function downloadResult(videoId) {
    const url = 'https://www.youtube.com/watch?v=' + videoId;
    document.getElementById('loading').style.display = 'block';
    const res = await api('POST', '/api/download', { target: url });
    document.getElementById('loading').style.display = 'none';
    document.getElementById('results').innerHTML = '';
    toast(res.ok ? '✅ Baixado!' : '❌ Erro');
    loadDashboard();
}

async function doSync() {
    toast('🔄 Sincronizando...');
    const res = await api('POST', '/api/sync');
    toast(\`✅ Sync: \${res.enqueued || 0} novos\`);
    loadDashboard();
}

async function doQueueRun() {
    toast('📦 Rodando fila...');
    await api('POST', '/api/queue/run');
    toast('✅ Fila processada');
    loadDashboard();
}

async function doQueueRetry() {
    const res = await api('POST', '/api/queue/retry');
    toast(\`♻️ \${res.moved || 0} re-enfileirados\`);
    loadDashboard();
}

async function doAntibanReset() {
    await api('POST', '/api/antiban/reset');
    toast('🛡️ Circuit breaker resetado');
    loadDashboard();
}

document.getElementById('searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
});

loadDashboard();
setInterval(loadDashboard, 30000); // Refresh a cada 30s.
</script>
</body>
</html>`;
}

// ============================================================
//  SERVIDOR
// ============================================================

export function startWebServer({ port = 3777 } = {}) {
    const server = createServer(async (req, res) => {
        // CORS preflight.
        if (req.method === 'OPTIONS') {
            res.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            });
            res.end();
            return;
        }

        const url = new URL(req.url, `http://localhost:${port}`);
        const pathname = url.pathname;

        // Dashboard HTML.
        if (pathname === '/' || pathname === '/dashboard') {
            return html(res, getDashboardHTML(WEB_TOKEN));
        }

        // API routes — precisa de auth.
        if (pathname.startsWith('/api/')) {
            if (!auth(req)) {
                return json(res, { error: 'Unauthorized. Set WEB_TOKEN no .env ou passe ?token=...' }, 401);
            }

            const routeKey = `${req.method} ${pathname}`;
            const handler = routes[routeKey];
            if (!handler) {
                return json(res, { error: 'Not found' }, 404);
            }

            try {
                const body = req.method === 'POST' ? await parseBody(req) : {};
                const result = await handler(body);
                return json(res, result);
            } catch (err) {
                log.error(`web: ${routeKey} falhou: ${err.message}`);
                return json(res, { error: err.message }, 500);
            }
        }

        json(res, { error: 'Not found' }, 404);
    });

    server.listen(port, '0.0.0.0', () => {
        console.log(`\n🌐 Horizon Web Dashboard rodando em:`);
        console.log(`   Local:   http://localhost:${port}`);
        console.log(`   Rede:    http://0.0.0.0:${port}`);
        if (WEB_TOKEN) {
            console.log(`   Token:   configurado (${WEB_TOKEN.slice(0, 4)}...)`);
        } else {
            console.log(`   Token:   ABERTO (defina WEB_TOKEN no .env pra proteger)`);
        }
        console.log(`\n   Ctrl+C pra parar.\n`);
        log.info(`web: server online port=${port}`);
    });

    return server;
}
