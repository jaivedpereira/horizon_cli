# Changelog

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
