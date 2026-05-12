# Changelog

## [2.2.0] — 2026-05-12 — "Anti-Ban"

### 🛡️ Sistema anti-bloqueio do YouTube (destaque)

O YouTube barra downloads suspeitos com erros como `HTTP 429`, `HTTP 403`
ou "Sign in to confirm you're not a bot". A v2.2 adiciona uma camada de
defesa completa.

- **Perfis de proteção** (escolha em `horizon config` → "Proteção
  anti-bloqueio"):
  - `desligado` — máxima velocidade, máximo risco.
  - `seguro` — **padrão**. Sleep de 2s + dois player clients (android+web).
  - `agressivo` — sleep 5s, banda 2 MB/s, três player clients.
  - `furtivo` — sleep 8s, banda 1 MB/s, cookies do navegador.
- **User-Agent rotativo** entre 5 reais (Windows/Mac/Linux/Android/iPhone).
- **Cookies do navegador** opcionais (Chrome/Firefox/Edge/Brave/Safari/Chromium)
  — usa sua sessão logada e contorna 90% dos bloqueios.
- **Geo-bypass** ligado por padrão.
- **Player clients múltiplos** (`youtube:player_client=android,web,ios`):
  se um falha, o próprio yt-dlp cai pro próximo automaticamente.
- **Retries reforçados**: 5 tentativas + 10 retries por fragmento.
- **Circuit breaker** (`~/.horizon/circuit.json`):
  - Detecta padrão de ban (mensagens "429", "403", "bot check"...).
  - Após **5 falhas seguidas** OU detecção explícita de ban → pausa o app
    inteiro por **10 minutos** pra não queimar o IP.
  - O lote em andamento para imediatamente em vez de bombardear.
  - Resetável manualmente: `horizon antiban reset`.

### ⚙️ Configurações reformuladas (tudo em português)

- Menu por **seções** com inquirer:
  - 📁 **Biblioteca** — pasta base (com expansão de `~`) e pasta padrão.
  - 🎵 **Áudio** — formato, qualidade, capa, metadados, normalização.
  - ⚡ **Desempenho** — paralelismo, dedup, letras, M3U auto.
  - 🛡️ **Proteção anti-bloqueio** — perfil + cookies.
  - 🖥️ **Interface** — dicas contextuais.
- **♻️ Restaurar padrões de fábrica** com confirmação.
- **📝 Ver configurações atuais** mostra o JSON formatado.
- Pasta base agora **editável** (antes era fixa). Aceita `~/Music/MeuMix`
  ou caminho absoluto. Cria a pasta se não existir.

### 🚀 Outras novidades

- **🔊 Normalização de volume (EBU R128)** opcional — todas as músicas
  ficam com o mesmo volume (estilo Spotify).
- **🔎 Scanner / `horizon scan [--rebuild]`** — varre a biblioteca,
  extrai o `video_id` dos arquivos e reconstrói o `downloaded.txt`.
  Útil ao migrar de máquina ou recuperar de uma config corrompida.
- **💾 `horizon backup` / `horizon restore`** — empacota settings,
  history, queue, subscriptions e archive num único JSON.
  Restore faz **merge inteligente** por padrão (não duplica).
- **🩺 `horizon health`** — baixa um vídeo curto da NASA pra testar se
  conexão + yt-dlp + cookies estão saudáveis.
- **📁 Nomeação melhor**: arquivos passam a incluir `[VIDEOID]` no nome,
  o que faz o scanner funcionar 100% mesmo sem ler tags.

### 🆕 Comandos

```bash
horizon antiban status        # estado atual da proteção e do circuit breaker
horizon antiban reset         # libera downloads se o circuito estiver aberto
horizon antiban test          # rod a um download de teste com a proteção atual
horizon scan                  # apenas escaneia
horizon scan --rebuild        # reconstrói o dedup
horizon backup [--out file]   # cria backup
horizon restore <file>        # restaura (mescla por padrão)
horizon restore <file> --no-merge  # sobrescreve
horizon health                # download de teste real
horizon config                # menu de seções em PT
```

### 🔧 Internals

- `src/antiban.js` (novo) — perfis, flags do yt-dlp e circuit breaker.
- `src/scanner.js` (novo) — extração de `video_id` e rebuild do dedup.
- `src/backup.js` (novo) — backup/restore JSON versionado.
- `src/health.js` (novo) — download de teste real.
- `src/config.js` — `defaultSettings()`, `resetSettings()`, pasta base
  via `musicBaseDir`.
- `src/downloader.js` — usa `antibanFlags` + `loudnessFlags`, gateia em
  `gateOnCircuit()`, registra success/failure.
- `src/ui.js` — `settingsMenu()` por seções em português.
- `bin scripts` adicionados: `npm run health`, `npm run antiban`,
  `npm run backup`.

---

## [2.1.0] — 2026-05-12

### 🚀 Adicionado

- **Inscrições / auto-sync** — `horizon subs add <url>` salva uma playlist
  ou canal do YouTube. `horizon sync` busca apenas os vídeos **novos** e
  enfileira automaticamente.
- **Fila persistente** (`~/.horizon/queue.json`) — jobs sobrevivem a
  reinícios e crashes, com até 3 tentativas antes de virar `failed`.
- **Dedup global** via `--download-archive`.
- **Letras (.lrc)** automáticas via lyrics.ovh.
- **Exportação `.m3u` + `README.md`** por pasta.
- **Dashboard ASCII** (`horizon stats`).
- **Logger rotativo** em `~/.horizon/logs/`.
- **Self-updater** (`horizon update --ytdlp/--self/--all`).
- **Auto-complete** bash/zsh/fish.
- **Top playlists** no histórico.

---

## [2.0.0]

- Arquitetura modular em `src/`.
- CLI híbrida (menu + commander).
- Barra de progresso, retry com backoff, settings persistentes.
- Bot do Telegram com whitelist, rate-limit e fila por usuário.
- Shell escaping em todos os argumentos.
