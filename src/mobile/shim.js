/**
 * Mobile / browser shim for the Electron `window.cupid` bridge.
 *
 * Loaded before App. If the Electron preload already defined window.cupid
 * (desktop), this does nothing. On Android (Capacitor WebView) or a plain
 * browser it provides equivalents:
 *   - local playlist + audio are served from the app bundle (Vite publicDir)
 *   - window controls / resize are no-ops (there is no frame to move)
 *   - streaming bridges reject with a clear message (they need the desktop
 *     Node/yt-dlp backend), so the UI shows a friendly error instead of hanging.
 */

import { tStatic } from '../i18n.js';

function notAvailable() {
  return Promise.reject(new Error(tStatic('desktopOnly')));
}

if (!window.cupid) {
  const base = new URL('.', window.location.href);

  window.cupid = {
    version: 'mobile',
    platform: 'android',

    // Frameless-window controls — meaningless on mobile
    minimize: () => {},
    maximize: () => {},
    close: () => {},
    resize: () => {},

    openExternal: (url) => {
      try { window.open(url, '_blank'); } catch { /* ignore */ }
    },

    setTheme: (theme) => {
      try { localStorage.setItem('cupid-native-theme', theme); } catch { /* ignore */ }
    },

    // ── Local library ─────────────────────────────────────────────
    // Bundled songs live at the web root (Vite publicDir = audio/);
    // user-added songs live in app storage via src/mobile/library.js.
    getLocalPlaylist: async () => {
      let bundled = [];
      try {
        const res = await fetch(new URL('playlist.json', base), { cache: 'no-store' });
        if (res.ok) {
          const parsed = await res.json();
          if (Array.isArray(parsed)) bundled = parsed;
        }
      } catch { /* no bundled playlist */ }
      try {
        const { loadUserPlaylist } = await import('./library.js');
        const user = await loadUserPlaylist();
        return [...bundled, ...user];
      } catch {
        return bundled;
      }
    },

    getLocalAudioPath: async (filename) => {
      try {
        const { resolveUserAudio } = await import('./library.js');
        const userUrl = resolveUserAudio(filename);
        if (userUrl) return userUrl;
      } catch { /* library unavailable */ }
      return new URL(encodeURIComponent(filename).replace(/%2F/g, '/'), base).href;
    },

    openMusicFolder: notAvailable,

    // ── Streaming bridges (desktop-only backend) ──────────────────
    getStreamUrl: notAvailable,
    getStreamUrlById: notAvailable,
    getAppleMusicToken: notAvailable,
    youtubeFetchPlaylist: notAvailable,
    youtubeOauthStart: notAvailable,
    youtubeOauthCancel: () => {},
  };

  document.documentElement.classList.add('cupid-mobile');

  // Keep the phone screen behaving like a fixed player window
  document.addEventListener('gesturestart', (e) => e.preventDefault());
}
