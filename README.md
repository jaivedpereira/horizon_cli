# 🌌 Horizon CLI

> Seu ecossistema musical direto do terminal.
> Busca, baixa, sincroniza e organiza músicas — com CLI interativa,
> subcomandos, bot do Telegram, inscrições, fila persistente, letras e muito mais.

Compatível com **Android (Termux)**, **Linux**, **macOS** e **Windows**.

---

## ✨ Destaques

- 🎵 **Busca + download** do YouTube em mp3/m4a/opus/flac
- 🔔 **Inscrições** (playlists/canais) com auto-sync incremental
- 📦 **Fila persistente** resistente a crashes, com retries
- 🧠 **Dedup global** — nunca baixa o mesmo vídeo duas vezes
- 🎤 **Letras (.lrc)** automáticas via lyrics.ovh
- 📤 **Exportação** de `.m3u` + `README.md` por pasta
- 📊 **Dashboard** com gráfico ASCII dos últimos dias
- 📝 **Logger** com rotação em `~/.horizon/logs`
- 🔄 **Self-update** de `yt-dlp` e do próprio Horizon
- 🤖 **Bot do Telegram** com whitelist, rate-limit e fila por usuário
- 🖥️  **Auto-complete** para bash, zsh e fish

---

## ✨ Novidades da v2.1

- **Inscrições**: `horizon subs add <url>` salva uma playlist/canal;
  `horizon sync` enfileira só os vídeos novos.
- **Fila persistente**: jobs em `~/.horizon/queue.json` sobrevivem a crashes.
- **Dedup**: arquivo `~/.horizon/downloaded.txt` (via `--download-archive`).
- **Letras automáticas** em `.lrc` (API gratuita).
- **Exportação** `.m3u` + `README.md` por pasta.
- **Dashboard ASCII** (`horizon stats`).
- **Logger rotativo** (`horizon logs`).
- **Self-update** (`horizon update --all`).
- **Auto-complete** (`horizon completion bash|zsh|fish`).

## ✨ Novidades da v2.0

- **Arquitetura modular** em `src/` (config, downloader, history, notifier, ui).
- **CLI híbrida**: menu interativo _ou_ subcomandos (`horizon search …`, `horizon batch …`).
- **Downloads em paralelo** com barra de progresso (`cli-progress`).
- **Retry automático** com backoff exponencial em falhas de rede.
- **Configurações persistentes** em `~/.horizon/settings.json` (formato, qualidade, paralelismo).
- **Histórico** de downloads em `~/.horizon/history.json` (até 500 entradas).
- **`doctor`** — checa automaticamente se `yt-dlp` e `ffmpeg` estão instalados.
- **Bot do Telegram repaginado**: whitelist de usuários, rate-limit, fila por usuário,
  comandos `/help`, `/search`, `/stats`, `/cancel` e graceful shutdown.
- **Segurança**: todos os argumentos passados ao shell são _escapados_ (evita injeção).

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
horizon doctor
```

---

## 🚀 Uso — CLI

### Modo interativo

```bash
horizon
```

Abre o menu com opções: buscar, baixar playlist, ver arquivos, histórico, configurações, doctor.

### Subcomandos

```bash
# Buscar um termo e escolher entre top-5 resultados
horizon search "daft punk one more time" --playlist Favs

# Baixar direto de uma URL
horizon url "https://youtu.be/XXXX" --playlist Geral

# Lote (várias músicas, com concorrência)
horizon batch "the weeknd blinding lights, dua lipa levitating, beyonce cuff it" \
  --playlist Pop --concurrency 3

# Playlist inteira do YouTube
horizon playlist "https://www.youtube.com/playlist?list=PLxxx" --playlist RockClassics

# Histórico
horizon history
horizon history --clear

# Configurações (formato, qualidade, paralelismo, dedup, lyrics, m3u)
horizon config

# Checar dependências
horizon doctor

# Dashboard com gráfico ASCII
horizon stats

# Logs (últimas 50 linhas; --path só imprime o caminho)
horizon logs -n 80
horizon logs --path

# Atualizações
horizon update --ytdlp      # atualizar só o yt-dlp
horizon update --self       # git pull + npm i no projeto
horizon update --all        # tudo

# Inscrições (auto-sync de playlists/canais)
horizon subs add "https://www.youtube.com/playlist?list=PLxxx" -p RockMix -n "Meu rock"
horizon subs list
horizon subs remove <id|url>

# Sincronizar inscrições (enfileira novos e já roda)
horizon sync
horizon sync --no-run       # só enfileira, não baixa ainda

# Fila persistente
horizon queue list
horizon queue run
horizon queue retry          # re-enfileira os que falharam
horizon queue clear failed   # all | pending | completed | failed

# Exportar tracklist
horizon export Favs          # cria Favs.m3u e README.md dentro da pasta

# Baixar letras de uma pasta
horizon lyrics Favs

# Auto-complete
horizon completion bash > ~/.horizon-completion.bash
echo 'source ~/.horizon-completion.bash' >> ~/.bashrc
```

---

## ⚙️ Configurações

Executar `horizon config` abre um prompt que salva suas preferências em
`~/.horizon/settings.json`:

| Campo              | Padrão  | Descrição                                  |
| ------------------ | ------- | ------------------------------------------ |
| `format`           | `mp3`   | `mp3`, `m4a`, `opus` ou `flac`             |
| `quality`          | `192`   | kbps: `128`, `192`, `256`, `320`           |
| `concurrency`      | `2`     | Downloads simultâneos (1–6)                |
| `defaultPlaylist`  | `Geral` | Pasta usada quando você não especifica uma |
| `embedThumbnail`   | `true`  | Embute capa no arquivo                     |
| `embedMetadata`    | `true`  | Embute metadados (título, artista)         |
| `dedup`            | `true`  | Usa `--download-archive` (nunca rebaixa)   |
| `writeLyrics`      | `false` | Baixa `.lrc` após cada download            |
| `autoExportM3U`    | `true`  | Atualiza `.m3u` + `README.md` por pasta    |

---

## 📁 Onde os arquivos são salvos?

- **Termux / Android:** `/sdcard/Music/Horizon/<playlist>/`
- **Linux / macOS / Windows:** `~/Music/Horizon/<playlist>/`

Cada "playlist" vira uma subpasta. Tudo é automaticamente rescaneado pela galeria
do Android após download (via `termux-media-scan`).

---

## 🤖 Bot do Telegram

### Setup

1. Crie um bot com o [@BotFather](https://t.me/BotFather) e copie o token.
2. Copie as variáveis de ambiente:

```bash
cp .env.example .env
# edite .env e coloque seu BOT_TOKEN
```

3. Inicie:

```bash
npm run bot
```

### Variáveis (`.env`)

| Variável            | Obrigatório | Descrição                                                             |
| ------------------- | ----------- | --------------------------------------------------------------------- |
| `BOT_TOKEN`         | Sim         | Token fornecido pelo @BotFather                                       |
| `ALLOWED_USER_IDS`  | Não         | IDs permitidos, separados por vírgula. Vazio = aberto para todos      |
| `RATE_LIMIT_MS`     | Não         | Tempo mínimo (ms) entre mensagens do mesmo usuário. Padrão `1500`     |

### Comandos do bot

- `/start` — boas-vindas
- `/help` — ajuda detalhada
- `/search <termo>` — busca com botões
- `/stats` — estatísticas de download
- `/cancel` — cancela o passo atual

Você também pode simplesmente enviar:
- um **nome** → bot retorna 5 opções com botões
- um **link do YouTube** → baixa direto
- uma **playlist do YouTube** → baixa tudo na pasta escolhida

Arquivos até ~49MB são enviados no próprio chat; maiores ficam só no celular.

---

## 💡 Spotify / Deezer / Apple Music

O Horizon usa `yt-dlp`, então ele baixa do YouTube nativamente. Para
playlists de outras plataformas:

1. Acesse [TuneMyMusic.com](https://www.tunemymusic.com/)
2. Converta sua playlist para o YouTube
3. Cole o link do YouTube aqui (CLI ou bot)

---

## 🗂️ Estrutura do projeto

```
horizon_cli/
├── index.js           # CLI (menu interativo + commander)
├── bot.js             # Bot do Telegram
├── package.json
├── .env.example
├── CHANGELOG.md
└── src/
    ├── config.js         # paths, settings persistentes, archive file
    ├── utils.js          # helpers (escape, retry, detectors, sleep)
    ├── logger.js         # logger com rotação em ~/.horizon/logs
    ├── deps.js           # checker de yt-dlp / ffmpeg
    ├── notifier.js       # notificações Termux (anti-spam)
    ├── history.js        # histórico JSON + top playlists
    ├── downloader.js     # yt-dlp + concorrência + dedup + hooks
    ├── queue.js          # fila persistente em JSON
    ├── queueRunner.js    # executor da fila com barra de progresso
    ├── subscriptions.js  # inscrições (playlists/canais do YT)
    ├── sync.js           # sync incremental das inscrições
    ├── lyrics.js         # .lrc via lyrics.ovh
    ├── export.js         # .m3u + README.md
    ├── stats.js          # dashboard ASCII
    ├── updater.js        # self-update (yt-dlp, git pull, npm i)
    ├── completions.js    # scripts bash/zsh/fish
    └── ui.js             # splash, prompts compartilhados
```

### 📂 Arquivos persistentes do Horizon (`~/.horizon/`)

| Arquivo              | Descrição                                              |
| -------------------- | ------------------------------------------------------ |
| `settings.json`      | Preferências do usuário                                |
| `history.json`       | Últimos 500 downloads (sucesso/erro)                   |
| `queue.json`         | Fila persistente (pending / completed / failed)        |
| `subscriptions.json` | Inscrições cadastradas                                 |
| `downloaded.txt`     | Arquivo do `--download-archive` (dedup global)         |
| `logs/horizon.log`   | Log rotativo (2MB por arquivo, até 5 rotacionados)     |

---

## 🛟 Troubleshooting

- **"yt-dlp não encontrado"** → rode `horizon doctor` e siga a dica de instalação.
- **Downloads travando no YouTube** → o `yt-dlp` pode estar desatualizado:
  `pip install -U yt-dlp`.
- **Bot não recebe arquivos** → cheque se seu ID está em `ALLOWED_USER_IDS`
  (se você configurou a whitelist).
- **Ver falhas antigas** → `horizon history`.

---

## 📜 Licença

MIT.
