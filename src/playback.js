const fs = require("fs");
const os = require("os");
const path = require("path");
const playSound = require("play-sound");

const REAL_PLAYERS = [
  "ffplay",
  "mpg123",
  "mpg321",
  "mplayer",
  "afplay",
  "cmdmp3",
  "play",
];

const PLAY_PS1 = `
param([Parameter(Mandatory=$true)][string]$AudioPath)
Add-Type -AssemblyName PresentationCore
$full = (Resolve-Path -LiteralPath $AudioPath).Path
$player = New-Object System.Windows.Media.MediaPlayer
$player.Open([Uri]$full)
$n = 0
while (-not $player.NaturalDuration.HasTimeSpan -and $n -lt 80) {
  Start-Sleep -Milliseconds 100
  $n++
}
$player.Volume = 1
$player.Play()
if ($player.NaturalDuration.HasTimeSpan) {
  Start-Sleep -Seconds ([Math]::Ceiling($player.NaturalDuration.TimeSpan.TotalSeconds) + 1)
} else {
  Start-Sleep -Seconds 25
}
$player.Stop()
$player.Close()
`.trim();

function toError(err) {
  if (err instanceof Error) return err;
  if (err) return new Error(String(err));
  return new Error("audio player exited with an error");
}

function decodeAudio(audio) {
  if (Buffer.isBuffer(audio)) {
    return { buffer: audio, ext: ".mp3" };
  }
  if (!audio || typeof audio !== "string") {
    throw new Error("No audio in webhook response");
  }

  const dataUrl = audio.match(
    /^data:audio\/(?:mpeg|mp3|wav|ogg|mp4|m4a)(?:;[^,]*)?;base64,(.+)$/is
  );
  if (dataUrl) {
    const mime = audio.slice(5, audio.indexOf(";")).toLowerCase();
    const ext =
      mime.includes("wav") ? ".wav" :
      mime.includes("ogg") ? ".ogg" :
      mime.includes("m4a") || mime.includes("mp4") ? ".m4a" :
      ".mp3";
    return { buffer: Buffer.from(dataUrl[1], "base64"), ext };
  }

  if (/^[A-Za-z0-9+/=\s]+$/.test(audio) && audio.replace(/\s/g, "").length > 256 && !/^https?:\/\//i.test(audio)) {
    return { buffer: Buffer.from(audio.replace(/\s/g, ""), "base64"), ext: ".mp3" };
  }

  if (/^https?:\/\//i.test(audio)) {
    return { url: audio, ext: guessExt(audio) };
  }

  throw new Error("Unsupported audio payload");
}

function guessExt(url) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.endsWith(".wav")) return ".wav";
    if (pathname.endsWith(".ogg")) return ".ogg";
    if (pathname.endsWith(".m4a")) return ".m4a";
  } catch {
    /* ignore */
  }
  return ".mp3";
}

async function materializeAudio(audio, tmpDir) {
  const decoded = decodeAudio(audio);
  const filePath = path.join(tmpDir, `speak${decoded.ext}`);

  if (decoded.buffer) {
    fs.writeFileSync(filePath, decoded.buffer);
    return filePath;
  }

  const res = await fetch(decoded.url);
  if (!res.ok) {
    throw new Error(`Could not download audio_url (HTTP ${res.status})`);
  }
  fs.writeFileSync(filePath, Buffer.from(await res.arrayBuffer()));
  return filePath;
}

function playWithPlaySound(filePath, tmpDir) {
  return new Promise((resolve, reject) => {
    const instance = playSound({ players: REAL_PLAYERS });

    if (instance.player) {
      const options = {};
      if (instance.player === "ffplay") {
        options.ffplay = ["-nodisp", "-autoexit", "-loglevel", "quiet"];
      }
      const child = instance.play(filePath, options, (err) => {
        if (err) reject(toError(err));
        else resolve();
      });
      if (!child) {
        reject(new Error("Unable to spawn audio player"));
      }
      return;
    }

    if (process.platform === "win32") {
      playWithWindowsMediaPlayer(filePath, tmpDir, resolve, reject);
      return;
    }

    reject(new Error("Couldn't find a suitable audio player"));
  });
}

function playWithWindowsMediaPlayer(filePath, tmpDir, resolve, reject) {
  const scriptPath = path.join(tmpDir, "play.ps1");
  fs.writeFileSync(scriptPath, PLAY_PS1, "utf8");

  const instance = playSound({ player: "powershell.exe" });
  const child = instance.play(
    filePath,
    {
      "powershell.exe": [
        "-STA",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
      ],
    },
    (err) => {
      if (err) reject(toError(err));
      else resolve();
    }
  );
  if (!child) {
    reject(new Error("Unable to spawn powershell audio player"));
  }
}

function cleanupTempDir(tmpDir) {
  if (!tmpDir) return;
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

/**
 * Write audio to os.tmpdir(), play it with play-sound, then delete the temp files.
 * Playback failures are reported and do not throw.
 */
async function playAudioUrl(audio) {
  let tmpDir = null;
  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "echodebug-"));
    const filePath = await materializeAudio(audio, tmpDir);
    process.stderr.write("EchoDebug: reading it aloud in this terminal…\n");
    await playWithPlaySound(filePath, tmpDir);
  } catch {
    console.error("Audio playback failed — see text diagnosis above");
  } finally {
    cleanupTempDir(tmpDir);
  }
}

module.exports = { playAudioUrl };
