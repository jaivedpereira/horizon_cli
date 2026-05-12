# 🌌 Horizon CLI

> Seu ecossistema musical direto do terminal.
> Busca, baixa, sincroniza e organiza músicas — com CLI interativa,
> subcomandos, bot do Telegram, inscrições, fila persistente, letras,
> **proteção anti-bloqueio do YouTube** e muito mais.

Compatível com **Android (Termux)**, **Linux**, **macOS** e **Windows**.

---

## ✨ Destaques

- 🎵 **Busca + download** do YouTube em mp3/m4a/opus/flac
- 🛡️ **Proteção anti-bloqueio** com 4 perfis + circuit breaker automático
- 🔔 **Inscrições** (playlists/canais) com auto-sync incremental
- 📦 **Fila persistente** resistente a crashes, com retries
- 🧠 **Dedup global** — nunca baixa o mesmo vídeo duas vezes
- 🔊 **Normalização de volume** (EBU R128)
- 🎤 **Letras (.lrc)** automáticas via lyrics.ovh
- 📤 **Exportação** de `.m3u` + `README.md` por pasta
- 📊 **Dashboard** com gráfico ASCII dos últimos dias
- 🔎 **Scanner** que reconstrói o dedup a partir dos arquivos existentes
- 💾 **Backup / Restore** completo das configs e estado
- 🩺 **Health check** com download de teste
- 📝 **Logger** com rotação em `~/.horizon/logs`
- 🔄 **Self-update** de `yt-dlp` e do próprio Horizon
- 🤖 **Bot do Telegram** com whitelist, rate-limit e fila por usuário
- 🖥️  **Auto-complete** para bash, zsh e fish
- 🇧🇷 **Configurações 100% em português**, organizadas por seção

---

## ✨ Novidades da v2.2 ("Anti-Ban")

- **Sistema anti-bloqueio em camadas** — perfis (`desligado`, `seguro`,
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
- **yt-dlp** — `pip install -U yt-dlp` ou `pkg install python && pip install -U yt-dlp` (Termux)
- **ffmpeg** — `apt install ffmpeg` / `brew install ffmpeg` / `pkg install ffmpeg` (Termux)

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
`HTTP 429`, `HTTP 403` ou "Sign in to confirm you're not a bot". O Horizon
defende em **8 camadas**:

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

```bash
horizon config         # vai em "Proteção anti-bloqueio"
```

| Perfil | Velocidade | Risco de ban | Quando usar |
|---|---|---|---|
| `desligado` | máxima | alto | só em redes confiáveis e poucas músicas |
| `seguro` ⭐ | rápida | baixo | dia a dia (padrão) |
| `agressivo` | média | muito baixo | lotes grandes (50+ músicas) |
| `furtivo` | lenta | quase nulo | quando já tomou um ban |

### Comandos do anti-ban

```bash
horizon antiban status   # ver estado, falhas seguidas, circuit breaker
horizon antiban test     # download real de teste com a proteção atual
horizon antiban reset    # libera downloads se o circuito estiver aberto
```

### Quando ativar cookies

Se mesmo no `agressivo` você está tomando ban:

1. `horizon config` → Proteção → `useCookies: sim` → escolher seu navegador.
2. Esteja **logado no YouTube** nesse navegador.
3. Pronto — yt-dlp passa a usar sua sessão real.

---

## 🚀 Uso — CLI

### Modo interativo

```bash
horizon
```

Menu com tudo: buscar, baixar, fila, inscrições, dashboard, configurações,
anti-ban, scan, backup, lyrics, export, logs, update.

### Subcomandos principais

```bash
# Downloads
horizon search "daft punk one more time" --playlist Favs
horizon url "https://youtu.be/XXXX" --playlist Geral
horizon batch "musica1, musica2, musica3" --playlist Pop --concurrency 3
horizon playlist "https://www.youtube.com/playlist?list=PLxxx" --playlist Rock

# Histórico, dashboard e configurações
horizon history          # últimas 20 + top playlists
horizon history --clear  # limpa
horizon stats            # gráfico ASCII de 14 dias
horizon config           # menu em PT por seções
horizon doctor           # checa yt-dlp/ffmpeg
horizon health           # download de teste

# Logs
horizon logs -n 80
horizon logs --path

# Atualizações
horizon update --ytdlp
horizon update --self
horizon update --all

# Inscrições e auto-sync
horizon subs add <url> -p RockMix -n "Meu rock"
horizon subs list
horizon subs remove <id>
horizon sync           # enfileira só os novos e roda
horizon sync --no-run  # só enfileira

# Fila persistente
horizon queue list
horizon queue run
horizon queue retry          # re-enfileira os que falharam
horizon queue clear failed   # all | pending | completed | failed

# Pasta de música
horizon export Favs    # gera Favs.m3u + README.md
horizon lyrics Favs    # baixa .lrc

# Anti-bloqueio
horizon antiban status
horizon antiban reset
horizon antiban test

# Manutenção avançada
horizon scan                       # mostra arquivos sem dedup
horizon scan --rebuild             # reconstrói dedup
horizon backup --out backup.json
horizon restore backup.json
horizon restore backup.json --no-merge

# Auto-complete
horizon completion bash > ~/.horizon-completion.bash
echo 'source ~/.horizon-completion.bash' >> ~/.bashrc
```

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
npm run bot
```

Comandos: `/start`, `/help`, `/search`, `/stats`, `/cancel`. Envie nome,
link ou playlist do YouTube e o bot baixa pra você.

Variáveis (`.env`):

| Variável            | Descrição                                                            |
| ------------------- | -------------------------------------------------------------------- |
| `BOT_TOKEN`         | Token do @BotFather                                                  |
| `ALLOWED_USER_IDS`  | IDs separados por vírgula (vazio = aberto)                           |
| `RATE_LIMIT_MS`     | Intervalo mínimo entre mensagens (padrão 1500)                       |

---

## 💡 Spotify / Deezer / Apple Music

1. Acesse [TuneMyMusic.com](https://www.tunemymusic.com/)
2. Converta sua playlist para o YouTube
3. Cole o link do YouTube no Horizon

---

## 🗂️ Estrutura do projeto

```
horizon_cli/
├── index.js               # CLI (menu + commander)
├── bot.js                 # Bot do Telegram
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
    ├── antiban.js         # ✨ perfis, flags, circuit breaker
    ├── scanner.js         # ✨ rebuild do dedup a partir do disco
    ├── backup.js          # ✨ backup/restore JSON
    ├── health.js          # ✨ download de teste
    ├── queue.js           # fila persistente em JSON
    ├── queueRunner.js     # executor com barra de progresso
    ├── subscriptions.js   # inscrições (playlists/canais)
    ├── sync.js            # sync incremental
    ├── lyrics.js          # .lrc via lyrics.ovh
    ├── export.js          # .m3u + README.md
    ├── stats.js           # dashboard ASCII
    ├── updater.js         # self-update
    ├── completions.js     # bash/zsh/fish
    └── ui.js              # splash + settingsMenu (PT, seções)
```

---

## 🛟 Troubleshooting

- **"yt-dlp não encontrado"** → `horizon doctor` mostra como instalar.
- **Erros 429/403/"prove que não é um bot"** → suba o perfil em
  `horizon config` para `agressivo`, ou ative cookies (`furtivo`).
- **App pausado por 10 minutos** → o circuit breaker abriu; rode
  `horizon antiban status` pra ver e `horizon antiban reset` pra forçar.
- **Migrei de máquina e quero recuperar o dedup** → `horizon scan --rebuild`.
- **Quero levar minhas configs pra outro PC** → `horizon backup` lá,
  `horizon restore arquivo.json` aqui.

---

## 📜 Licença

MIT.
