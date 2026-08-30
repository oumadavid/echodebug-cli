# echodebug-cli

Wrap any terminal command. On failure, EchoDebug diagnoses the error, reads the explanation aloud, and prints a copy-paste fix.

## Install

Requires Node.js 18+.

```bash
npm install -g echodebug-cli
```

## Quick Start

No config required. The shared demo webhook is the default.

```bash
echorun npm run build
```

Works with any command (`echorun pytest`, `echorun cargo test`, …). Successful commands pass through unchanged. `--no-play` skips audio.

## How it works

`echorun` runs your command and, if it exits non-zero, captures the last lines of stderr. That log is posted to an AI agent (Claude via n8n) which returns a short diagnosis, a spoken explanation (ElevenLabs), and a terminal fix. The original error stays on screen; the summary and green fix box print next to it, then the MP3 plays in this terminal.

## Default webhook

Default URL: `https://jsninja.app.n8n.cloud/webhook/debug`

This is a **shared demo endpoint** for the hackathon. It is temporary, may be rate-limited, and may be taken down afterward.

Override it if you self-host:

```bash
echorun --webhook https://your-n8n-instance/webhook/debug npm run build
```

```bash
export ECHODEBUG_WEBHOOK_URL=https://your-n8n-instance/webhook/debug
```

`--webhook` wins over `ECHODEBUG_WEBHOOK_URL`, then `.env` / `~/.echodebugrc`, then this default.

## Self-hosting

1. Import `workflow.json` into your own n8n Cloud or self-hosted instance.
2. Attach your Anthropic (Claude) and ElevenLabs credentials.
3. Activate the workflow and copy the production webhook URL.
4. Point the CLI at it with `ECHODEBUG_WEBHOOK_URL`, `--webhook`, or `echorun --setup`.

## Security note

Error logs (which may include file paths or code snippets) are sent to the configured webhook for analysis. Self-host if you do not want that going to a shared endpoint.

## License

MIT
