const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");

const RC_PATH = path.join(os.homedir(), ".echodebugrc");

function readRc() {
  try {
    const raw = fs.readFileSync(RC_PATH, "utf8").trim();
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data.webhook_url || data.webhook || data.ECHODEBUG_WEBHOOK_URL || null;
  } catch {
    return null;
  }
}

function writeRc(webhookUrl) {
  const payload = {
    webhook_url: webhookUrl,
  };
  fs.writeFileSync(RC_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

/**
 * Resolution order: --webhook, ECHODEBUG_WEBHOOK_URL, ECHODEBUG_WEBHOOK, ~/.echodebugrc
 */
function resolveWebhook({ flag } = {}) {
  const fromFlag = typeof flag === "string" ? flag.trim() : "";
  if (fromFlag) return fromFlag;

  const fromEnv = (
    process.env.ECHODEBUG_WEBHOOK_URL ||
    process.env.ECHODEBUG_WEBHOOK ||
    ""
  ).trim();
  if (fromEnv) return fromEnv;

  const fromRc = readRc();
  return fromRc ? String(fromRc).trim() : null;
}

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function runSetup() {
  if (!process.stdin.isTTY) {
    throw new Error(
      "echorun --setup needs an interactive terminal. Set ECHODEBUG_WEBHOOK_URL instead."
    );
  }

  const current = resolveWebhook({}) || "";
  const hint = current ? ` [${current}]` : "";
  const answer = (await ask(`n8n webhook URL${hint}: `)).trim();
  const webhookUrl = answer || current;

  if (!webhookUrl) {
    throw new Error("No webhook URL given.");
  }
  if (!/^https?:\/\//i.test(webhookUrl)) {
    throw new Error("Webhook URL must start with http:// or https://");
  }

  writeRc(webhookUrl);
  console.log(`Saved webhook URL to ${RC_PATH}`);
}

module.exports = { RC_PATH, resolveWebhook, runSetup, writeRc };
