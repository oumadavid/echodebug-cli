const chalk = require("chalk");

async function diagnose({ webhook, command, errorLog, framework }) {
  process.stderr.write("EchoDebug: identifying error…\n");

  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      command,
      error_log: errorLog,
      framework,
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(
      `Webhook HTTP ${res.status}: ${raw.slice(0, 500) || "(empty body)"}`
    );
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Webhook did not return JSON.");
  }

  return data;
}

function pad(text, width) {
  const s = String(text);
  if (s.length >= width) return s;
  return s + " ".repeat(width - s.length);
}

function printBox(title, body, color) {
  const lines = String(body)
    .split(/\r?\n/)
    .map((line) => line.trimEnd());
  const inner = Math.max(
    title.length + 1,
    ...lines.map((line) => line.length),
    24
  );
  const width = inner + 2;
  const paint = color || ((s) => s);

  console.log(paint(`┌${"─".repeat(width)}┐`));
  console.log(paint(`│ ${pad(title, inner)} │`));
  console.log(paint(`├${"─".repeat(width)}┤`));
  for (const line of lines) {
    console.log(paint(`│ ${pad(line, inner)} │`));
  }
  console.log(paint(`└${"─".repeat(width)}┘`));
}

function printDiagnosis(data) {
  if (!data || typeof data !== "object") return;

  const summary =
    data.root_cause_summary || data.diagnosis || data.summary || null;
  const fix = data.terminal_fix_command || data.fix || null;

  if (summary) {
    console.log("");
    console.log(chalk.cyan.bold("── EchoDebug ────────────────────────────────"));
    console.log(String(summary).trim());
    console.log(chalk.cyan("─────────────────────────────────────────────"));
  }

  if (fix) {
    console.log("");
    printBox("Fix", String(fix).trim(), chalk.green.bold);
  }

  if (!summary && !fix && !data.audio_url) {
    console.error("EchoDebug: webhook JSON had no root_cause_summary, terminal_fix_command, or audio_url.");
  }
}

module.exports = { diagnose, printDiagnosis };
