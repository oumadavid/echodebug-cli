const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

// cmd.exe metacharacters — see http://www.robvanderwoude.com/escapechars.php
const WIN_META = /([()\][%!^"`<>&|;, *?])/g;

function escapeWinCommand(arg) {
  return String(arg).replace(WIN_META, "^$1");
}

function escapeWinArgument(arg) {
  const raw = String(arg);
  if (!WIN_META.test(raw) && !/[\s"]/.test(raw)) return raw;
  let s = raw;
  s = s.replace(/(?=(\\+?)?)\1"/g, "$1$1\\\"");
  s = s.replace(/(?=(\\+?)?)\1$/, "$1$1");
  s = `"${s}"`;
  return s.replace(WIN_META, "^$1");
}

/**
 * On Windows, spawn({ shell: false }) will not find `npm` because it is
 * npm.cmd. Prefer PATHEXT matches (.exe/.cmd/…) over an extensionless shim
 * that CreateProcess cannot run.
 */
function resolveCommand(command, cwd) {
  if (process.platform !== "win32") return command;
  if (/[/\\]/.test(command) || path.extname(command)) return command;

  const exts = (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM")
    .split(";")
    .filter(Boolean)
    .map((ext) => (ext.startsWith(".") ? ext : `.${ext}`));
  const dirs = [cwd, ...(process.env.PATH || "").split(path.delimiter)];

  for (const dir of dirs) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.resolve(dir, command + ext);
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return candidate;
        }
      } catch {
        /* ignore unreadable PATH entries */
      }
    }
  }
  return command;
}

/**
 * Spawn `argv` as a child process, tee stdout/stderr to this terminal,
 * and return captured output plus exit code.
 *
 * Always passes command and args as an array. Unix uses shell: false.
 * Windows uses shell: true only for non-.exe shims (npm.cmd, builtins like
 * echo); each arg is cmd-escaped first because Node's shell:true path
 * concatenates into `cmd /s /c "..."`, which would otherwise treat && as
 * another command.
 */
function runCommand(argv, cwd = process.cwd()) {
  if (!argv || !argv.length) {
    return Promise.reject(new Error("No command given."));
  }

  let command = argv[0];
  let args = argv.slice(1);
  let useShell = false;

  if (process.platform === "win32") {
    command = resolveCommand(command, cwd);
    useShell = !/\.(?:com|exe)$/i.test(command);
    if (useShell) {
      command = escapeWinCommand(command);
      args = args.map(escapeWinArgument);
    }
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      shell: useShell,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    if (child.stdout) {
      child.stdout.on("data", (chunk) => {
        process.stdout.write(chunk);
        stdout += chunk.toString("utf8");
      });
    }
    if (child.stderr) {
      child.stderr.on("data", (chunk) => {
        process.stderr.write(chunk);
        stderr += chunk.toString("utf8");
      });
    }

    child.on("error", reject);
    child.on("close", (code, signal) => {
      resolve({
        code: code === null ? 1 : code,
        signal,
        stdout,
        stderr,
      });
    });
  });
}

function lastLines(text, n = 50) {
  const lines = String(text || "").split(/\r?\n/);
  return lines.slice(-n).join("\n");
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function hasAny(obj, names) {
  if (!obj || typeof obj !== "object") return false;
  return names.some((name) => Object.prototype.hasOwnProperty.call(obj, name));
}

function depsOf(pkg) {
  return {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.peerDependencies || {}),
  };
}

/**
 * Best-effort framework guess from files in `cwd`. Defaults to "unknown".
 */
function detectFramework(cwd = process.cwd()) {
  const pkgPath = path.join(cwd, "package.json");
  const pkg = fs.existsSync(pkgPath) ? readJson(pkgPath) : null;
  const deps = pkg ? depsOf(pkg) : {};

  if (hasAny(deps, ["next"])) return "next.js";
  if (hasAny(deps, ["nuxt", "nuxt3"])) return "nuxt";
  if (hasAny(deps, ["@angular/core"])) return "angular";
  if (hasAny(deps, ["vue", "vue-router"])) return "vue";
  if (hasAny(deps, ["@nestjs/core"])) return "nestjs";
  if (hasAny(deps, ["express"])) return "express";
  if (hasAny(deps, ["fastify"])) return "fastify";
  if (hasAny(deps, ["react", "react-dom"])) return "react";
  if (pkg) return "node";

  if (fs.existsSync(path.join(cwd, "requirements.txt")) ||
      fs.existsSync(path.join(cwd, "pyproject.toml")) ||
      fs.existsSync(path.join(cwd, "Pipfile"))) {
    const blob = [
      "requirements.txt",
      "pyproject.toml",
      "Pipfile",
    ]
      .map((f) => {
        try {
          return fs.readFileSync(path.join(cwd, f), "utf8");
        } catch {
          return "";
        }
      })
      .join("\n")
      .toLowerCase();
    if (blob.includes("django")) return "django";
    if (blob.includes("flask")) return "flask";
    if (blob.includes("fastapi")) return "fastapi";
    return "python";
  }

  if (fs.existsSync(path.join(cwd, "Cargo.toml"))) return "rust";
  if (fs.existsSync(path.join(cwd, "go.mod"))) return "go";
  if (fs.existsSync(path.join(cwd, "Gemfile"))) return "ruby";
  if (fs.existsSync(path.join(cwd, "composer.json"))) return "php";
  if (
    fs.existsSync(path.join(cwd, "pom.xml")) ||
    fs.existsSync(path.join(cwd, "build.gradle")) ||
    fs.existsSync(path.join(cwd, "build.gradle.kts"))
  ) {
    return "java";
  }

  return "unknown";
}

module.exports = { runCommand, lastLines, detectFramework };
