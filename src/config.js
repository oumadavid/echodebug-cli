const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");

const RC_PATH = path.join(os.homedir(), ".echodebugrc");
const PACKAGE_ROOT = path.resolve(__dirname, "..");

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

function stripQuotes(value) {
  const v = String(value).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1);
  }
  return v;
}

/** Read only webhook keys from a .env file. Does not mutate process.env. */
function webhookFromEnvFile(filePath) {
  try {
    const text = fs.readFileSync(filePath, "utf8");
    let url = null;
    let alias = null;
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = stripQuotes(trimmed.slice(eq + 1));
      if (key === "ECHODEBUG_WEBHOOK_URL" && value) url = value;
      if (key === "ECHODEBUG_WEBHOOK" && value) alias = value;
    }
    return url || alias || null;
  } catch {
    return null;
  }
}

function envFilesFromCwd(cwd = process.cwd()) {
  const files = [];
  let dir = path.resolve(cwd);
  const { root } = path.parse(dir);
  for (let i = 0; i < 8; i++) {
    files.push(path.join(dir, ".env"));
    if (dir === root || fs.existsSync(path.join(dir, ".git"))) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  files.push(path.join(PACKAGE_ROOT, ".env"));
  return files;
}

function webhookFromDotenv() {
  for (const file of envFilesFromCwd()) {
    const value = webhookFromEnvFile(file);
    if (value) return value;
  }
  return null;
}

/**
 * Resolution order: --webhook, ECHODEBUG_WEBHOOK_URL, ECHODEBUG_WEBHOOK,
 * .env (cwd and parents, then the CLI package), ~/.echodebugrc
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

  const fromDotenv = webhookFromDotenv();
  if (fromDotenv) return String(fromDotenv).trim();

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
