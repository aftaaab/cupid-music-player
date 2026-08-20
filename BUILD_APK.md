# Cupid Player — Android APK build guide

The app has been converted to a Capacitor Android project. The exact same
renderer (same pixel-art frames, animations, themes, star ratings, everything)
runs inside the APK's WebView. The `android/` folder in this project is the
complete native app, ready to compile.

## Step 0 — Put her songs in (important!)

The repo's `audio/playlist.json` lists 15 songs, but the MP3 files themselves
are not in the repo. The APK bundles whatever is in `audio/` at build time, so
before building:

1. Copy the MP3 files into the `audio/` folder, with filenames exactly matching
   the `"file"` entries in `audio/playlist.json`
   (e.g. `Lovers Rock.mp3`, `Pluto Projector.mp3`, ...).
   - If you've been running the packaged desktop app, they live in the app-data
     folder: on Windows `%APPDATA%\cupid-player\audio\`, on macOS
     `~/Library/Application Support/cupid-player/audio/`.
   - If you run from source in dev mode, they're already in `audio/`.
2. To add/remove songs later, edit `audio/playlist.json` the same way as on
   desktop, then rebuild.

## Option A — GitHub Actions (no tools needed, easiest)

1. Push this whole folder to a **private** GitHub repository (private, since it
   will contain the MP3 files).
2. The included workflow (`.github/workflows/build-apk.yml`) runs
   automatically. Open the repo's **Actions** tab, wait ~5 minutes.
3. Open the finished run and download the **cupid-player-apk** artifact —
   inside is `app-debug.apk`.
4. Send it to her phone (Drive, Telegram, USB...), tap it, allow
   "install from unknown sources", done.

## Option B — Android Studio (local build)

1. Install [Android Studio](https://developer.android.com/studio) and Node.js.
2. In this folder:
   ```bash
   npm install --ignore-scripts
   npx vite build
   npx cap sync android
   ```
3. `npx cap open android` (opens the project in Android Studio).
4. Menu: **Build → Build App Bundles / APK(s) → Build APK(s)**.
5. APK lands in `android/app/build/outputs/apk/debug/app-debug.apk`.

## Option C — Pure command line

Same as B, but instead of Android Studio's UI:
```bash
cd android && ./gradlew assembleDebug
```
(Requires `ANDROID_HOME` pointing at an installed Android SDK, API 34+.)

## Rebuilding after changing songs or code

```bash
npx vite build && npx cap sync android
```
then rebuild the APK (push to GitHub for Option A, or Build APK again).

## What changed vs. the desktop app

- **Full Spanish translation with a language toggle.** Settings has an
  "idioma / language" row (english / español). Every label, button, tooltip,
  error message, and confirmation dialog is translated — Latin-American /
  Peruvian conventions (tú, "agregar"). On first launch the app follows the
  phone's system language, so on her phone it opens in Spanish automatically;
  the toggle overrides and remembers her choice. Works on desktop too.
- **She can add her own songs from the phone.** In settings → music → local,
  a "+ add songs" button opens the Android file picker (multi-select). Picked
  songs are copied into the app's private storage, their title / artist /
  album / cover art are read from the audio tags automatically (with a
  "Artist - Title.mp3" filename fallback), and they appear alongside the
  bundled playlist. Tapping a song in the added-songs list removes it (with a
  confirmation). No rebuild ever needed for her to change her library.
- **Two new themes, four total.** Alongside pink and blue: **bts 💜** — a
  full borahae-purple colorway of every frame, button, record, and needle
  animation, with floating pixel purple hearts and twinkling sparkles while
  music plays; and **love ♡** — a warm valentine love-letter colorway with
  drifting pixel hearts and a soft heartbeat glow pulsing behind the room.
  The ambient hearts fade in only during playback and never block the
  controls. Both themes work on the desktop Electron app too.
  (Note: the BTS theme is built around the fandom's signature purple /
  borahae identity rather than official band imagery, which is licensed.)
- `src/mobile/shim.js` — replaces the Electron `window.cupid` bridge on
  Android: bundled playlist + audio are served from the app bundle, and
  user-added songs from app storage. On desktop it's a no-op, so the
  Electron app still works exactly as before.
- `src/mobile/mobile.css` — keeps the 306:497 player frame aspect on any phone,
  hides the minimize/maximize/close buttons and window-resize handles (there's
  no window frame on Android).
- Local playback, playlists, all four themes, animations, star ratings —
  all work identically.
- Spotify / Apple Music / YouTube streaming are desktop-only: they depend on
  the Electron main process (yt-dlp / youtubei.js stream resolution, loopback
  OAuth servers, Apple developer-token signing). On mobile those settings show
  a friendly "needs the desktop app" message instead of hanging.

## Performance & battery (audit results)

- **~75% fewer UI re-renders during playback.** Progress/clock state now only
  updates when the visible second or a perceptible slice of the progress bar
  changes, instead of on every raw `timeupdate` event (~4/s), in both the
  local and streaming players.
- **Playback-aware background behavior.** The app reports play/pause to the
  native layer (`window.CupidNative`). While music plays in the background the
  WebView stays alive (audio + lock-screen controls keep working); the moment
  it's paused — including from the lock screen — the WebView and all JS timers
  are fully suspended, so an idle backgrounded app uses ~no CPU or battery.
- **Theme animations halt when paused.** The hearts/sparkles/heartbeat overlay
  stops compositing entirely while music is stopped, and is disabled outright
  for users with reduced-motion enabled.
- **Only one Android permission** (INTERNET, for streaming album art). No
  wakelocks — Android's audio pipeline keeps the device awake only while
  sound is actually playing.
- Mixed (non-HTTPS) content is disabled; heavy metadata-parsing code loads
  as a lazy chunk only when the file picker is first used; no overscroll
  rubber-banding or long-press text selection, so it feels native.

## Notes

- The APK is a *debug*-signed build — installs fine on her phone, it just
  can't go on the Play Store as-is. For a signed release build, generate a
  keystore in Android Studio (**Build → Generate Signed App Bundle/APK**).
- App ID: `com.cupid.player`, name: **Cupid Player**. Change both in
  `capacitor.config.json` (then `npx cap sync android`).
- **Background playback & lock-screen controls are built in.** Music keeps
  playing with the screen locked or the app backgrounded (`MainActivity.java`
  keeps the WebView alive), and the Media Session integration in
  `src/useAudioPlayer.js` puts the track title, artist, and album art on the
  lock screen / notification shade with working play/pause/next/previous
  buttons. Bluetooth and headphone media buttons work too — and on desktop
  this same change gives the Electron app media-key support.
- Very aggressive battery-saver modes (some Xiaomi/Huawei phones) can still
  kill background apps; if that happens, exempt Cupid Player from battery
  optimization in Android settings.
