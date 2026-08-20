import { useState, useCallback } from 'react';

/**
 * Tiny i18n layer — no dependencies, two locales.
 * Spanish strings use Peruvian/Latin-American conventions (tú, "agregar").
 * Brand names (cupid player, spotify, apple, youtube, bts) stay untranslated,
 * and "local" is the same word in both languages.
 */

const STRINGS = {
  en: {
    theme: 'theme',
    music: 'music',
    language: 'language',
    reload: 'reload',
    addSongs: '+ add songs',
    adding: 'adding\u2026',
    tapToRemove: 'tap to remove',
    confirmRemove: 'remove "{title}"?',
    addSongsError: "couldn't add songs: {msg}",
    removeSongError: "couldn't remove song: {msg}",
    login: 'log in',
    logout: 'logout',
    refresh: 'refresh',
    loginWithGoogle: 'log in with google',
    waitingForBrowser: 'waiting for browser...',
    pastePlaylistLink: 'paste a youtube playlist link',
    loadPlaylist: 'load playlist',
    loading: 'loading...',
    noPlaylists: 'no playlists found',
    playlistEmpty: 'Playlist is empty',
    playlistEmptyOrPrivate: 'Playlist is empty or private',
    badYoutubeUrl: 'Not a recognised YouTube playlist URL',
    noTrack: 'No track',
    by: 'by',
    themePink: 'pink',
    themeBlue: 'blue',
    themePurple: 'bts \u{1F49C}',
    themeLove: 'love \u2661',
    modeNormal: 'normal',
    modeShuffle: 'shuffle',
    modeRepeat: 'repeat',
    desktopOnly: 'This feature needs the desktop app',
    audioPlayError: "can't play — {msg}",
    queue: 'up next',
    lastCrash: 'the app crashed last time — {msg}',
  },
  es: {
    theme: 'tema',
    music: 'm\u00fasica',
    language: 'idioma',
    reload: 'recargar',
    addSongs: '+ agregar canciones',
    adding: 'agregando\u2026',
    tapToRemove: 'toca para quitar',
    confirmRemove: '\u00bfquitar "{title}"?',
    addSongsError: 'no se pudieron agregar las canciones: {msg}',
    removeSongError: 'no se pudo quitar la canci\u00f3n: {msg}',
    login: 'iniciar sesi\u00f3n',
    logout: 'cerrar sesi\u00f3n',
    refresh: 'actualizar',
    loginWithGoogle: 'iniciar sesi\u00f3n con google',
    waitingForBrowser: 'esperando al navegador...',
    pastePlaylistLink: 'pega un enlace de playlist de youtube',
    loadPlaylist: 'cargar playlist',
    loading: 'cargando...',
    noPlaylists: 'no se encontraron playlists',
    playlistEmpty: 'La playlist est\u00e1 vac\u00eda',
    playlistEmptyOrPrivate: 'La playlist est\u00e1 vac\u00eda o es privada',
    badYoutubeUrl: 'No es un enlace v\u00e1lido de playlist de YouTube',
    noTrack: 'Sin canci\u00f3n',
    by: 'de',
    themePink: 'rosa',
    themeBlue: 'azul',
    themePurple: 'bts \u{1F49C}',
    themeLove: 'amor \u2661',
    modeNormal: 'normal',
    modeShuffle: 'aleatorio',
    modeRepeat: 'repetir',
    desktopOnly: 'Esta funci\u00f3n necesita la app de escritorio',
    audioPlayError: 'no se puede reproducir — {msg}',
    queue: 'a continuaci\u00f3n',
    lastCrash: 'la app se cerr\u00f3 la \u00faltima vez — {msg}',
  },
};

const STORAGE_KEY = 'cupid-player-lang';

export function getLang() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && STRINGS[stored]) return stored;
  } catch { /* localStorage unavailable */ }
  // Default to the device language so it opens in Spanish on her phone
  try {
    if ((navigator.language || '').toLowerCase().startsWith('es')) return 'es';
  } catch { /* no navigator */ }
  return 'en';
}

function format(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : `{${k}}`));
}

/** Translate outside React (e.g. the mobile shim). Reads the language live. */
export function tStatic(key, vars) {
  const lang = getLang();
  return format(STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key, vars);
}

/** React hook: `{ lang, setLang, t }` */
export function useI18n() {
  const [lang, setLangState] = useState(getLang);

  const setLang = useCallback((next) => {
    if (!STRINGS[next]) return;
    setLangState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  }, []);

  const t = useCallback(
    (key, vars) => format(STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key, vars),
    [lang],
  );

  return { lang, setLang, t };
}
