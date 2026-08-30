const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

function quoteForShell(arg) {
  const s = String(arg);
  if (process.platform === "win32") {
    if (/^[A-Za-z0-9_\/:=.@+-]+$/.test(s)) return s;
    return `"${s.replace(/"/g, '""')}"`;
  }
  if (s === "") return "''";
  if (/^[A-Za-z0-9_\/:=.@%+-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Spawn `argv` as a child process, tee stdout/stderr to this terminal,
 * and return captured output plus exit code.
 */
function runCommand(argv, cwd = process.cwd()) {
  if (!argv || !argv.length) {
    return Promise.reject(new Error("No command given."));
  }

  const commandLine = argv.map(quoteForShell).join(" ");

  return new Promise((resolve, reject) => {
    const child = spawn(commandLine, {
      cwd,
      env: process.env,
      shell: true,
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
