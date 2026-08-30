#!/usr/bin/env node

const { Command } = require("commander");
const pkg = require("../package.json");
const { resolveWebhook, runSetup } = require("../src/config");
const { runCommand, detectFramework, lastLines } = require("../src/wrapper");
const { diagnose, printDiagnosis } = require("../src/client");
const { playAudioUrl } = require("../src/playback");

function peelArgs(argv) {
  const opts = {
    webhook: null,
    play: true,
    setup: false,
    help: false,
    version: false,
  };
  const rest = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];

    if (rest.length > 0) {
      rest.push(a);
      continue;
    }

    if (a === "--") {
      rest.push(...argv.slice(i + 1));
      break;
    }
    if (a === "--setup") {
      opts.setup = true;
      continue;
    }
    if (a === "--no-play") {
      opts.play = false;
      continue;
    }
    if (a === "--webhook") {
      opts.webhook = argv[++i];
      continue;
    }
    if (a.startsWith("--webhook=")) {
      opts.webhook = a.slice("--webhook=".length);
      continue;
    }
    if (a === "--help" || a === "-h") {
      opts.help = true;
      continue;
    }
    if (a === "--version" || a === "-V") {
      opts.version = true;
      continue;
    }

    rest.push(a);
  }

  return { opts, rest };
}

function helpProgram() {
  const program = new Command();
  program
    .name("echorun")
    .description(
      "Wrap any terminal command. On failure, send the error to your EchoDebug webhook for AI diagnosis and (optional) spoken playback."
    )
    .version(pkg.version)
    .option("--webhook <url>", "n8n webhook URL (overrides env and ~/.echodebugrc)")
    .option("--no-play", "print the diagnosis only; skip audio")
    .option("--setup", "save a webhook URL to ~/.echodebugrc")
    .argument("[command...]", "command to run, e.g. npm run build");
  return program;
}

async function main() {
  const { opts, rest } = peelArgs(process.argv.slice(2));

  if (opts.help) {
    helpProgram().outputHelp();
    return;
  }
  if (opts.version) {
    console.log(pkg.version);
    return;
  }
  if (opts.setup) {
    await runSetup();
    return;
  }
  if (!rest.length) {
    helpProgram().outputHelp({ error: true });
    process.exitCode = 1;
    return;
  }

  const result = await runCommand(rest);

  if (result.code === 0) {
    process.exitCode = 0;
    return;
  }

  const errorLog = lastLines(result.stderr || result.stdout, 50);
  if (!errorLog.trim()) {
    console.error("echorun: command failed but produced no captured output.");
    process.exit(result.code || 1);
  }

  const webhook = resolveWebhook({ flag: opts.webhook });
  if (!webhook) {
    console.error(
      "echorun: no webhook configured. Set ECHODEBUG_WEBHOOK_URL, add ~/.echodebugrc, pass --webhook, or run `echorun --setup`."
    );
    process.exit(result.code || 1);
  }

  const framework = detectFramework(process.cwd());
  const data = await diagnose({
    webhook,
    command: rest.join(" "),
    errorLog,
    framework,
  });

  printDiagnosis(data);

  if (opts.play && data && data.audio_url) {
    await playAudioUrl(data.audio_url);
  }

  process.exit(result.code || 1);
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
