# echodebug-cli

Wrap any terminal command. If it fails, EchoDebug sends the error to **your** n8n webhook for an AI diagnosis and (optionally) plays the spoken explanation in the same terminal.

```bash
echorun npm run build
```

## Install

From this folder (until it is published):

```bash
cd echodebug-cli
npm install
npm link
```

Later, when published:

```bash
npm install -g echodebug-cli
```

Requires **Node.js 18+** (uses global `fetch`).

## Setup

You need a live n8n webhook. Deploy your own copy of the EchoDebug workflow (see `workflow.json`), then give `echorun` the production URL in any of these ways — first match wins:

1. **Flag:** `echorun --webhook https://… npm run build`
2. **Env:** `ECHODEBUG_WEBHOOK_URL` (or `ECHODEBUG_WEBHOOK`)
3. **Config file:** `~/.echodebugrc`
4. **Interactive:** `echorun --setup`

`~/.echodebugrc` is JSON:

```json
{
  "webhook_url": "https://your-n8n-instance.app.n8n.cloud/webhook/debug"
}
```

`.env.example` documents the env var. This package does not load `.env` for you.

### Your own n8n workflow

This CLI does **not** ship a hosted agent. Import / rebuild the pipeline in n8n Cloud (or self-hosted), activate it, and use **that** webhook.

Expected **POST** body:

```json
{
  "command": "npm run build",
  "error_log": "…last 50 lines of stderr…",
  "framework": "next.js"
}
```

Expected **JSON** response:

```json
{
  "root_cause_summary": "DATABASE_URL is read at import time, so next build dies.",
  "terminal_fix_command": "copy .env.example .env",
  "audio_url": "data:audio/mpeg;base64,…"
}
```

`audio_url` may also be an `https://` link to an MP3. If it is missing, the text diagnosis still prints.

## Usage

```bash
echorun npm run build
echorun --no-play pytest
echorun --webhook https://example.app.n8n.cloud/webhook/debug cargo test
```

- On **success**, the child’s stdout/stderr pass through and `echorun` exits 0. Nothing is posted.
- On **failure**, the last 50 lines of stderr (stdout if stderr is empty) go to the webhook. The original log stays in the terminal. Then EchoDebug prints `root_cause_summary` and a green box with `terminal_fix_command`, and plays `audio_url` unless you passed `--no-play`.
- Framework is guessed from the current directory (`package.json` deps, `requirements.txt`, `Cargo.toml`, …) and defaults to `unknown`.

## Demo with echodebug-sample

The companion Next.js app fails `next build` on purpose (missing `DATABASE_URL`). From that project:

```bash
echorun npm run build
```

## Audio

Playback uses `play-sound` first, then `ffplay` if installed, then Windows MediaPlayer. Install [ffmpeg](https://ffmpeg.org/) if you want a reliable headless player.

## License

MIT
