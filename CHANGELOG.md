# Changelog

## [2.4.0] — 2026-05-15 — "Comando Central"

### 🌐 Web Dashboard

Dashboard completo acessível pelo navegador em `http://servidor:3777`.

- **Interface dark-mode** profissional, responsiva, single-file (sem build/webpack).
- **REST API** com 14 endpoints para controlar tudo remotamente.
- **Autenticação** via Bearer token (`WEB_TOKEN` no `.env`).
- **Busca + download** direto do browser (YouTube, Spotify, Deezer).
- **Cards em tempo real**: downloads, fila, playlists, estado anti-ban.
- **Histórico visual** com tabela e status (ok/erro).
- **Ações rápidas**: sync, rodar fila, retry, resetar anti-ban.
- **Auto-refresh** a cada 30 segundos.
- Zero dependências externas (usa `http` nativo do Node — sem Express!).

Rodar: `horizon web` ou `npm run web`.

---

### 🟢 Spotify / Deezer / Apple Music — Resolver nativo

Agora você cola o link e o Horizon resolve sozinho — sem precisar de
TuneMyMusic ou qualquer site externo.

- **Não precisa de API key** do Spotify — usa oEmbed público.
- **Track**: extrai "Artista - Título" → busca no YouTube → baixa.
- **Playlist / Album**: extrai lista de faixas do embed page do Spotify
  → baixa tudo em lote com concorrência.
- **Suporta** Spotify, Deezer e Apple Music (link → nome → YouTube).
- **Preview**: `horizon spotify <url> --preview` mostra faixas sem baixar.
- Também funciona no bot do Telegram e no Web Dashboard.

---

### 🎵 Player de terminal

Toca músicas direto no SSH / Termux sem sair do terminal.

- **Usa mpv** (preferido), ffplay ou sox — o que estiver instalado.
- **Controles**: Enter = próxima, q = parar, s = re-shuffle.
- **Modos**: `--shuffle` (aleatório), `--loop` (repetir).
- **Now Playing** bonito com artista/título parseados do nome.
- **`--list`** mostra pastas tocáveis.
- Funciona em SSH (se o servidor tiver saída de áudio) ou localmente.

---

### 🗂️ Smart Organizer

Reorganiza sua biblioteca automaticamente por artista.

- **Modo `artist`**: agrupa arquivos em subpastas `Artista/arquivo.mp3`.
- **Modo `flat`**: desfaz a organização (volta tudo pra raiz).
- **Preview por padrão** — mostra o plano sem mexer em nada.
- **`--execute`** pra mover de verdade (pede confirmação).
- Remove pastas vazias que ficarem.

---

### 🎚️ Perfis de configuração

Salva conjuntos nomeados de configs e alterna entre eles.

- **`horizon profiles save meu-perfil`** — salva tudo (formato, anti-ban, pasta...).
- **`horizon profiles load meu-perfil`** — carrega e aplica.
- **`horizon profiles list`** / **`delete`**.
- Perfis ficam em `~/.horizon/profiles/<nome>.json`.
- Exemplos de uso: "servidor" (anti-ban agressivo), "qualidade" (flac 320k).

---

### 🔔 Push Notifications (Telegram)

Admin recebe ping no Telegram quando eventos importantes acontecem.

- Circuit breaker abriu (ban detectado).
- Lote grande concluído.
- Sync encontrou faixas novas.
- Primeiro usuário novo no bot.
- Erros críticos.
- **`horizon notify "sua mensagem"`** — envia push manual pros admins.
- Requer `BOT_TOKEN` + `ADMIN_USER_IDS` no `.env`.

---

### 🆕 Novos comandos

| Comando | O que faz |
|---|---|
| `horizon spotify <url>` | Resolve e baixa de Spotify/Deezer/Apple |
| `horizon spotify <url> --preview` | Mostra faixas sem baixar |
| `horizon play [pasta]` | Toca no terminal |
| `horizon play --list` | Lista pastas tocáveis |
| `horizon play --shuffle --loop` | Shuffle + repetir |
| `horizon organize [pasta]` | Mostra plano de reorganização |
| `horizon organize [pasta] --execute` | Executa a reorganização |
| `horizon profiles list` | Lista perfis salvos |
| `horizon profiles save <nome>` | Salva config atual como perfil |
| `horizon profiles load <nome>` | Carrega perfil |
| `horizon profiles delete <nome>` | Deleta perfil |
| `horizon web [--port 3777]` | Inicia o Web Dashboard |
| `horizon notify <msg>` | Push notification pros admins |

### 🔧 Internals

- `src/spotify.js` (novo) — resolver Spotify via oEmbed + embed scraping.
- `src/player.js` (novo) — wrapper mpv/ffplay/sox com controles.
- `src/organizer.js` (novo) — reorganizador por artista com preview.
- `src/profiles.js` (novo) — perfis nomeados de configuração.
- `src/pushNotify.js` (novo) — push notifications via Telegram Bot API.
- `src/webServer.js` (novo) — servidor HTTP nativo + dashboard HTML embutido.
- `index.js` — 6 novos subcomandos + 5 entradas no menu interativo.
- `package.json` v2.4.0 + script `web`.
- `.env.example` — variáveis `WEB_TOKEN` e `WEB_PORT`.
- Zero dependências novas (web server usa `http` nativo!).

---

## [2.3.0] — 2026-05-12 — "Servidor"

### 🤖 Bot reescrito como servidor multiusuário

Pensado pra rodar 24/7 num VPS, Termux ou mesmo num PC ligado. **Baixa,
envia pelo chat e DELETA automaticamente** — não acumula nada no servidor.

#### Novidades do bot

- **Estado persistente por usuário** em `~/.horizon/bot-users.json`
  (perfil, primeiro contato, último acesso, downloads totais e do dia).
- **Quota diária por usuário** (`DAILY_QUOTA`) com reset automático.
  Admins ignoram a quota.
- **Lista de admins** via env (`ADMIN_USER_IDS`) — separada da whitelist.
- **Concorrência global** (`MAX_CONCURRENT_DOWNLOADS`) para o servidor não
  surtar com múltiplos usuários ao mesmo tempo (também ajuda anti-ban).
- **Pasta efêmera por usuário** em `~/.horizon/bot-cache/<userId>/`:
  baixa lá, envia pro chat, **apaga**. Bot não vira lixeira do servidor.
- **Confirmação para playlists** com botão (anti-spam de usuário malandro).
  Limite máximo configurável (`PLAYLIST_MAX_TRACKS`).
- **Auto-update do yt-dlp na inicialização** (`AUTO_UPDATE_YTDLP=1`).
- **Respeito ao circuit breaker do anti-ban** — se o YouTube ataca, o bot
  responde "pausado" sem quebrar.
- **Limpeza no shutdown**: SIGINT/SIGTERM apaga TODO o `bot-cache/`.

#### Comandos públicos do bot

| Comando | O que faz |
|---|---|
| `/start` | Boas-vindas |
| `/help` | Ajuda detalhada |
| `/search <termo>` | Busca 5 opções com botões |
| `/me` | Seu perfil + quota usada hoje |
| `/stats` | Estatísticas globais (downloads, usuários, anti-ban) |
| `/cancel` | Cancela ação atual |

#### Comandos de admin

| Comando | O que faz |
|---|---|
| `/admin_users` | Lista os últimos 20 usuários (com flag bloqueado/admin) |
| `/admin_block <id>` | Bloqueia um usuário (ele recebe aviso e não baixa mais) |
| `/admin_unblock <id>` | Libera o usuário |
| `/admin_broadcast <msg>` | Envia mensagem para TODOS os usuários ativos |

### 🆕 Novidades no CLI

- **`horizon bot`** — inicia o bot do Telegram pelo próprio CLI
  (não precisa mais de `npm run bot`).
- **`horizon schedule [-i 6]`** — sync das inscrições em loop (foreground).
  Roda no Termux com `Termux:Boot`, em VPS com `systemd`/`tmux`.
- **`horizon cleanup`** — limpa o cache efêmero do bot manualmente.

### 🔧 Internals

- `src/botState.js` (novo) — perfil, quota, admins, bloqueios.
- `src/scheduler.js` (novo) — loop de sync.
- `src/downloader.js` — `ensurePlaylistDir` aceita `baseOverride`,
  e `overrides.musicBaseDir` é respeitado em `downloadOne` /
  `downloadPlaylist`. Permite ao bot usar pasta efêmera sem mexer
  na biblioteca do dono.
- `bot.js` totalmente reescrito (~470 linhas) com fila global,
  `acquireSlot/releaseSlot`, e middlewares limpos.
- `.env.example` documenta todas as 7 variáveis.
- `package.json` ganha `npm run schedule` e `npm run cleanup`.

---

## [2.2.0] — 2026-05-12 — "Anti-Ban"

### 🛡️ Sistema anti-bloqueio do YouTube

8 camadas de proteção contra HTTP 429/403/"prove que não é um bot":

- **Perfis**: `desligado`, `seguro` (padrão), `agressivo`, `furtivo`.
- **User-Agent rotativo** entre 5 reais.
- **Cookies do navegador** (chrome/firefox/edge/brave/safari/chromium).
- **Geo-bypass**, **player clients múltiplos** (android/web/ios).
- **Retries reforçados** (5 tentativas + 10 fragmentos).
- **Circuit breaker**: detecta ban e pausa app por 10min.

### ⚙️ Configurações em PT, por seção

Menu com 5 seções: Biblioteca, Áudio, Desempenho, Anti-bloqueio, Interface.
Pasta base agora editável.

### Outras

- Normalização de volume EBU R128.
- Scanner com `--rebuild` reconstrói dedup do disco.
- Backup/Restore JSON com merge inteligente.
- Health check (`horizon health`) com download de teste real.

---

## [2.1.0] — 2026-05-12

- **Inscrições / auto-sync** (`subs add/list/remove`, `sync`).
- **Fila persistente** em JSON com retries.
- **Dedup global** via `--download-archive`.
- **Letras .lrc** automáticas via lyrics.ovh.
- **Exportação .m3u + README.md** por pasta.
- **Dashboard ASCII** (`stats`).
- **Logger rotativo** em `~/.horizon/logs/`.
- **Self-updater** (`update --ytdlp/--self/--all`).
- **Auto-complete** bash/zsh/fish.

---

## [2.0.0]

- Arquitetura modular em `src/`.
- CLI híbrida (menu + commander).
- Barra de progresso, retry com backoff.
- Bot do Telegram com whitelist, rate-limit e fila por usuário.
- Shell escaping em todos os argumentos.
