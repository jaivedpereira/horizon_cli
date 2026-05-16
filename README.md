# 🌌 Horizon CLI

> Seu ecossistema musical direto do terminal.
> Busca, baixa, sincroniza, organiza e **toca** músicas — com CLI
> interativa, subcomandos, bot do Telegram, **download universal** de
> 6 plataformas, dashboard web, inscrições, fila persistente, letras,
> **proteção anti-bloqueio do YouTube** e muito mais.

Compatível com **Android (Termux)**, **Linux**, **macOS** e **Windows**.

**Versão atual:** `2.5.1` ("Universal Fixed")

---

## 📑 Sumário

- [Destaques](#-destaques)
- [Plataformas suportadas](#-plataformas-suportadas)
- [Novidades v2.5.1](#-novidades-da-v251-universal-fixed)
- [Novidades v2.5](#-novidades-da-v25-universal)
- [Novidades v2.4](#-novidades-da-v24-comando-central)
- [Novidades v2.3](#-novidades-da-v23-servidor)
- [Novidades v2.2](#-novidades-da-v22-anti-ban)
- [Instalação](#-instalação)
- [Sistema anti-bloqueio](#%EF%B8%8F-sistema-anti-bloqueio-do-youtube)
- [📚 TODOS os comandos](#-todos-os-comandos-do-horizon)
- [Configurações](#%EF%B8%8F-configurações-em-português-por-seção)
- [Onde os arquivos ficam](#-onde-os-arquivos-são-salvos)
- [Bot do Telegram](#-bot-do-telegram)
- [Player de terminal](#-player-de-terminal)
- [Estrutura do projeto](#%EF%B8%8F-estrutura-do-projeto)
- [Troubleshooting](#-troubleshooting)

---

## ✨ Destaques

- 🌐 **Download universal** — cola link de YouTube, **Spotify**, Deezer,
  SoundCloud, Apple Music ou Tidal e o Horizon resolve sozinho
- ⭐ **Sistema de favoritos** — salva, organiza por tags e baixa em lote
- 🎵 Busca + download do YouTube em mp3/m4a/opus/flac
- 🌐 **Web Dashboard** — controla tudo pelo navegador (REST API + UI)
- 🎵 **Player de terminal** — toca suas músicas no SSH/Termux com mpv/ffplay,
  agora com pausa/retoma e atalhos em raw mode
- 🗂️ **Organizador inteligente** — reorganiza biblioteca por artista
- 🎚️ **Perfis de configuração** — salva presets nomeados e alterna rápido
- 🔔 **Push Notifications** no Telegram em eventos importantes
- 🛡️ **Proteção anti-bloqueio** com 4 perfis + circuit breaker automático
- 🔔 **Inscrições** (playlists/canais) com auto-sync incremental
- 📦 **Fila persistente** resistente a crashes, com retries
- 🧠 **Dedup global** — nunca baixa o mesmo vídeo duas vezes
- 🔊 **Normalização de volume** (EBU R128, estilo Spotify)
- 🎤 **Letras (.lrc)** automáticas via lyrics.ovh
- 📤 **Exportação** de `.m3u` + `README.md` por pasta
- 📊 **Dashboard ASCII** com gráfico dos últimos dias
- 🔎 **Scanner** que reconstrói o dedup a partir do disco
- 💾 **Backup / Restore** completo em JSON
- 🩺 **Health check** com download de teste
- 📝 **Logger** com rotação em `~/.horizon/logs`
- 🔄 **Self-update** de `yt-dlp` e do próprio Horizon
- 🤖 **Bot do Telegram** multiusuário com quota, admins, **resolver universal** e auto-cleanup
- 🖥️ **Auto-complete** para bash, zsh e fish
- 🇧🇷 **Configurações 100% em português**, organizadas por seção

---

## 🌐 Plataformas suportadas

O resolver universal (v2.5+) baixa direto de:

| Plataforma     | Tipos suportados                  | Como funciona                          |
| -------------- | --------------------------------- | -------------------------------------- |
| ▶️ **YouTube** | track / playlist / mix            | nativo via `yt-dlp`                    |
| 🟢 **Spotify** | track / album / playlist          | oEmbed público + scraping → busca YT  |
| 🎵 **Deezer**  | track / album / playlist          | metadados + busca YT                   |
| 🟠 **SoundCloud** | track / playlist / likes       | nativo via `yt-dlp`                    |
| 🍎 **Apple Music** | track / album / playlist     | scraping de meta tags + busca YT       |
| 🌊 **Tidal**   | track / album / playlist          | scraping de meta tags + busca YT       |

Use `horizon download <url>` ou cole no menu interativo, no bot ou no
dashboard. Para o Spotify, **não precisa de API key**.

---

## ✨ Novidades da v2.5.1 ("Universal Fixed")

Release de correções importantes em cima da v2.5.

### 🐛 Bugfixes

- **Bot voltou a baixar.** A v2.5 referenciava uma função removida
  (`performSingleDownload`) e dava erro silencioso em qualquer link
  do YouTube. Corrigido — agora todo download passa pelo resolver
  universal.
- **`/admin_reset` quebrava o bot** com `require is not defined` em ESM.
  Trocado por import estático.
- **Cache do bot lia pasta errada** em IDs negativos (canais).
  Caminho agora é calculado com `sanitizeName` em ambos os lados.
- **Player só respondia uma vez aos atalhos.** O listener de stdin
  ficava órfão entre faixas. Reescrito com **raw mode** centralizado
  no escopo do `play()`.

### 🎵 Player com controles em raw mode

Os atalhos respondem **instantaneamente**, sem precisar Enter:

| Tecla              | Ação                  |
| ------------------ | --------------------- |
| `n` / Espaço / ⏎  | próxima faixa         |
| `p`                | pausa/retoma          |
| `s`                | re-shuffle            |
| `q` / Esc / Ctrl+C | parar                 |

### 🆕 CLI: download universal e favoritos

```bash
# baixa de qualquer plataforma — detecta sozinho
horizon download "https://open.spotify.com/playlist/..."
horizon dl       "https://soundcloud.com/.../sets/..."
horizon dl       "https://music.apple.com/album/..." --preview

# lista visual das plataformas suportadas
horizon platforms

# favoritos como comandos
horizon fav list
horizon fav add "Bohemian Rhapsody" -a "Queen"
horizon fav download                    # baixa todos em lote
horizon fav remove <id>
horizon fav clear
```

### 🟢 Spotify no menu interativo

A entrada **"🟢 Spotify / Deezer / Apple / Tidal / SoundCloud"** virou um
submenu com 4 opções:

- 🎵 Baixar uma faixa
- 📦 **Baixar uma playlist / álbum** ← novo destaque
- 👁️ Preview (sem baixar)
- 🌐 Ver plataformas suportadas

E há um item dedicado **"⭐ Favoritos"** com listar/adicionar/remover/baixar.

---

## ✨ Novidades da v2.5 ("Universal")

### 🌐 Resolver universal

Suporte nativo a **6 plataformas** num único módulo (`src/playlistResolver.js`).
O bot do Telegram, o CLI e o dashboard usam o mesmo resolver.

### ⭐ Sistema de favoritos

Persistido em `~/.horizon/favorites.json`. Cada favorito tem id, título,
artista (opcional), URL (opcional), tags e source. Pode ser exportado
como lista de termos para download em lote.

### 🤖 Bot do Telegram universal

Cole link de qualquer plataforma → bot detecta e baixa. Novos comandos:

- `/spotify <url>`, `/deezer <url>`, `/soundcloud <url>` — caminhos dedicados
- `/playlist <url>` — confirma e baixa playlist inteira de qualquer fonte
- `/fav` — gerenciamento de favoritos pelo chat
- `/quality 320` — muda qualidade on-the-fly
- `/platforms` — lista plataformas

### 🌐 Web Dashboard 7 abas

Reescrita do dashboard com abas: 📊 Visão Geral, 📥 Download, 📁 Playlists,
⭐ Favoritos, 🔔 Inscrições, ⚙️ Config, 📝 Logs.
**22 endpoints REST** e configurações editáveis pelo browser.

---

## ✨ Novidades da v2.4 ("Comando Central")

### 🌐 Web Dashboard
Acesse `http://seuservidor:3777` no browser e controla **tudo** remotamente.
Dashboard dark-mode profissional com cards em tempo real, busca, download,
Spotify, sync, fila e anti-ban. Autenticação via `WEB_TOKEN`. Zero dependências extras.

```bash
horizon web                # porta padrão 3777
horizon web --port 8080    # porta custom
```

### 🟢 Spotify / Deezer / Apple Music — SEM site externo
Cola o link e o Horizon resolve sozinho → busca no YouTube → baixa.
Sem API key (usa oEmbed público do Spotify).

```bash
horizon spotify "https://open.spotify.com/track/xxx"
horizon spotify "https://open.spotify.com/playlist/xxx" --playlist MinhaLista
horizon spotify "https://open.spotify.com/album/xxx" --preview   # só lista faixas
```

### 🎵 Player de terminal
Toca direto no terminal via mpv/ffplay/sox. Controles: Enter=próxima, q=parar, s=shuffle.

```bash
horizon play Favs --shuffle --loop
horizon play --list                    # lista pastas com áudio
```

### 🗂️ Smart Organizer
Reorganiza biblioteca por artista (parse do nome do arquivo).

```bash
horizon organize Geral                 # preview do plano
horizon organize Geral --execute       # executa de verdade
horizon organize Geral --mode flat     # desfaz (volta tudo pra raiz)
```

### 🎚️ Perfis de Configuração
Salva presets nomeados e alterna entre cenários (servidor, qualidade, rápido).

```bash
horizon profiles save servidor --desc "anti-ban agressivo"
horizon profiles load qualidade
horizon profiles list
horizon profiles delete rapido
```

### 🔔 Push Notifications (Telegram)
Admin recebe ping quando: circuit breaker abre, lote termina, sync acha novidades, novo usuário.

```bash
horizon notify "Deploy feito, tudo atualizado"
```

### ⚡ Fix: Downloads que falhavam
- Resolvido "Operation not permitted" no Android (thumbnail .webp).
- Downloads ~3-4x mais rápidos (fragmentos paralelos + sleep otimizado).
- Nomes de arquivo sanitizados pra filesystem do Android.

---

## ✨ Novidades da v2.3 ("Servidor")

- **Bot reescrito como servidor multiusuário** — pensado pra rodar 24/7.
- **Baixa, envia, e DELETA** — `~/.horizon/bot-cache/<userId>/` é efêmera.
- **Quota diária** por usuário (`DAILY_QUOTA`) com reset automático.
- **Concorrência global** (`MAX_CONCURRENT_DOWNLOADS`) para anti-ban.
- **Lista de admins** (`ADMIN_USER_IDS`) com comandos `/admin_users`,
  `/admin_block`, `/admin_unblock`, `/admin_broadcast`.
- **Confirmação de playlists** com botão (limite `PLAYLIST_MAX_TRACKS`).
- **Auto-update do yt-dlp** na inicialização (`AUTO_UPDATE_YTDLP=1`).
- **`/me`** — usuário vê seu perfil e quota.
- **`horizon bot`**, **`horizon schedule`**, **`horizon cleanup`** novos no CLI.

## ✨ Novidades da v2.2 ("Anti-Ban")

- **Sistema anti-bloqueio em 8 camadas** — perfis (`desligado`, `seguro`,
  `agressivo`, `furtivo`), User-Agent rotativo, cookies do navegador,
  geo-bypass, player clients múltiplos, retries robustos.
- **Circuit breaker** — detecta bans e pausa o app inteiro por 10min
  pra preservar seu IP. Resetável com `horizon antiban reset`.
- **Configurações em PT e por seção** — biblioteca, áudio, desempenho,
  anti-bloqueio, interface.
- **Pasta base editável** (antes era fixa).
- **Normalização de volume EBU R128** (estilo Spotify).
- **Scanner com `--rebuild`** que reconstrói o dedup a partir do disco.
- **Backup / Restore JSON** versionado, com merge inteligente.
- **`horizon health`** — download de teste pra ver se está tudo OK.

---

## 📦 Instalação

### Pré-requisitos

- **Node.js** ≥ 18
- **yt-dlp**
  - Linux/macOS: `pip install -U yt-dlp` (ou `pipx install yt-dlp`)
  - Termux: `pkg install python && pip install -U yt-dlp`
  - Windows: `pip install -U yt-dlp` ou baixe o `.exe` do GitHub
- **ffmpeg**
  - Linux: `apt install ffmpeg`
  - macOS: `brew install ffmpeg`
  - Termux: `pkg install ffmpeg`
  - Windows: baixe de [ffmpeg.org](https://ffmpeg.org/) e adicione ao PATH

### Instalar o Horizon

```bash
git clone https://github.com/jaivedpereira/horizon_cli.git
cd horizon_cli
npm install
npm run setup   # chmod +x + npm link → comando `horizon` global
```

Verifique se está tudo certo:

```bash
horizon doctor   # checa yt-dlp e ffmpeg
horizon health   # baixa um vídeo de teste
```

---

## 🛡️ Sistema anti-bloqueio do YouTube

O YouTube bloqueia downloads que parecem "robóticos" com erros tipo
`HTTP 429`, `HTTP 403` ou *"Sign in to confirm you're not a bot"*. O
Horizon defende em **8 camadas**:

| Camada | O que faz | Como ativar |
|---|---|---|
| 1. Player clients múltiplos | yt-dlp tenta `android`, `web` e `ios` em sequência | já ativo no perfil "seguro" |
| 2. Sleep entre requests | 2-8s de espera, deixa tráfego "humano" | perfil escolhido |
| 3. Rate-limit de banda | 1-2 MB/s nos modos pesados | perfis `agressivo`/`furtivo` |
| 4. User-Agent rotativo | troca entre 5 UAs reais a cada download | `rotateUserAgent: true` (padrão) |
| 5. Cookies do navegador | usa sua sessão logada (mais forte) | `useCookies: true` em config |
| 6. Geo-bypass | tenta contornar bloqueio regional | `geoBypass: true` (padrão) |
| 7. Retries robustos | 5 tentativas + 10 retries por fragmento | sempre ativo |
| 8. Circuit breaker | pausa app por 10min se detectar ban | automático, resetável |

### Perfis prontos

| Perfil | Velocidade | Risco de ban | Quando usar |
|---|---|---|---|
| `desligado` | máxima | alto | só em redes confiáveis e poucas músicas |
| `seguro` ⭐ | rápida | baixo | dia a dia (padrão) |
| `agressivo` | média | muito baixo | lotes grandes (50+ músicas) |
| `furtivo` | lenta | quase nulo | quando já tomou um ban |

Mude em `horizon config` → "Proteção anti-bloqueio".

### Quando ativar cookies

Se mesmo no `agressivo` você toma ban:

1. `horizon config` → Proteção → `useCookies: sim` → escolher seu navegador.
2. Esteja **logado no YouTube** nesse navegador.
3. Pronto — yt-dlp passa a usar sua sessão real.

---

# 📚 TODOS os comandos do Horizon

Todos os comandos têm a forma `horizon <comando>`. Sem nenhum argumento, abre o **menu interativo**.

## 🎵 Downloads

### `horizon` (sem argumentos)
**Abre o menu interativo.** Modo "tudo na tela", para quem não quer decorar comandos.

```bash
horizon
```

---

### `horizon search <termo...>`
**Busca uma música no YouTube e mostra os 5 melhores resultados** para você escolher qual baixar.

| Flag | Descrição |
|---|---|
| `-p, --playlist <nome>` | Pasta de destino (default = `defaultPlaylist`) |

**Exemplos:**
```bash
horizon search "daft punk one more time"
horizon search "imagine dragons believer" --playlist Rock
horizon search "lana del rey video games" -p Indie
```

---

### `horizon url <link>`
**Baixa direto a partir de uma URL do YouTube** (sem busca).

| Flag | Descrição |
|---|---|
| `-p, --playlist <nome>` | Pasta de destino |

**Exemplos:**
```bash
horizon url "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
horizon url "https://youtu.be/abc123" --playlist Favoritas
```

---

### `horizon batch <lista>`
**Baixa várias músicas de uma vez** (lista separada por vírgula). Usa concorrência configurada e barra de progresso.

| Flag | Descrição |
|---|---|
| `-p, --playlist <nome>` | Pasta de destino |
| `-c, --concurrency <n>` | Downloads simultâneos (1 a 6) |

**Exemplos:**
```bash
horizon batch "music 1, music 2, music 3"
horizon batch "the weeknd blinding lights, dua lipa levitating, beyonce cuff it" \
  --playlist Pop --concurrency 3
```

---

### `horizon playlist <url>`
**Baixa uma playlist inteira do YouTube** de uma vez.

| Flag | Descrição |
|---|---|
| `-p, --playlist <nome>` | Pasta de destino |

**Exemplos:**
```bash
horizon playlist "https://www.youtube.com/playlist?list=PLxxx"
horizon playlist "https://www.youtube.com/playlist?list=PLxxx" --playlist RockClassics
```

> 💡 Se a playlist é do Spotify/Deezer/Apple, primeiro converta em
> [TuneMyMusic.com](https://www.tunemymusic.com) e cole o link do YouTube aqui.

---

## 🔔 Inscrições e auto-sync

### `horizon subs add <url>`
**Cadastra uma playlist ou canal do YouTube** para sincronização incremental. Toda vez que rodar `horizon sync`, baixa só os vídeos **novos**.

| Flag | Descrição |
|---|---|
| `-p, --playlist <nome>` | Pasta de destino |
| `-n, --name <nome>` | Nome amigável |

```bash
horizon subs add "https://www.youtube.com/playlist?list=PLxxx" -p RockMix -n "Meu rock"
horizon subs add "https://www.youtube.com/@CanalDoArtista"
```

---

### `horizon subs list`
**Lista todas as inscrições** com IDs, pasta e data do último sync.

```bash
horizon subs list
```

---

### `horizon subs remove <id>`
**Remove uma inscrição** pelo ID (visto em `subs list`) ou pela URL.

```bash
horizon subs remove abc123
horizon subs remove "https://www.youtube.com/playlist?list=PLxxx"
```

---

### `horizon sync`
**Sincroniza todas as inscrições.** Compara com o dedup, enfileira só os vídeos novos e roda a fila imediatamente.

| Flag | Descrição |
|---|---|
| `--no-run` | Apenas enfileira, não baixa agora |

```bash
horizon sync             # sincroniza E baixa
horizon sync --no-run    # só enfileira (use `horizon queue run` depois)
```

---

## 📦 Fila persistente

A fila é salva em `~/.horizon/queue.json` e sobrevive a crashes. Itens que falham 3 vezes vão pra `failed`.

### `horizon queue list`
**Mostra os próximos 10 itens** da fila e o resumo (pendentes / concluídos / falhos).

```bash
horizon queue list
```

---

### `horizon queue run`
**Processa todos os pendentes** com a concorrência configurada e barra de progresso.

```bash
horizon queue run
```

---

### `horizon queue retry`
**Move tudo de `failed` de volta para `pending`** (com tentativas zeradas).

```bash
horizon queue retry
```

---

### `horizon queue clear [escopo]`
**Limpa a fila.** Escopos: `all` (default), `pending`, `completed`, `failed`.

```bash
horizon queue clear           # limpa tudo
horizon queue clear failed    # só os falhos
horizon queue clear completed # só o histórico de concluídos
```

---

## 🛡️ Anti-bloqueio do YouTube

### `horizon antiban status`
**Mostra o estado da proteção:**
- Perfil ativo (`desligado`/`seguro`/`agressivo`/`furtivo`)
- User-Agent rotativo on/off
- Cookies on/off
- Geo-bypass on/off
- Falhas seguidas
- Circuit breaker (FECHADO ou ABERTO + tempo restante)

```bash
horizon antiban status
```

---

### `horizon antiban test`
**Faz um download real de teste** com a proteção atual, num arquivo temporário (não polui sua biblioteca).

```bash
horizon antiban test
```

---

### `horizon antiban reset`
**Força fechar o circuit breaker.** Use se ele abriu por engano e você quer voltar a baixar agora.

```bash
horizon antiban reset
```

---

## 🩺 Diagnóstico

### `horizon doctor`
**Verifica se `yt-dlp` e `ffmpeg` estão instalados** e mostra as versões. Se faltar algo, dá a dica de instalação por sistema.

```bash
horizon doctor
```

Sai com **exit code 0** se tudo OK, **1** se faltar dependência (útil pra scripts).

---

### `horizon health`
**Roda um download real de teste** (vídeo curto da NASA, domínio público) num diretório temporário. Se baixar OK, tua conexão + yt-dlp + cookies estão saudáveis.

```bash
horizon health
```

---

## 📊 Estatísticas e logs

### `horizon stats`
**Dashboard ASCII** com:
- Total de downloads (ok / erro)
- Fila atual
- Inscrições
- Pastas e arquivos
- Gráfico de barras dos últimos 14 dias

```bash
horizon stats
```

---

### `horizon history`
**Mostra as últimas 20 entradas** + top 5 pastas mais usadas.

| Flag | Descrição |
|---|---|
| `--clear` | Limpa o histórico |

```bash
horizon history
horizon history --clear
```

---

### `horizon logs`
**Lê o log em `~/.horizon/logs/horizon.log`** com cores (ERROR vermelho, WARN amarelo).

| Flag | Descrição |
|---|---|
| `-n, --lines <n>` | Quantas linhas mostrar (default 50) |
| `--path` | Mostra apenas o caminho do arquivo |

```bash
horizon logs              # 50 últimas linhas
horizon logs -n 200       # 200 últimas
horizon logs --path       # /home/user/.horizon/logs/horizon.log
```

---

## ⚙️ Configurações e manutenção

### `horizon config`
**Abre o menu de configurações em português, dividido em 5 seções:**

- 📁 **Biblioteca** — pasta base editável + pasta padrão
- 🎵 **Áudio** — formato, qualidade, capa, metadados, normalização
- ⚡ **Desempenho** — paralelismo, dedup, letras, m3u
- 🛡️ **Proteção anti-bloqueio** — perfil + cookies + geo-bypass
- 🖥️ **Interface** — dicas

Plus: ver JSON atual e restaurar padrões de fábrica.

```bash
horizon config
```

---

### `horizon scan`
**Escaneia toda a sua biblioteca** procurando IDs de vídeo embutidos nos metadados/nomes dos arquivos. Útil pra ver quantos arquivos têm dedup detectável.

| Flag | Descrição |
|---|---|
| `--rebuild` | Reconstrói `~/.horizon/downloaded.txt` com os IDs encontrados |

```bash
horizon scan              # apenas escaneia e relata
horizon scan --rebuild    # também reconstrói o dedup
```

> 💡 Use `--rebuild` ao migrar de máquina ou se apagou o `downloaded.txt`.

---

### `horizon backup`
**Cria um backup JSON** de tudo: configurações, histórico, inscrições, fila e dedup. Não inclui MP3s.

| Flag | Descrição |
|---|---|
| `--out <file>` | Caminho de saída (default: `~/.horizon/backup-<timestamp>.json`) |

```bash
horizon backup
horizon backup --out ~/Dropbox/horizon-backup.json
```

---

### `horizon restore <file>`
**Restaura um backup.** Por padrão, faz **merge inteligente** (junta com o que você já tem, sem duplicar).

| Flag | Descrição |
|---|---|
| `--no-merge` | Sobrescreve em vez de mesclar |

```bash
horizon restore backup.json
horizon restore backup.json --no-merge   # cuidado: apaga o atual
```

---

### `horizon update`
**Atualiza yt-dlp e/ou o próprio Horizon.**

| Flag | Descrição |
|---|---|
| `--ytdlp` | Tenta `yt-dlp -U`, depois `pipx`, `pip3`, `pip` em sequência |
| `--self` | `git pull --ff-only` + `npm install` na pasta do Horizon |
| `--all` | Faz os dois |

```bash
horizon update --ytdlp
horizon update --self
horizon update --all
```

---

## 📁 Operações em pastas

### `horizon export <pasta>`
**Gera dois arquivos** dentro da pasta da playlist:
- `<pasta>.m3u` — playlist compatível com VLC, Android Music etc.
- `README.md` — tracklist em markdown.

```bash
horizon export Favs
horizon export "Rock Classics"
```

---

### `horizon lyrics <pasta>`
**Baixa letras (.lrc)** para todas as músicas de uma pasta, via API gratuita lyrics.ovh. Pula as que já têm `.lrc`.

```bash
horizon lyrics Favs
```

---

## 🤖 Servidor (v2.3)

### `horizon bot`
**Inicia o bot do Telegram em modo servidor.** Lê o `.env`, registra usuários,
respeita whitelist/admins/quota e roda até receber SIGINT/SIGTERM. Cada
download é feito em pasta efêmera por usuário e apagado depois de enviado.

```bash
horizon bot
# equivalente a: node bot.js  ou  npm run bot
```

> Ver seção [Bot do Telegram](#-bot-do-telegram) para detalhes do `.env`.

---

### `horizon schedule`
**Sync automático em loop.** Roda em primeiro plano, ideal pra colocar em
`tmux`/`systemd`/`Termux:Boot`. Cada tick faz `horizon sync` e depois
processa a fila.

| Flag | Descrição |
|---|---|
| `-i, --interval <h>` | Intervalo em horas (default 6) |
| `--no-immediate` | Espera o primeiro intervalo ao invés de rodar agora |

```bash
horizon schedule              # a cada 6h, começa agora
horizon schedule -i 12        # a cada 12h
horizon schedule -i 1 --no-immediate
```

---

### `horizon cleanup`
**Limpa o cache efêmero do bot** (`~/.horizon/bot-cache/`). Útil em manutenção
ou se o bot for desligado de forma forçada e tiver deixado lixo.

```bash
horizon cleanup
```

---

## 🖥️ Auto-complete do shell

### `horizon completion <shell>`
**Imprime um script de tab-completion** para você instalar.

Shells suportados: `bash`, `zsh`, `fish`.

**Bash:**
```bash
horizon completion bash > ~/.horizon-completion.bash
echo 'source ~/.horizon-completion.bash' >> ~/.bashrc
```

**Zsh:**
```bash
mkdir -p ~/.zsh
horizon completion zsh > ~/.zsh/_horizon
# adicione no ~/.zshrc:
#   fpath=(~/.zsh $fpath)
#   autoload -Uz compinit && compinit
```

**Fish:**
```bash
horizon completion fish > ~/.config/fish/completions/horizon.fish
```

---

## 📋 Resumo rápido — tabela de todos os comandos

| Comando | O que faz |
|---|---|
| `horizon` | Menu interativo |
| **`horizon download <url>`** ⭐ | **Baixa de qualquer plataforma (universal)** |
| **`horizon dl <url>`** | Atalho para `download` |
| **`horizon platforms`** | Lista plataformas suportadas |
| `horizon search <termo>` | Busca + escolhe + baixa |
| `horizon url <link>` | Baixa direto da URL (YouTube) |
| `horizon batch <lista>` | Baixa várias com concorrência |
| `horizon playlist <url>` | Baixa playlist YT inteira |
| `horizon spotify <url>` | Resolve e baixa do Spotify/Deezer/Apple |
| `horizon spotify <url> --preview` | Mostra faixas sem baixar |
| **`horizon fav list`** ⭐ | Lista favoritos |
| **`horizon fav add "Title"`** | Adiciona aos favoritos |
| **`horizon fav download`** | Baixa todos os favoritos em lote |
| **`horizon fav remove <id>`** | Remove favorito |
| **`horizon fav clear`** | Apaga todos os favoritos |
| `horizon subs add <url>` | Cadastra inscrição |
| `horizon subs list` | Lista inscrições |
| `horizon subs remove <id>` | Remove inscrição |
| `horizon sync` | Baixa novidades das inscrições |
| `horizon queue list` | Mostra fila |
| `horizon queue run` | Processa fila |
| `horizon queue retry` | Re-enfileira falhos |
| `horizon queue clear [scope]` | Limpa fila |
| `horizon antiban status` | Estado da proteção |
| `horizon antiban test` | Testa download real |
| `horizon antiban reset` | Reseta circuit breaker |
| `horizon doctor` | Checa yt-dlp / ffmpeg |
| `horizon health` | Download de teste |
| `horizon stats` | Dashboard com gráfico |
| `horizon history [--clear]` | Histórico |
| `horizon logs [-n N] [--path]` | Lê o log |
| `horizon config` | Configurações em PT |
| `horizon scan [--rebuild]` | Escaneia biblioteca |
| `horizon backup [--out F]` | Backup JSON |
| `horizon restore <file>` | Restaura backup |
| `horizon update --ytdlp\|--self\|--all` | Atualiza |
| `horizon export <pasta>` | Gera .m3u + README.md |
| `horizon lyrics <pasta>` | Baixa .lrc |
| `horizon completion <shell>` | Script de auto-complete |
| `horizon bot` | Inicia o bot do Telegram (modo servidor) |
| `horizon schedule [-i 6]` | Sync automático em loop (foreground) |
| `horizon cleanup` | Limpa cache efêmero do bot |
| `horizon play [pasta]` | Toca no terminal (mpv/ffplay) |
| `horizon play --shuffle --loop` | Shuffle + repetir |
| `horizon play --list` | Lista pastas tocáveis |
| `horizon organize [pasta]` | Preview de reorganização por artista |
| `horizon organize [pasta] --execute` | Executa a reorganização |
| `horizon profiles list` | Lista perfis salvos |
| `horizon profiles save <nome>` | Salva config atual como perfil |
| `horizon profiles load <nome>` | Carrega perfil |
| `horizon profiles delete <nome>` | Deleta perfil |
| `horizon web [--port 3777]` | Inicia o Web Dashboard |
| `horizon notify <msg>` | Push notification pros admins |

---

## 🎵 Player de terminal

Toca a sua biblioteca diretamente no terminal — útil em SSH, Termux ou
quando você só quer ouvir sem abrir player gráfico.

### Players suportados (detectados automaticamente, em ordem)

1. **mpv** (recomendado) — `apt install mpv` / `brew install mpv` / `pkg install mpv`
2. **ffplay** — já vem instalado se você tem ffmpeg
3. **sox (`play`)** — fallback simples

### Atalhos (raw mode — respondem instantaneamente)

| Tecla              | Ação                              |
| ------------------ | --------------------------------- |
| `n` / Espaço / ⏎  | próxima faixa                     |
| `p`                | pausa / retoma                    |
| `s`                | re-shuffle (re-embaralha a fila) |
| `q` / Esc / Ctrl+C | parar e voltar ao terminal        |

### Exemplos

```bash
horizon play                        # menu pra escolher pasta
horizon play Favs                   # toca a pasta "Favs"
horizon play Favs --shuffle         # ordem aleatória
horizon play Rock --shuffle --loop  # shuffle + repete ao chegar no fim
horizon play --list                 # lista pastas com áudio + contagem
```

> Em SSH, certifique-se de que o servidor tem saída de áudio (ALSA/Pulse).
> No Termux, peça `pkg install pulseaudio` antes de `pkg install mpv`.

---

## ⚙️ Configurações (em português, por seção)

`horizon config` abre um menu com seções:

### 📁 Biblioteca

| Campo             | Descrição                                       |
| ----------------- | ----------------------------------------------- |
| `musicBaseDir`    | Pasta base. Aceita `~` e absoluto. **Editável!** |
| `defaultPlaylist` | Pasta usada quando você não especificar uma     |

### 🎵 Áudio

| Campo              | Padrão | Descrição                            |
| ------------------ | ------ | ------------------------------------ |
| `format`           | `mp3`  | `mp3`, `m4a`, `opus` ou `flac`       |
| `quality`          | `192`  | kbps: `128`, `192`, `256`, `320`     |
| `embedThumbnail`   | true   | Capa no arquivo                      |
| `embedMetadata`    | true   | Título, artista, álbum               |
| `normalizeVolume`  | false  | EBU R128 (estilo streaming)          |

### ⚡ Desempenho

| Campo             | Padrão | Descrição                                       |
| ----------------- | ------ | ----------------------------------------------- |
| `concurrency`     | 2      | Downloads simultâneos (1-6)                     |
| `dedup`           | true   | Usa `--download-archive` (nunca rebaixa)        |
| `writeLyrics`     | false  | `.lrc` automático após cada música              |
| `autoExportM3U`   | true   | `.m3u` + `README.md` por pasta a cada download  |

### 🛡️ Proteção anti-bloqueio

| Campo             | Padrão  | Descrição                                |
| ----------------- | ------- | ---------------------------------------- |
| `antibanMode`     | `seguro` | desligado / seguro / agressivo / furtivo |
| `rotateUserAgent` | true    | Troca o UA a cada download               |
| `geoBypass`       | true    | Contorna bloqueio regional               |
| `useCookies`      | false   | Usa cookies do navegador (mais forte)    |
| `cookiesBrowser`  | `chrome` | chrome/firefox/edge/brave/safari/chromium |

---

## 📁 Onde os arquivos são salvos?

Configurável via `musicBaseDir`. Padrões:

- **Termux / Android:** `/sdcard/Music/Horizon/<playlist>/`
- **Linux / macOS / Windows:** `~/Music/Horizon/<playlist>/`

Cada playlist é uma subpasta. Tudo é rescaneado pela galeria do Android
após download (via `termux-media-scan`).

### 📂 Arquivos persistentes em `~/.horizon/`

| Arquivo              | Descrição                                              |
| -------------------- | ------------------------------------------------------ |
| `settings.json`      | Preferências do usuário                                |
| `history.json`       | Últimos 500 downloads (sucesso/erro)                   |
| `queue.json`         | Fila persistente (pending / completed / failed)        |
| `subscriptions.json` | Inscrições cadastradas                                 |
| `downloaded.txt`     | Arquivo do `--download-archive` (dedup global)         |
| `circuit.json`       | Estado do circuit breaker anti-ban                     |
| `logs/horizon.log`   | Log rotativo (2MB por arquivo, até 5 rotacionados)     |

---

## 🤖 Bot do Telegram

```bash
cp .env.example .env   # configure BOT_TOKEN
horizon bot            # ou: npm run bot
```

### Modo servidor (multiusuário 24/7)

A partir da v2.3 o bot foi feito pra rodar em VPS / Termux / PC ligado.
**Baixa a música, manda pro usuário e apaga** — não acumula nada no servidor.

#### Variáveis (`.env`)

| Variável | Padrão | Descrição |
|---|---|---|
| `BOT_TOKEN` | — | Token do @BotFather (obrigatório) |
| `ALLOWED_USER_IDS` | (vazio = aberto) | IDs permitidos, vírgula |
| `ADMIN_USER_IDS` | — | IDs de admins (separado da whitelist) |
| `DAILY_QUOTA` | `30` | Downloads por dia por usuário (admins ignoram) |
| `MAX_CONCURRENT_DOWNLOADS` | `2` | Downloads simultâneos no servidor |
| `PLAYLIST_MAX_TRACKS` | `100` | Máx. de faixas por playlist |
| `RATE_LIMIT_MS` | `1500` | Intervalo mín. entre mensagens |
| `AUTO_UPDATE_YTDLP` | `0` | `1` = atualiza yt-dlp ao iniciar (recomendado) |
| `WEB_TOKEN` | (vazio = aberto) | Token de auth do Web Dashboard |
| `WEB_PORT` | `3777` | Porta do Web Dashboard |

#### Comandos públicos (qualquer usuário)

- `/start` — boas-vindas
- `/help` — ajuda detalhada
- `/search <termo>` — busca com botões
- `/me` — seu perfil + quota usada hoje
- `/stats` — estatísticas globais
- `/cancel` — cancela o passo atual

#### Comandos de admin (apenas IDs em `ADMIN_USER_IDS`)

- `/admin_users` — lista os 20 usuários mais recentes
- `/admin_block <id>` — bloqueia usuário
- `/admin_unblock <id>` — libera usuário
- `/admin_broadcast <msg>` — envia mensagem para TODOS

#### Como rodar 24/7

**Termux (Android):**
```bash
# Instale o Termux:Boot da F-Droid pra rodar no boot do celular.
# Crie ~/.termux/boot/horizon-bot.sh:
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock
cd ~/horizon_cli && horizon bot
```

**VPS Linux (systemd):**
```ini
# /etc/systemd/system/horizon-bot.service
[Unit]
Description=Horizon Bot
After=network.target

[Service]
Type=simple
User=horizon
WorkingDirectory=/home/horizon/horizon_cli
ExecStart=/usr/bin/node bot.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now horizon-bot
sudo journalctl -u horizon-bot -f   # ver logs
```

**VPS rapidão (tmux):**
```bash
tmux new -s horizon
horizon bot
# Ctrl+B, D pra desanexar. Volta com: tmux attach -t horizon
```

#### Sync automático em segundo plano

Pra atualizar inscrições periodicamente sem rodar o bot:

```bash
horizon schedule -i 6   # roda sync a cada 6 horas
```

---

## 💡 Spotify / Deezer / Apple Music / Tidal / SoundCloud

A partir da v2.5, o Horizon tem um **resolver universal** que aceita
links das 6 plataformas — sem site externo, sem API key.

### 🚀 Comando universal (recomendado)

```bash
# Detecta automaticamente a plataforma e baixa
horizon download "https://open.spotify.com/playlist/..."
horizon dl       "https://soundcloud.com/.../sets/..."
horizon dl       "https://music.apple.com/album/..." --preview
horizon dl       "https://tidal.com/browse/album/..." -p MeuAlbum

# Lista plataformas suportadas
horizon platforms
```

### 🟢 Comando legado (Spotify/Deezer/Apple — ainda funciona)

```bash
horizon spotify "https://open.spotify.com/track/..."
horizon spotify "https://open.spotify.com/playlist/..." --playlist MinhaLista
horizon spotify "https://open.spotify.com/album/..." --preview
```

### Como funciona

| Plataforma | Estratégia |
|---|---|
| YouTube / SoundCloud | Download nativo via `yt-dlp` (alta qualidade) |
| Spotify | oEmbed público + scraping do embed → busca no YouTube |
| Deezer | oEmbed + scraping → busca no YouTube |
| Apple Music | Scraping de meta tags → busca no YouTube |
| Tidal | Scraping de meta tags → busca no YouTube |

> **No menu interativo** (`horizon`), entre em **"🟢 Spotify / Deezer /
> Apple / Tidal / SoundCloud"** e escolha entre faixa, **playlist/álbum**,
> preview, ou ver plataformas suportadas.

> **Bot do Telegram:** cole qualquer link das plataformas acima e o bot
> resolve automaticamente. Comandos dedicados: `/spotify`, `/deezer`,
> `/soundcloud`, `/playlist`.

---

## 🗂️ Estrutura do projeto

```
horizon_cli/
├── index.js               # CLI (menu + commander, 34 comandos)
├── bot.js                 # Bot do Telegram (modo servidor)
├── package.json
├── .env.example
├── CHANGELOG.md
└── src/
    ├── config.js          # paths, settings persistentes, archive file
    ├── utils.js           # helpers (escape, retry, detectors, sleep)
    ├── logger.js          # logger com rotação
    ├── deps.js            # checker de yt-dlp / ffmpeg
    ├── notifier.js        # notificações Termux (anti-spam)
    ├── history.js         # histórico JSON + top playlists
    ├── downloader.js      # yt-dlp + concorrência + dedup + anti-ban
    ├── antiban.js         # perfis, flags, circuit breaker
    ├── scanner.js         # rebuild do dedup a partir do disco
    ├── backup.js          # backup/restore JSON
    ├── health.js          # download de teste
    ├── botState.js        # estado persistente do bot (usuários/quota)
    ├── queue.js           # fila persistente em JSON
    ├── queueRunner.js     # executor com barra de progresso
    ├── subscriptions.js   # inscrições (playlists/canais)
    ├── sync.js            # sync incremental
    ├── scheduler.js       # loop de sync periódico
    ├── lyrics.js          # .lrc via lyrics.ovh
    ├── export.js          # .m3u + README.md
    ├── stats.js           # dashboard ASCII
    ├── updater.js         # self-update
    ├── completions.js     # bash/zsh/fish
    ├── ui.js              # splash + settingsMenu (PT, seções)
    ├── spotify.js         # resolver Spotify/Deezer/Apple (v2.4)
    ├── playlistResolver.js # ⭐ resolver universal multi-plataforma (v2.5)
    ├── favorites.js       # ⭐ sistema de favoritos com tags (v2.5)
    ├── player.js          # terminal music player com raw mode (v2.4 / fixed v2.5.1)
    ├── organizer.js       # smart library organizer (v2.4)
    ├── profiles.js        # config profiles (v2.4)
    ├── pushNotify.js      # push notifications Telegram (v2.4)
    └── webServer.js       # web dashboard + REST API (v2.4 / 22 endpoints v2.5)
```

---

## 🛟 Troubleshooting

| Problema | Solução |
|---|---|
| **"yt-dlp não encontrado"** | `horizon doctor` mostra como instalar |
| **Erros 429/403/"prove que não é um bot"** | Suba o perfil em `horizon config` para `agressivo`, ou ative cookies (`furtivo`) |
| **App pausado por 10 minutos** | O circuit breaker abriu — `horizon antiban status` mostra, `horizon antiban reset` força liberar |
| **yt-dlp travando ou erros estranhos** | `horizon update --ytdlp` (provavelmente está desatualizado) |
| **Migrei de máquina e quero recuperar o dedup** | `horizon scan --rebuild` |
| **Quero levar minhas configs pra outro PC** | `horizon backup` → copia o JSON → `horizon restore` no novo |
| **Bot não recebe arquivos** | Cheque `ALLOWED_USER_IDS` no `.env` |
| **Bot dá erro em qualquer link do YouTube** | Atualize para v2.5.1+ (`horizon update --self`) — bug conhecido da v2.5.0 |
| **Player só funciona uma vez (atalhos morrem)** | Atualize para v2.5.1+ — listener de stdin foi reescrito |
| **Player: "Nenhum player encontrado"** | Instale `mpv` (recomendado): `apt install mpv` / `pkg install mpv` / `brew install mpv` |
| **Spotify playlist não carrega faixas** | Algumas playlists privadas/restritas não expõem oEmbed; use `horizon dl --preview` pra confirmar antes |
| **Quero limpar tudo e começar do zero** | `horizon config` → "Restaurar padrões de fábrica" |

---

## 📜 Licença

MIT.
