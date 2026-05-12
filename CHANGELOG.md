# Changelog

## [2.1.0] — 2026-05-12

### 🚀 Adicionado

- **Inscrições / auto-sync** — `horizon subs add <url>` salva uma playlist
  ou canal do YouTube. `horizon sync` busca apenas os vídeos **novos** e
  enfileira automaticamente.
- **Fila persistente** (`~/.horizon/queue.json`) — jobs sobrevivem a
  reinícios e crashes, com até 3 tentativas antes de virar `failed`.
  Comandos: `horizon queue list|run|retry|clear`.
- **Dedup global** via `--download-archive` — nunca baixa o mesmo vídeo
  duas vezes entre sessões. Configurável em `horizon config`.
- **Letras (.lrc)** — busca automática via [lyrics.ovh](https://lyrics.ovh)
  e salva um `.lrc` ao lado do áudio. Use `horizon lyrics <pasta>` ou ative
  `writeLyrics` no config para rodar após cada download.
- **Exportação de playlists** — `horizon export <pasta>` gera um arquivo
  `.m3u` e um `README.md` com a tracklist. Também pode ser automático.
- **Dashboard** — `horizon stats` mostra resumo e gráfico ASCII dos
  últimos 14 dias de downloads.
- **Logger com rotação** — logs em `~/.horizon/logs/horizon.log`
  (2MB por arquivo, até 5 rotacionados). Acesse com `horizon logs`.
- **Self-updater** — `horizon update --ytdlp` / `--self` / `--all`.
  Tenta `yt-dlp -U`, `pipx upgrade`, `pip3 install -U`, `pip install -U`
  em sequência até funcionar.
- **Auto-complete de shell** — `horizon completion bash|zsh|fish` gera
  script de tab-completion pronto pra instalar.
- **Top playlists** — o `horizon history` agora mostra quais pastas
  receberam mais downloads.

### 🔧 Alterado

- Menu interativo expandido: inscrições, fila, dashboard, lyrics, export,
  logs e updater agora têm entrada própria.
- `src/downloader.js` agora passa pelo `postProcess` (lyrics + m3u) após
  cada download bem-sucedido.
- `src/config.js` ganhou novos campos: `dedup`, `writeLyrics`,
  `autoExportM3U`.

### 📁 Novos arquivos

```
src/
├── completions.js     # scripts de tab-completion bash/zsh/fish
├── export.js          # .m3u + README.md para cada pasta
├── logger.js          # logger com rotação
├── lyrics.js          # letras via lyrics.ovh
├── queue.js           # fila persistente em JSON
├── queueRunner.js     # executa a fila com concorrência e progresso
├── stats.js           # dashboard ASCII
├── subscriptions.js   # inscrições (playlists/canais)
├── sync.js            # sync incremental usando o archive
└── updater.js         # self-update de yt-dlp e do projeto
```

---

## [2.0.0] — Versão anterior

- Arquitetura modular em `src/`.
- CLI híbrida (menu + commander).
- Barra de progresso, retry com backoff, settings persistentes.
- Bot do Telegram com whitelist, rate-limit e fila por usuário.
- Shell escaping em todos os argumentos.
