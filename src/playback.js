const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const playSound = require("play-sound");

function decodeAudioUrl(audioUrl) {
  if (!audioUrl || typeof audioUrl !== "string") {
    throw new Error("No audio_url in webhook response");
  }

  const dataUrl = audioUrl.match(/^data:audio\/(?:mpeg|mp3)(?:;[^,]*)?;base64,(.+)$/is);
  if (dataUrl) {
    return { buffer: Buffer.from(dataUrl[1], "base64"), ext: ".mp3" };
  }

  return { url: audioUrl, ext: guessExt(audioUrl) };
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

async function materializeAudio(audioUrl) {
  const decoded = decodeAudioUrl(audioUrl);
  const mp3Path = path.join(os.tmpdir(), `echodebug-speak${decoded.ext}`);

  if (decoded.buffer) {
    fs.writeFileSync(mp3Path, decoded.buffer);
    return mp3Path;
  }

  const res = await fetch(decoded.url);
  if (!res.ok) {
    throw new Error(`Could not download audio_url (HTTP ${res.status})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(mp3Path, buf);
  return mp3Path;
}

function playWithPlaySound(filePath) {
  return new Promise((resolve, reject) => {
    const player = playSound({});
    player.play(filePath, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function playMp3Windows(mp3Path) {
  const abs = path.resolve(mp3Path).replace(/'/g, "''");
  const ps = `
Add-Type -AssemblyName PresentationCore
$player = New-Object System.Windows.Media.MediaPlayer
$player.Open([Uri]'${abs}')
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

  const r = spawnSync(
    "powershell.exe",
    ["-STA", "-NoProfile", "-NonInteractive", "-Command", ps],
    { stdio: "inherit" }
  );
  return r.status === 0;
}

function playMp3Ffplay(mp3Path) {
  const r = spawnSync(
    "ffplay",
    ["-nodisp", "-autoexit", "-loglevel", "quiet", mp3Path],
    { stdio: "ignore" }
  );
  return r.status === 0;
}

async function playAudioUrl(audioUrl) {
  const filePath = await materializeAudio(audioUrl);
  process.stderr.write("EchoDebug: reading it aloud in this terminal…\n");

  try {
    await playWithPlaySound(filePath);
    return;
  } catch {
    /* fall through to local players */
  }

  if (playMp3Ffplay(filePath)) return;
  if (process.platform === "win32" && playMp3Windows(filePath)) return;

  throw new Error(
    "Could not play audio. Install ffmpeg (ffplay) or another player that play-sound supports."
  );
}

module.exports = { playAudioUrl };
