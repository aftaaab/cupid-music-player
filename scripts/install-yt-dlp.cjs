#!/usr/bin/env node
/**
 * Download the platform-specific yt-dlp standalone binary into ./bin
 * so that `npm install` is the only setup step required for cloners.
 *
 * The bundled `yt-dlp-exec` package ships a Python zipapp that requires
 * Python 3.10+ and breaks on systems whose default `python3` is older
 * (notably macOS w/ Xcode's Python 3.9). The standalone binary has no
 * Python dependency.
 *
 * Failures here are non-fatal — npm install still succeeds. The app
 * surfaces a clear error at runtime if the binary is missing.
 */

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const BIN_DIR = path.join(__dirname, '..', 'bin');
const REPO = 'yt-dlp/yt-dlp';

function assetForPlatform() {
  const { platform, arch } = process;
  if (platform === 'darwin') {
    // Universal binary works on both Apple Silicon and Intel
    return { asset: 'yt-dlp_macos', outName: 'yt-dlp' };
  }
  if (platform === 'linux') {
    if (arch === 'arm64' || arch === 'aarch64') return { asset: 'yt-dlp_linux_aarch64', outName: 'yt-dlp' };
    if (arch === 'arm') return { asset: 'yt-dlp_linux_armv7l', outName: 'yt-dlp' };
    return { asset: 'yt-dlp_linux', outName: 'yt-dlp' };
  }
  if (platform === 'win32') {
    return { asset: 'yt-dlp.exe', outName: 'yt-dlp.exe' };
  }
  throw new Error(`Unsupported platform: ${platform}/${arch}`);
}

function httpsGet(url, accept = 'application/octet-stream') {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        'User-Agent': 'cupid-player-install-script',
        'Accept': accept,
      },
    };
    https.get(url, opts, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        res.resume();
        httpsGet(res.headers.location, accept).then(resolve, reject);
        return;
      }
      resolve(res);
    }).on('error', reject);
  });
}

function download(url, dest) {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await httpsGet(url);
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        return;
      }
      const tmp = `${dest}.partial`;
      const file = fs.createWriteStream(tmp);
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          fs.renameSync(tmp, dest);
          resolve();
        });
      });
      file.on('error', (err) => {
        try { fs.unlinkSync(tmp); } catch {}
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}

async function fetchLatestTag() {
  const res = await httpsGet(`https://api.github.com/repos/${REPO}/releases/latest`, 'application/vnd.github+json');
  if (res.statusCode !== 200) {
    throw new Error(`GitHub API returned ${res.statusCode}`);
  }
  let body = '';
  for await (const chunk of res) body += chunk;
  const data = JSON.parse(body);
  return data.tag_name;
}

async function main() {
  // Allow CI / advanced users to skip
  if (process.env.SKIP_YT_DLP_INSTALL === '1') {
    console.log('[install-yt-dlp] skipped (SKIP_YT_DLP_INSTALL=1)');
    return;
  }

  let { asset, outName } = assetForPlatform();
  const dest = path.join(BIN_DIR, outName);
  const stampFile = path.join(BIN_DIR, '.yt-dlp-version');

  // If a binary already exists and is recent, skip re-downloading.
  // Lets repeat installs / Docker rebuilds stay fast.
  try {
    const stat = fs.statSync(dest);
    const age = Date.now() - stat.mtimeMs;
    if (age < 14 * 24 * 60 * 60 * 1000) {
      console.log(`[install-yt-dlp] using cached binary at ${dest}`);
      return;
    }
  } catch {}

  fs.mkdirSync(BIN_DIR, { recursive: true });

  let tag = 'latest';
  try {
    tag = await fetchLatestTag();
  } catch (err) {
    console.warn(`[install-yt-dlp] couldn't resolve latest tag (${err.message}); falling back to /latest/download URL`);
  }

  const url = tag === 'latest'
    ? `https://github.com/${REPO}/releases/latest/download/${asset}`
    : `https://github.com/${REPO}/releases/download/${tag}/${asset}`;

  console.log(`[install-yt-dlp] downloading ${url}`);
  await download(url, dest);

  if (process.platform !== 'win32') {
    fs.chmodSync(dest, 0o755);
  }

  try { fs.writeFileSync(stampFile, tag); } catch {}

  console.log(`[install-yt-dlp] installed yt-dlp (${tag}) at ${dest}`);
}

main().catch((err) => {
  console.warn(`[install-yt-dlp] failed: ${err.message}`);
  console.warn('[install-yt-dlp] continuing — streaming features will be unavailable until yt-dlp is installed.');
  // Exit 0 so npm install doesn't fail
  process.exit(0);
});
