# Changelog

## [2.5.1] — 2026-05-16 — "Universal Fixed"

Release de correções importantes em cima da v2.5. Foco em destravar o bot,
o player do terminal e expandir os caminhos de download universal no CLI.

### 🐛 Bugfixes críticos

- **Bot Telegram voltou a baixar.** A v2.5 referenciava uma função
  `performSingleDownload` que tinha sido removida na refatoração; o bot
  derrubava o handler de texto silenciosamente em links normais do YouTube.
  Agora o router único usa `handleUniversalDownload` para tudo.
- **`/admin_reset` quebrava o bot.** Usava `require('./src/antiban.js')`
  num módulo ESM, lançando `ReferenceError: require is not defined`.
  Migrado para `import` estático.
- **Cache do bot apontava pra pasta errada.** `userCacheDir` usava o
  ID bruto enquanto o downloader sanitizava o nome — em IDs negativos
  (canais Telegram) os arquivos caíam num diretório e o bot lia outro,
  resultando em "arquivo não encontrado" sem motivo aparente. Agora
  o caminho é calculado uma única vez via `sanitizeName`.
- **Player só respondia uma vez aos atalhos.** O listener de `stdin` era
  registrado dentro de `playFile` e ficava órfão entre faixas — depois
  da primeira música, `q`, Enter e `s` paravam de funcionar. Reescrevemos
  o controle de teclado para viver no escopo do `play()` em **raw mode**:
  os atalhos respondem instantaneamente, sem precisar Enter, e funcionam
  em todas as faixas seguidas.

### 🎵 Player

- Atalhos novos em raw mode: `n` / Espaço / Enter = próxima, `q` / Esc = parar,
  `s` = re-shuffle, **`p` = pausa/retoma** (via SIGSTOP/SIGCONT em mpv/ffplay).
- Cleanup do `setRawMode` é garantido com `try/finally` mesmo em erros.
- `Ctrl+C` é tratado como "parar" sem deixar o terminal em modo raw.

### 🆕 CLI: download universal e favoritos como comandos

- **`horizon download <url>`** (alias `horizon dl`) — baixa de **qualquer**
  plataforma suportada (YouTube, Spotify, Deezer, SoundCloud, Apple Music,
  Tidal). Detecta o tipo automaticamente. Aceita `--preview` e `--playlist`.
- **`horizon platforms`** — lista visual das plataformas suportadas.
- **`horizon fav`** (alias `horizon favorites`) — todo o ciclo no CLI:
  - `horizon fav list [-q termo] [-t tag]`
  - `horizon fav add "Title" -a "Artist" -u <url>`
  - `horizon fav remove <id>`
  - `horizon fav download [-p Pasta]` — baixa **todos** os favoritos em lote.
  - `horizon fav clear`

### 🟢 Spotify / Deezer / Apple / Tidal / SoundCloud no menu interativo

A entrada do menu virou um submenu mais explícito:

- 🎵 Baixar uma faixa (link)
- 📦 **Baixar uma playlist / álbum (link)** ← era o pedido
- 👁️ Preview (mostra faixas sem baixar)
- 🌐 Ver plataformas suportadas

A pasta de destino é perguntada antes de iniciar (com sugestão `MinhaPlaylist`
para playlists/álbums), e o resolver universal escolhe o caminho correto
para cada plataforma.

### ⭐ Favoritos no menu interativo

Nova entrada **"⭐ Favoritos"** no menu principal com:
- Listar / Adicionar / Remover / Limpar
- **Baixar TODOS os favoritos** em lote (vai pra pasta `Favoritos` por padrão).

### 🔧 Internals

- `bot.js` agora importa `resetCircuit` estaticamente e centraliza
  o cálculo da pasta efêmera (`sanitizeName(userId)` + `getAppDir()`).
- Mensagens de erro do bot ficaram mais informativas: arquivo grande,
  resolver sem resultado, link inválido, etc.
- `index.js` v2.5.1 com 3 novos comandos commander e 1 nova entrada
  no menu interativo.
- Sintaxe verificada com `node --check` em todos os arquivos modificados.

---

## [2.5.0] — 2026-05-16 — "Universal"

### 🌐 Resolver Universal de Plataformas

O Horizon agora baixa de **6 plataformas** com um unico comando. Cole o link
e ele resolve sozinho — sem converter, sem site externo, sem complicacao.

| Plataforma | Tipos suportados |
|---|---|
| ▶️ **YouTube** | Track, Playlist, Mix |
| 🟢 **Spotify** | Track, Album, Playlist |
| 🎵 **Deezer** | Track, Album, Playlist |
| 🟠 **SoundCloud** | Track, Playlist, Likes |
| 🍎 **Apple Music** | Track, Album, Playlist |
| 🌊 **Tidal** | Track, Album, Playlist |

- **Deteccao automatica**: cola o link em qualquer lugar (CLI, bot, dashboard)
  e o Horizon identifica a plataforma e resolve.
- **`horizon download <url>`** — funciona com qualquer plataforma acima.
- **Preview**: `horizon download <url> --preview` mostra faixas sem baixar.
- **SoundCloud nativo**: usa yt-dlp diretamente (melhor qualidade).
- **Tidal/Apple**: extrai metadados via scraping e busca no YouTube.
- Novo modulo: `src/playlistResolver.js` — resolver universal unificado.

---

### ⭐ Sistema de Favoritos

Salve suas musicas preferidas e baixe tudo de uma vez.

- **`horizon fav add "Nome da Musica"`** — adiciona aos favoritos.
- **`horizon fav list`** — lista todos os favoritos.
- **`horizon fav remove <id>`** — remove um favorito.
- **`horizon fav download`** — baixa TODOS os favoritos de uma vez.
- **`horizon fav search <termo>`** — busca nos favoritos.
- **Tags**: organize com tags (`horizon fav tag <id> <tag>`).
- Funciona no bot Telegram (`/fav`) e no Web Dashboard.
- Persistido em `~/.horizon/favorites.json`.

---

### 🤖 Bot Telegram v2.5 — Universal

O bot agora aceita links de QUALQUER plataforma suportada. Cole e baixa.

#### Novos comandos do bot

| Comando | O que faz |
|---|---|
| `/spotify <url>` | Baixa do Spotify (track/album/playlist) |
| `/deezer <url>` | Baixa do Deezer |
| `/soundcloud <url>` | Baixa do SoundCloud |
| `/playlist <url>` | Baixa playlist de qualquer plataforma |
| `/fav` | Gerenciar favoritos (list/add/remove/download) |
| `/quality <128\|192\|256\|320>` | Mudar qualidade on-the-fly |
| `/platforms` | Mostra plataformas suportadas |

#### Melhorias no bot

- **Deteccao automatica**: manda um link do Spotify/Deezer/SoundCloud e
  o bot reconhece e baixa sem precisar de comando especifico.
- **Quota aumentada**: padrao agora e 50/dia (era 30).
- **Concorrencia**: padrao 3 simultaneos (era 2).
- **Playlist max**: 150 faixas por playlist (era 100).
- **Favoritos integrados**: salve e baixe direto do chat.
- **Mensagem de boas-vindas** atualizada com todas as plataformas.
- **Admin /admin_reset**: reseta circuit breaker pelo chat.

---

### 🌐 Web Dashboard v2.5 — Turbinado

Dashboard totalmente reescrito com interface por abas e muito mais funcoes.

#### Novas abas

| Aba | Funcao |
|---|---|
| 📊 Visao Geral | Cards, historico, acoes rapidas |
| 📥 Download | Download universal com cards de plataforma |
| 📁 Playlists | Navegar pastas e ver contagem de arquivos |
| ⭐ Favoritos | Adicionar, listar e remover favoritos |
| 🔔 Inscricoes | Gerenciar inscricoes (add/remove) |
| ⚙️ Config | Editar TODAS as configuracoes pelo browser |
| 📝 Logs | Ver logs em tempo real |

#### Novos endpoints da API (22 total)

| Endpoint | Funcao |
|---|---|
| `GET /api/favorites` | Listar favoritos |
| `GET /api/settings` | Ver configuracoes atuais |
| `GET /api/logs` | Ultimas 50 linhas de log |
| `GET /api/platforms` | Plataformas suportadas |
| `POST /api/universal` | Download de qualquer plataforma |
| `POST /api/favorites/add` | Adicionar favorito |
| `POST /api/favorites/remove` | Remover favorito |
| `POST /api/settings` | Salvar configuracoes |
| `POST /api/subs/add` | Adicionar inscricao |
| `DELETE /api/subs` | Remover inscricao |

#### Melhorias visuais

- **Cards de plataforma** mostrando todas as fontes suportadas.
- **Editor de configuracoes** completo (formato, qualidade, anti-ban, etc).
- **Gerenciador de favoritos** com adicionar/remover inline.
- **Viewer de logs** com coloracao por nivel (info/warn/error).
- **Navegador de playlists** com contagem de arquivos.

---

### 🆕 Novos comandos CLI

| Comando | O que faz |
|---|---|
| `horizon download <url>` | Download universal (qualquer plataforma) |
| `horizon download <url> --preview` | Preview sem baixar |
| `horizon fav add <titulo>` | Adicionar favorito |
| `horizon fav list` | Listar favoritos |
| `horizon fav remove <id>` | Remover favorito |
| `horizon fav download` | Baixar todos os favoritos |
| `horizon fav search <termo>` | Buscar nos favoritos |
| `horizon platforms` | Listar plataformas suportadas |

---

### 🔧 Internals

- `src/playlistResolver.js` (novo) — resolver universal para 6 plataformas.
- `src/favorites.js` (novo) — sistema de favoritos com tags e export.
- `bot.js` — reescrito v2.5 com suporte universal + 7 novos comandos.
- `src/webServer.js` — reescrito com 22 endpoints + dashboard por abas.
- `package.json` v2.5.0 + keywords expandidas.
- Bot agora importa `playlistResolver` e `favorites`.
- Dashboard com 7 abas navegaveis (single-page, zero deps).
- API suporta `POST /api/universal` para download de qualquer fonte.
- Configuracoes editaveis remotamente via `POST /api/settings`.
- Zero dependencias novas (continua usando apenas `http` nativo!).

---

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
