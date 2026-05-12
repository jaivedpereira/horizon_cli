# 🌌 Horizon CLI

> Seu ecossistema musical direto do terminal.
> Busca, baixa, sincroniza e organiza músicas — com CLI interativa,
> subcomandos, bot do Telegram, inscrições, fila persistente, letras,
> **proteção anti-bloqueio do YouTube** e muito mais.

Compatível com **Android (Termux)**, **Linux**, **macOS** e **Windows**.

**Versão atual:** `2.2.0` ("Anti-Ban")

---

## 📑 Sumário

- [Destaques](#-destaques)
- [Novidades v2.2](#-novidades-da-v22-anti-ban)
- [Instalação](#-instalação)
- [Sistema anti-bloqueio](#%EF%B8%8F-sistema-anti-bloqueio-do-youtube)
- [📚 TODOS os comandos](#-todos-os-comandos-do-horizon)
- [Configurações](#%EF%B8%8F-configurações-em-português-por-seção)
- [Onde os arquivos ficam](#-onde-os-arquivos-são-salvos)
- [Bot do Telegram](#-bot-do-telegram)
- [Spotify / Deezer / Apple Music](#-spotify--deezer--apple-music)
- [Estrutura do projeto](#%EF%B8%8F-estrutura-do-projeto)
- [Troubleshooting](#-troubleshooting)

---

## ✨ Destaques

- 🎵 **Busca + download** do YouTube em mp3/m4a/opus/flac
- 🛡️ **Proteção anti-bloqueio** com 4 perfis + circuit breaker automático
- 🔔 **Inscrições** (playlists/canais) com auto-sync incremental
- 📦 **Fila persistente** resistente a crashes, com retries
- 🧠 **Dedup global** — nunca baixa o mesmo vídeo duas vezes
- 🔊 **Normalização de volume** (EBU R128, estilo Spotify)
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
| `horizon search <termo>` | Busca + escolhe + baixa |
| `horizon url <link>` | Baixa direto da URL |
| `horizon batch <lista>` | Baixa várias com concorrência |
| `horizon playlist <url>` | Baixa playlist YT inteira |
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

Comandos do bot: `/start`, `/help`, `/search`, `/stats`, `/cancel`. Envie nome,
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

| Problema | Solução |
|---|---|
| **"yt-dlp não encontrado"** | `horizon doctor` mostra como instalar |
| **Erros 429/403/"prove que não é um bot"** | Suba o perfil em `horizon config` para `agressivo`, ou ative cookies (`furtivo`) |
| **App pausado por 10 minutos** | O circuit breaker abriu — `horizon antiban status` mostra, `horizon antiban reset` força liberar |
| **yt-dlp travando ou erros estranhos** | `horizon update --ytdlp` (provavelmente está desatualizado) |
| **Migrei de máquina e quero recuperar o dedup** | `horizon scan --rebuild` |
| **Quero levar minhas configs pra outro PC** | `horizon backup` → copia o JSON → `horizon restore` no novo |
| **Bot não recebe arquivos** | Cheque `ALLOWED_USER_IDS` no `.env` |
| **Quero limpar tudo e começar do zero** | `horizon config` → "Restaurar padrões de fábrica" |

---

## 📜 Licença

MIT.
