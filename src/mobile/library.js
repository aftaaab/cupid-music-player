/**
 * On-device song library for the mobile app.
 *
 * Songs picked with the file input are copied into the app's private storage
 * (Capacitor Filesystem, Directory.Data) together with a user-playlist.json,
 * mirroring the desktop app's audio/playlist.json format. Bundled songs and
 * user-added songs are merged by the shim's getLocalPlaylist().
 *
 * Metadata (title / artist / album / cover art) is read from the audio tags
 * via music-metadata-browser when possible, falling back to parsing
 * "Artist - Title.mp3" style filenames.
 */

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

const PLAYLIST_PATH = 'user-playlist.json';
const AUDIO_DIR = 'user-audio';
const ART_DIR = 'user-art';

// filename -> resolved playable URL, rebuilt on every loadUserPlaylist()
const audioUrlByFile = new Map();

async function toWebUrl(path) {
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Data });
  return Capacitor.convertFileSrc(uri);
}

async function readPlaylistRaw() {
  try {
    const res = await Filesystem.readFile({
      path: PLAYLIST_PATH,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    const parsed = JSON.parse(res.data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writePlaylistRaw(list) {
  await Filesystem.writeFile({
    path: PLAYLIST_PATH,
    directory: Directory.Data,
    encoding: Encoding.UTF8,
    data: JSON.stringify(list, null, 2),
  });
}

/** Load user-added songs with playable URLs resolved. */
export async function loadUserPlaylist() {
  const raw = await readPlaylistRaw();
  audioUrlByFile.clear();
  const out = [];
  for (const entry of raw) {
    try {
      const url = await toWebUrl(`${AUDIO_DIR}/${entry.file}`);
      audioUrlByFile.set(entry.file, url);
      let art = null;
      if (entry.artFile) {
        try { art = await toWebUrl(`${ART_DIR}/${entry.artFile}`); } catch { /* no art */ }
      }
      out.push({ ...entry, art, user: true });
    } catch {
      // file missing (cleared storage?) — skip silently
    }
  }
  return out;
}

/** Playable URL for a user-added song, or null if it's a bundled song. */
export function resolveUserAudio(filename) {
  return audioUrlByFile.get(filename) ?? null;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(file);
  });
}

function uint8ToBase64(data) {
  let bin = '';
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function fallbackFromFilename(name) {
  const stem = name.replace(/\.[^.]+$/, '').trim();
  const m = stem.match(/^(.*?)\s*[-–]\s*(.+)$/);
  if (m) return { artist: m[1].trim(), title: m[2].trim() };
  return { artist: '', title: stem };
}

async function extractTags(file) {
  try {
    const mm = await import('music-metadata-browser');
    const meta = await mm.parseBlob(file, { duration: false, skipCovers: false });
    const c = meta.common || {};
    let art = null;
    const pic = c.picture && c.picture[0];
    if (pic && pic.data && pic.data.length < 3_000_000) {
      const ext = (pic.format || 'image/jpeg').split('/').pop().replace('jpeg', 'jpg');
      art = { b64: uint8ToBase64(pic.data), ext };
    }
    return { title: c.title, artist: c.artist, album: c.album, art };
  } catch {
    return {};
  }
}

/** Copy picked files into app storage and append them to the user playlist. */
export async function addSongs(files, onProgress) {
  const list = await readPlaylistRaw();
  let done = 0;
  for (const file of files) {
    const safe =
      Date.now().toString(36) + '-' + file.name.replace(/[^\w.\- ()]+/g, '_');
    const b64 = await fileToBase64(file);
    await Filesystem.writeFile({
      path: `${AUDIO_DIR}/${safe}`,
      directory: Directory.Data,
      data: b64,
      recursive: true,
    });

    const tags = await extractTags(file);
    const fb = fallbackFromFilename(file.name);

    let artFile = null;
    if (tags.art) {
      artFile = `${safe}.${tags.art.ext}`;
      try {
        await Filesystem.writeFile({
          path: `${ART_DIR}/${artFile}`,
          directory: Directory.Data,
          data: tags.art.b64,
          recursive: true,
        });
      } catch {
        artFile = null;
      }
    }

    list.push({
      file: safe,
      title: tags.title || fb.title,
      artist: tags.artist || fb.artist,
      album: tags.album || '',
      artFile,
    });
    done += 1;
    onProgress?.(done, files.length);
  }
  await writePlaylistRaw(list);
  return list.length;
}

/** Remove a user-added song (audio file, art, and playlist entry). */
export async function removeSong(filename) {
  const list = await readPlaylistRaw();
  const entry = list.find((e) => e.file === filename);
  const rest = list.filter((e) => e.file !== filename);
  await writePlaylistRaw(rest);
  try {
    await Filesystem.deleteFile({ path: `${AUDIO_DIR}/${filename}`, directory: Directory.Data });
  } catch { /* already gone */ }
  if (entry?.artFile) {
    try {
      await Filesystem.deleteFile({ path: `${ART_DIR}/${entry.artFile}`, directory: Directory.Data });
    } catch { /* already gone */ }
  }
  audioUrlByFile.delete(filename);
}
