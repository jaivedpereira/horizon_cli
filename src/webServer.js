/**
 * HORIZON CLI v2.5 — Web Dashboard Enhanced
 *
 * Servidor HTTP nativo com dashboard completo:
 *   - REST API expandida (22 endpoints)
 *   - Dashboard responsivo dark-mode
 *   - Suporte universal (Spotify, Deezer, SoundCloud, etc)
 *   - Favoritos, playlists locais, configuracoes
 *   - Logs em tempo real, grafico de atividade
 *   - Gerenciamento de inscricoes
 */

import { createServer } from 'http';
import path from 'path';
import dotenv from 'dotenv';
import { log } from './logger.js';
import { loadSettings, saveSettings, getMusicBaseDir } from './config.js';
import { loadHistory, summary } from './history.js';
import { queueStats, listAll as listQueue, clearQueue, retryFailed } from './queue.js';
import { listSubscriptions, addSubscription, removeSubscription } from './subscriptions.js';
import { listPlaylistFolders, listAudioFiles } from './export.js';
import { circuitStatus, circuitOpen, resetCircuit } from './antiban.js';
import { searchYoutube, downloadOne } from './downloader.js';
import { resolveAndDownload } from './spotify.js';
import { syncAll } from './sync.js';
import { runQueue } from './queueRunner.js';
import { globalStats } from './botState.js';
import { universalResolve, detectSource, supportedPlatforms } from './playlistResolver.js';
import { listFavorites, addFavorite, removeFavorite, favoritesCount } from './favorites.js';
import { tailLogs } from './logger.js';

dotenv.config();
const WEB_TOKEN = process.env.WEB_TOKEN || '';

function parseBody(req) {
    return new Promise((resolve) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch { resolve({}); } });
    });
}

function json(res, data, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS' });
    res.end(JSON.stringify(data));
}

function html(res, content) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(content); }

function auth(req) {
    if (!WEB_TOKEN) return true;
    const header = req.headers.authorization || '';
    const token = header.replace(/^Bearer\s+/i, '').trim();
    const query = new URL(req.url, 'http://localhost').searchParams.get('token');
    return token === WEB_TOKEN || query === WEB_TOKEN;
}

// ============================================================
//  ROTAS API
// ============================================================

const routes = {
    'GET /api/status': async () => {
        const s = loadSettings();
        const cb = circuitOpen();
        const q = queueStats();
        return { version: '2.5.0', antiban: s.antibanMode, circuitOpen: cb.open, circuitReason: cb.reason || null, queue: q, musicBaseDir: getMusicBaseDir(), platforms: supportedPlatforms().map(p => p.name) };
    },
    'GET /api/history': async () => ({ history: loadHistory().slice(-100).reverse(), summary: summary() }),
    'GET /api/queue': async () => listQueue(),
    'GET /api/subs': async () => ({ subscriptions: listSubscriptions() }),
    'GET /api/stats': async () => { try { return globalStats(); } catch { return summary(); } },
    'GET /api/playlists': async () => {
        const folders = listPlaylistFolders();
        return { playlists: folders.map((name) => ({ name, files: listAudioFiles(path.join(getMusicBaseDir(), name)).length })) };
    },
    'GET /api/antiban': async () => {
        const s = loadSettings();
        const st = circuitStatus();
        const open = circuitOpen();
        return { mode: s.antibanMode, circuit: st, open: open.open, remainingMs: open.remainingMs || 0 };
    },
    'GET /api/favorites': async () => ({ favorites: listFavorites({}), count: favoritesCount() }),
    'GET /api/settings': async () => {
        const s = loadSettings();
        return { format: s.format, quality: s.quality, antibanMode: s.antibanMode, concurrency: s.concurrency, defaultPlaylist: s.defaultPlaylist, embedThumbnail: s.embedThumbnail, embedMetadata: s.embedMetadata, dedup: s.dedup, writeLyrics: s.writeLyrics };
    },
    'GET /api/logs': async () => ({ logs: tailLogs(50) }),
    'GET /api/platforms': async () => ({ platforms: supportedPlatforms() }),
    'POST /api/search': async (body) => {
        if (!body.query) return { error: 'query obrigatorio' };
        return { results: await searchYoutube(body.query, body.limit || 5) };
    },
    'POST /api/download': async (body) => {
        if (!body.target) return { error: 'target obrigatorio' };
        const source = detectSource(body.target);
        if (source && source.platform !== 'youtube' && source.platform !== 'direct') {
            return universalResolve(body.target, { playlist: body.playlist });
        }
        return downloadOne({ target: body.target, playlist: body.playlist || loadSettings().defaultPlaylist, isSearchTerm: !body.target.startsWith('http') });
    },
    'POST /api/universal': async (body) => {
        if (!body.url) return { error: 'url obrigatorio' };
        return universalResolve(body.url, { playlist: body.playlist });
    },
    'POST /api/spotify': async (body) => {
        if (!body.url) return { error: 'url obrigatorio' };
        return resolveAndDownload(body.url, { playlist: body.playlist });
    },
    'POST /api/sync': async () => { const res = await syncAll(); if (res.enqueued > 0) await runQueue(); return res; },
    'POST /api/antiban/reset': async () => { resetCircuit(); return { ok: true, message: 'Circuit breaker resetado.' }; },
    'POST /api/queue/run': async () => runQueue(),
    'POST /api/queue/retry': async () => ({ ok: true, moved: retryFailed() }),
    'POST /api/queue/clear': async (body) => { clearQueue(body.scope || 'all'); return { ok: true }; },
    'POST /api/favorites/add': async (body) => {
        if (!body.title) return { error: 'title obrigatorio' };
        return addFavorite(body);
    },
    'POST /api/favorites/remove': async (body) => {
        if (!body.id) return { error: 'id obrigatorio' };
        return { ok: removeFavorite(body.id) };
    },
    'POST /api/settings': async (body) => {
        const s = loadSettings();
        const allowed = ['format', 'quality', 'antibanMode', 'concurrency', 'defaultPlaylist', 'embedThumbnail', 'embedMetadata', 'dedup', 'writeLyrics'];
        for (const k of allowed) { if (body[k] !== undefined) s[k] = body[k]; }
        saveSettings(s);
        return { ok: true, settings: s };
    },
    'POST /api/subs/add': async (body) => {
        if (!body.url) return { error: 'url obrigatorio' };
        const sub = addSubscription({ url: body.url, playlist: body.playlist || 'Inscricoes', name: body.name || '' });
        return { ok: true, subscription: sub };
    },
    'DELETE /api/subs': async (body) => {
        if (!body.id) return { error: 'id obrigatorio' };
        return { ok: removeSubscription(body.id) };
    },
};



// ============================================================
//  DASHBOARD HTML
// ============================================================

function getDashboardHTML(token) {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Horizon v2.5 — Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0d1117;color:#c9d1d9;min-height:100vh}
.header{background:linear-gradient(135deg,#1a1b26,#0d1117);border-bottom:1px solid #21262d;padding:1rem 2rem;display:flex;align-items:center;gap:1rem}
.header h1{font-size:1.5rem;color:#58a6ff}
.badge{background:#238636;color:#fff;padding:2px 8px;border-radius:12px;font-size:.75rem}
.badge-warn{background:#d29922}
.badge-err{background:#da3633}
.container{max-width:1400px;margin:0 auto;padding:1.5rem}
.tabs{display:flex;gap:.5rem;margin-bottom:1.5rem;flex-wrap:wrap}
.tab{background:#21262d;color:#8b949e;border:none;padding:.5rem 1rem;border-radius:6px;cursor:pointer;font-size:.85rem}
.tab.active{background:#58a6ff;color:#fff}
.tab:hover{background:#30363d}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1rem;margin-bottom:1.5rem}
.card{background:#161b22;border:1px solid #21262d;border-radius:8px;padding:1.25rem}
.card h3{color:#58a6ff;font-size:.85rem;margin-bottom:.5rem;text-transform:uppercase;letter-spacing:.5px}
.card .value{font-size:1.8rem;font-weight:bold;color:#f0f6fc}
.card .sub{font-size:.8rem;color:#8b949e;margin-top:.25rem}
.section{margin-bottom:1.5rem;display:none}
.section.active{display:block}
.search-box{display:flex;gap:.5rem;margin-bottom:1rem}
.search-box input,.input{flex:1;background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:.6rem 1rem;color:#c9d1d9;font-size:.9rem}
.search-box input:focus,.input:focus{outline:none;border-color:#58a6ff}
.btn{background:#238636;color:#fff;border:none;padding:.6rem 1.2rem;border-radius:6px;cursor:pointer;font-size:.85rem;font-weight:500}
.btn:hover{background:#2ea043}
.btn-danger{background:#da3633}
.btn-danger:hover{background:#f85149}
.btn-secondary{background:#30363d;color:#c9d1d9}
.btn-secondary:hover{background:#484f58}
.btn-blue{background:#1f6feb}
.btn-blue:hover{background:#388bfd}
.table{width:100%;border-collapse:collapse}
.table th,.table td{padding:.4rem .6rem;text-align:left;border-bottom:1px solid #21262d;font-size:.82rem}
.table th{color:#8b949e;font-weight:500}
.dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px}
.dot-ok{background:#3fb950}
.dot-err{background:#f85149}
.dot-warn{background:#d29922}
.toast{position:fixed;bottom:2rem;right:2rem;background:#238636;color:#fff;padding:1rem 1.5rem;border-radius:8px;display:none;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.4)}
.results{max-height:300px;overflow-y:auto}
.result-item{padding:.5rem .75rem;border-bottom:1px solid #21262d;cursor:pointer;display:flex;align-items:center;gap:.75rem}
.result-item:hover{background:#1c2128}
.platforms-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.75rem}
.plat-card{background:#1c2128;border:1px solid #30363d;border-radius:8px;padding:1rem;text-align:center}
.plat-card .emoji{font-size:2rem}
.plat-card .name{margin-top:.5rem;font-weight:600;color:#f0f6fc}
.log-box{background:#0d1117;border:1px solid #21262d;border-radius:6px;padding:.75rem;max-height:300px;overflow-y:auto;font-family:monospace;font-size:.75rem;line-height:1.6}
.log-line-err{color:#f85149}
.log-line-warn{color:#d29922}
.log-line-info{color:#8b949e}
.fav-item{display:flex;justify-content:space-between;align-items:center;padding:.5rem 0;border-bottom:1px solid #21262d}
select{background:#0d1117;border:1px solid #30363d;color:#c9d1d9;padding:.4rem .6rem;border-radius:6px}
#loading{display:none;color:#58a6ff;margin:.5rem 0}
</style>
</head>
<body>
<div class="header">
<h1>🌌 Horizon</h1><span class="badge">v2.5</span>
<span id="cb-badge" style="display:none" class="badge badge-err">⛔ Anti-ban</span>
</div>
<div class="container">
<div class="tabs">
<button class="tab active" onclick="showTab('overview')">📊 Visao Geral</button>
<button class="tab" onclick="showTab('download')">📥 Download</button>
<button class="tab" onclick="showTab('playlists')">📁 Playlists</button>
<button class="tab" onclick="showTab('favorites')">⭐ Favoritos</button>
<button class="tab" onclick="showTab('subs')">🔔 Inscricoes</button>
<button class="tab" onclick="showTab('settings')">⚙️ Config</button>
<button class="tab" onclick="showTab('logs')">📝 Logs</button>
</div>
<div id="cards" class="grid"></div>
<div id="sec-overview" class="section active"></div>
<div id="sec-download" class="section">
<h2 style="margin-bottom:1rem;color:#f0f6fc">📥 Download Universal</h2>
<div class="platforms-grid" id="plat-grid"></div>
<div class="search-box" style="margin-top:1rem">
<input type="text" id="dlInput" placeholder="Cole link (YouTube, Spotify, Deezer, SoundCloud...) ou nome da musica" />
<button class="btn" onclick="doUniversalDl()">Baixar</button>
<button class="btn btn-secondary" onclick="doSearch()">Buscar YT</button>
</div>
<div id="loading">⏳ Processando...</div>
<div class="results" id="results"></div>
</div>
<div id="sec-playlists" class="section">
<h2 style="margin-bottom:1rem;color:#f0f6fc">📁 Playlists Locais</h2>
<div id="playlists-list"></div>
</div>
<div id="sec-favorites" class="section">
<h2 style="margin-bottom:1rem;color:#f0f6fc">⭐ Favoritos</h2>
<div class="search-box"><input type="text" id="favInput" placeholder="Adicionar favorito (titulo)" /><button class="btn" onclick="addFav()">Adicionar</button></div>
<div id="fav-list"></div>
</div>
<div id="sec-subs" class="section">
<h2 style="margin-bottom:1rem;color:#f0f6fc">🔔 Inscricoes</h2>
<div class="search-box"><input type="text" id="subUrl" placeholder="URL da playlist/canal" /><input type="text" id="subName" placeholder="Nome (opcional)" style="max-width:200px" /><button class="btn" onclick="addSub()">Adicionar</button></div>
<div id="subs-list" style="margin-top:1rem"></div>
</div>
<div id="sec-settings" class="section">
<h2 style="margin-bottom:1rem;color:#f0f6fc">⚙️ Configuracoes</h2>
<div id="settings-form" style="max-width:500px"></div>
</div>
<div id="sec-logs" class="section">
<h2 style="margin-bottom:1rem;color:#f0f6fc">📝 Logs Recentes</h2>
<button class="btn btn-secondary" onclick="loadLogs()" style="margin-bottom:.75rem">🔄 Atualizar</button>
<div class="log-box" id="log-box"></div>
</div>
<div style="margin-top:1rem">
<h3 style="color:#c9d1d9;margin-bottom:.75rem">📜 Historico recente</h3>
<table class="table" id="histTable"><thead><tr><th></th><th>Quando</th><th>Pasta</th><th>Musica</th></tr></thead><tbody></tbody></table>
</div>
<div style="margin-top:1.5rem">
<h3 style="color:#c9d1d9;margin-bottom:.75rem">⚡ Acoes rapidas</h3>
<div style="display:flex;gap:.5rem;flex-wrap:wrap">
<button class="btn" onclick="doSync()">🔄 Sync</button>
<button class="btn btn-secondary" onclick="doQueueRun()">📦 Rodar fila</button>
<button class="btn btn-secondary" onclick="doQueueRetry()">♻️ Retry</button>
<button class="btn btn-danger" onclick="doResetAB()">🛡️ Reset anti-ban</button>
</div>
</div>
</div>
<div class="toast" id="toast"></div>
</body>
</html>`;
}



function getDashboardScript(token) {
    return `<script>
const TOKEN='${token}';
const BASE=location.origin;
function headers(){const h={'Content-Type':'application/json'};if(TOKEN)h['Authorization']='Bearer '+TOKEN;return h}
async function api(m,p,b){const o={method:m,headers:headers()};if(b)o.body=JSON.stringify(b);const r=await fetch(BASE+p,o);return r.json()}
function toast(m){const e=document.getElementById('toast');e.textContent=m;e.style.display='block';setTimeout(()=>e.style.display='none',3500)}
function showTab(t){document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));const sec=document.getElementById('sec-'+t);if(sec)sec.classList.add('active');event.target.classList.add('active');if(t==='playlists')loadPlaylists();if(t==='favorites')loadFavs();if(t==='subs')loadSubs();if(t==='settings')loadSettingsForm();if(t==='logs')loadLogs()}
async function loadDashboard(){
const[status,history,playlists]=await Promise.all([api('GET','/api/status'),api('GET','/api/history'),api('GET','/api/playlists')]);
const q=status.queue||{};
document.getElementById('cards').innerHTML=\`
<div class="card"><h3>📥 Downloads</h3><div class="value">\${history.summary?.total||0}</div><div class="sub">✅ \${history.summary?.ok||0} · ❌ \${history.summary?.err||0}</div></div>
<div class="card"><h3>📦 Fila</h3><div class="value">\${q.pending||0}</div><div class="sub">ok: \${q.completed||0} · falhos: \${q.failed||0}</div></div>
<div class="card"><h3>📁 Playlists</h3><div class="value">\${playlists.playlists?.length||0}</div><div class="sub">\${playlists.playlists?.reduce((s,p)=>s+p.files,0)||0} arquivos</div></div>
<div class="card"><h3>🛡️ Anti-ban</h3><div class="value">\${status.antiban||'?'}</div><div class="sub">\${status.circuitOpen?'⛔ ABERTO':'✅ OK'}</div></div>
<div class="card"><h3>🌐 Plataformas</h3><div class="value">\${status.platforms?.length||6}</div><div class="sub">\${(status.platforms||[]).join(', ')}</div></div>
\`;
if(status.circuitOpen)document.getElementById('cb-badge').style.display='inline';
else document.getElementById('cb-badge').style.display='none';
const tbody=document.querySelector('#histTable tbody');
const entries=(history.history||[]).slice(0,20);
tbody.innerHTML=entries.map(e=>\`<tr><td><span class="dot \${e.status==='ok'?'dot-ok':'dot-err'}"></span></td><td>\${(e.ts||'').slice(0,16).replace('T',' ')}</td><td>\${e.playlist||'-'}</td><td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${e.target||''}</td></tr>\`).join('');
loadPlatforms()
}
function loadPlatforms(){
const plats=[{emoji:'▶️',name:'YouTube'},{emoji:'🟢',name:'Spotify'},{emoji:'🎵',name:'Deezer'},{emoji:'🟠',name:'SoundCloud'},{emoji:'🍎',name:'Apple Music'},{emoji:'🌊',name:'Tidal'}];
document.getElementById('plat-grid').innerHTML=plats.map(p=>\`<div class="plat-card"><div class="emoji">\${p.emoji}</div><div class="name">\${p.name}</div></div>\`).join('');
}
async function doSearch(){
const input=document.getElementById('dlInput').value.trim();if(!input)return;
document.getElementById('loading').style.display='block';document.getElementById('results').innerHTML='';
const res=await api('POST','/api/search',{query:input});
document.getElementById('loading').style.display='none';
if(!res.results?.length){document.getElementById('results').innerHTML='<p style="color:#8b949e">Nenhum resultado.</p>';return}
document.getElementById('results').innerHTML=res.results.map(r=>\`<div class="result-item" onclick="dlResult('\${r.videoId}')"><span>🎵</span><span>\${r.title}</span></div>\`).join('');
}
async function dlResult(vid){
document.getElementById('loading').style.display='block';
await api('POST','/api/download',{target:'https://www.youtube.com/watch?v='+vid});
document.getElementById('loading').style.display='none';document.getElementById('results').innerHTML='';
toast('✅ Baixado!');loadDashboard()
}
async function doUniversalDl(){
const input=document.getElementById('dlInput').value.trim();if(!input)return;
document.getElementById('loading').style.display='block';
const res=await api('POST','/api/universal',{url:input});
document.getElementById('loading').style.display='none';
toast(res.ok?'✅ Baixado! '+(res.downloaded||1)+' faixa(s)':'❌ '+(res.error||'Erro'));
loadDashboard()
}
async function doSync(){toast('🔄 Sync...');const r=await api('POST','/api/sync');toast('✅ '+( r.enqueued||0)+' novos');loadDashboard()}
async function doQueueRun(){toast('📦 Rodando...');await api('POST','/api/queue/run');toast('✅ Fila ok');loadDashboard()}
async function doQueueRetry(){const r=await api('POST','/api/queue/retry');toast('♻️ '+( r.moved||0)+' re-enfileirados');loadDashboard()}
async function doResetAB(){await api('POST','/api/antiban/reset');toast('🛡️ Resetado');loadDashboard()}
async function loadPlaylists(){
const r=await api('GET','/api/playlists');
const el=document.getElementById('playlists-list');
if(!r.playlists?.length){el.innerHTML='<p style="color:#8b949e">Nenhuma playlist.</p>';return}
el.innerHTML='<table class="table"><thead><tr><th>Pasta</th><th>Arquivos</th></tr></thead><tbody>'+r.playlists.map(p=>\`<tr><td>📁 \${p.name}</td><td>\${p.files}</td></tr>\`).join('')+'</tbody></table>';
}
async function loadFavs(){
const r=await api('GET','/api/favorites');const el=document.getElementById('fav-list');
if(!r.favorites?.length){el.innerHTML='<p style="color:#8b949e">Nenhum favorito.</p>';return}
el.innerHTML=r.favorites.map(f=>\`<div class="fav-item"><span>⭐ \${f.title}\${f.artist?' — '+f.artist:''}</span><button class="btn btn-danger" style="padding:.3rem .6rem;font-size:.75rem" onclick="delFav('\${f.id}')">✕</button></div>\`).join('');
}
async function addFav(){const t=document.getElementById('favInput').value.trim();if(!t)return;await api('POST','/api/favorites/add',{title:t});document.getElementById('favInput').value='';toast('⭐ Adicionado');loadFavs()}
async function delFav(id){await api('POST','/api/favorites/remove',{id});toast('Removido');loadFavs()}
async function loadSubs(){
const r=await api('GET','/api/subs');const el=document.getElementById('subs-list');
if(!r.subscriptions?.length){el.innerHTML='<p style="color:#8b949e">Nenhuma inscricao.</p>';return}
el.innerHTML='<table class="table"><thead><tr><th>Nome</th><th>Pasta</th><th>URL</th></tr></thead><tbody>'+r.subscriptions.map(s=>\`<tr><td>\${s.name||'-'}</td><td>\${s.playlist}</td><td style="max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${s.url}</td></tr>\`).join('')+'</tbody></table>';
}
async function addSub(){const u=document.getElementById('subUrl').value.trim();if(!u)return;const n=document.getElementById('subName').value.trim();await api('POST','/api/subs/add',{url:u,name:n});toast('🔔 Inscrito');loadSubs();document.getElementById('subUrl').value='';document.getElementById('subName').value=''}
async function loadSettingsForm(){
const r=await api('GET','/api/settings');const el=document.getElementById('settings-form');
el.innerHTML=\`
<div style="display:grid;gap:.75rem">
<label>Formato: <select id="sf-format"><option \${r.format==='mp3'?'selected':''}>mp3</option><option \${r.format==='opus'?'selected':''}>opus</option><option \${r.format==='m4a'?'selected':''}>m4a</option><option \${r.format==='flac'?'selected':''}>flac</option></select></label>
<label>Qualidade (K): <select id="sf-quality"><option \${r.quality==128?'selected':''}>128</option><option \${r.quality==192?'selected':''}>192</option><option \${r.quality==256?'selected':''}>256</option><option \${r.quality==320?'selected':''}>320</option></select></label>
<label>Anti-ban: <select id="sf-antiban"><option \${r.antibanMode==='desligado'?'selected':''}>desligado</option><option \${r.antibanMode==='seguro'?'selected':''}>seguro</option><option \${r.antibanMode==='agressivo'?'selected':''}>agressivo</option><option \${r.antibanMode==='furtivo'?'selected':''}>furtivo</option></select></label>
<label>Concorrencia: <input class="input" type="number" id="sf-conc" value="\${r.concurrency}" min="1" max="8" style="width:80px" /></label>
<label>Playlist padrao: <input class="input" id="sf-defpl" value="\${r.defaultPlaylist||'Geral'}" style="width:200px" /></label>
<label><input type="checkbox" id="sf-thumb" \${r.embedThumbnail?'checked':''} /> Embed thumbnail</label>
<label><input type="checkbox" id="sf-meta" \${r.embedMetadata?'checked':''} /> Embed metadata</label>
<label><input type="checkbox" id="sf-dedup" \${r.dedup?'checked':''} /> Dedup (archive)</label>
<label><input type="checkbox" id="sf-lyrics" \${r.writeLyrics?'checked':''} /> Auto-lyrics</label>
<button class="btn" onclick="saveSettings()">💾 Salvar</button>
</div>\`;
}
async function saveSettings(){
const body={format:document.getElementById('sf-format').value,quality:Number(document.getElementById('sf-quality').value),antibanMode:document.getElementById('sf-antiban').value,concurrency:Number(document.getElementById('sf-conc').value),defaultPlaylist:document.getElementById('sf-defpl').value,embedThumbnail:document.getElementById('sf-thumb').checked,embedMetadata:document.getElementById('sf-meta').checked,dedup:document.getElementById('sf-dedup').checked,writeLyrics:document.getElementById('sf-lyrics').checked};
await api('POST','/api/settings',body);toast('💾 Configuracoes salvas!')
}
async function loadLogs(){const r=await api('GET','/api/logs');const el=document.getElementById('log-box');el.innerHTML=(r.logs||[]).map(l=>{let cls='log-line-info';if(l.includes(' ERROR '))cls='log-line-err';else if(l.includes(' WARN '))cls='log-line-warn';return '<div class="'+cls+'">'+l+'</div>'}).join('')}
document.getElementById('dlInput')?.addEventListener('keydown',e=>{if(e.key==='Enter')doUniversalDl()});
loadDashboard();setInterval(loadDashboard,30000);
<\/script>`;
}



// ============================================================
//  SERVIDOR HTTP
// ============================================================

export function startWebServer({ port = 3777 } = {}) {
    const server = createServer(async (req, res) => {
        if (req.method === 'OPTIONS') {
            res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS' });
            res.end();
            return;
        }

        const url = new URL(req.url, `http://localhost:${port}`);
        const pathname = url.pathname;

        // Dashboard HTML
        if (pathname === '/' || pathname === '/dashboard') {
            const page = getDashboardHTML(WEB_TOKEN) + getDashboardScript(WEB_TOKEN);
            return html(res, page);
        }

        // API
        if (pathname.startsWith('/api/')) {
            if (!auth(req)) return json(res, { error: 'Unauthorized' }, 401);
            const routeKey = `${req.method} ${pathname}`;
            const handler = routes[routeKey];
            if (!handler) return json(res, { error: 'Not found' }, 404);
            try {
                const body = (req.method === 'POST' || req.method === 'DELETE') ? await parseBody(req) : {};
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
        console.log(`\n🌐 Horizon Web Dashboard v2.5 rodando em:`);
        console.log(`   Local:   http://localhost:${port}`);
        console.log(`   Rede:    http://0.0.0.0:${port}`);
        if (WEB_TOKEN) console.log(`   Token:   configurado (${WEB_TOKEN.slice(0, 4)}...)`);
        else console.log(`   Token:   ABERTO (defina WEB_TOKEN no .env)`);
        console.log(`\n   Ctrl+C pra parar.\n`);
        log.info(`web: server online port=${port} v2.5`);
    });

    return server;
}
