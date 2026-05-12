# 🌌 Horizon CLI

> Seu ecossistema musical direto do terminal.
> Busca, baixa e organiza músicas — com CLI interativa, subcomandos e bot do Telegram.

Compatível com **Android (Termux)**, **Linux**, **macOS** e **Windows**.

---

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

# Configurações (formato, qualidade, paralelismo)
horizon config

# Checar dependências
horizon doctor
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
└── src/
    ├── config.js      # paths, settings persistentes
    ├── utils.js       # helpers (escape, retry, detectors, sleep)
    ├── deps.js        # checker de yt-dlp / ffmpeg
    ├── notifier.js    # notificações Termux (anti-spam)
    ├── history.js     # histórico JSON
    ├── downloader.js  # build de comandos + execução + concorrência
    └── ui.js          # splash, prompts compartilhados
```

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
