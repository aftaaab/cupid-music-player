# YouTube Integration Setup

Cupid Player supports two YouTube paths:

1. **Public playlist URLs** — paste any YouTube playlist link. **No sign-in, no API key, no subscription.** This works out of the box with no setup at all.
2. **Your own playlists** — sign in with Google so the app can list the playlists on your account. Free quota via the YouTube Data API. **No YouTube Premium required**, on your account or the developer account.

Audio in both modes streams via yt-dlp (the same path used for Spotify and Apple Music tracks).

> **UI note:** the URL-paste box and the sign-in flow are mutually exclusive in the settings panel. If `VITE_YOUTUBE_CLIENT_ID` is set in `.env`, only the sign-in flow shows. If it's not set, only the URL-paste box shows. Pick one path based on your needs.

## 1. Public playlist URLs — zero setup

Open Cupid Player, click the settings icon, pick **youtube** from the music dropdown, and paste a playlist URL into the box. Hit `load playlist`. That's it.

Recognised formats:
- `https://www.youtube.com/playlist?list=PL...`
- `https://music.youtube.com/playlist?list=PL...`
- `https://youtu.be/<videoId>?list=PL...`
- A bare playlist ID (e.g. `PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf`)

The playlist must be public or unlisted — fully private playlists won't load via this path. Use the OAuth flow below for those.

## 2. Sign-in flow (browse your own playlists)

This needs a one-time setup of a Google OAuth client. **It's free** — YouTube Data API v3 has a 10,000-units/day quota on the free tier, far more than this app uses. No subscription gate, no billing required.

### Create the OAuth client

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or pick an existing one).
3. In **APIs & Services > Library**, search for **YouTube Data API v3** and enable it.
4. In **APIs & Services > OAuth consent screen**:
   - User type: **External**
   - Fill in the required app name, support email, developer contact email
   - Scopes: add `https://www.googleapis.com/auth/youtube.readonly`
   - **Test users: add the Google account you'll sign in with.** Apps in "Testing" status only allow listed test users — sign-in attempts from any other account get rejected with `Error 403: access_denied`. This is the most common setup snag.
5. In **APIs & Services > Credentials**, click **Create Credentials > OAuth client ID**:
   - Application type: **Desktop app**
   - Name: anything (e.g. "Cupid Player")
6. Copy the **Client ID** and **Client secret** from the dialog.

> **About the client secret:** Google issues one even for Desktop app clients. It's not actually confidential — Google's own [native-app guidance](https://developers.google.com/identity/protocols/oauth2/native-app) explains that the secret is bundled in installed apps and PKCE is what protects the flow. It's safe to put in your local `.env`.

### Add the credentials to `.env`

Create or edit `.env` in the project root:

```
VITE_YOUTUBE_CLIENT_ID=your-client-id.apps.googleusercontent.com
VITE_YOUTUBE_CLIENT_SECRET=your-client-secret
```

Restart `npm run dev` so Vite picks up the new env vars.

### Sign in

In the app: settings → pick **youtube** from the music dropdown → **log in with google**.

The app will open your **default system browser** to Google's consent page. (Google blocks OAuth inside Electron's embedded view, which is why we punt to the system browser.)

Because the app is in "Testing" status, Google will show a yellow **"Google hasn't verified this app"** warning page even for test users. This is normal — click **Advanced** at the bottom-left, then **Go to cupid-player (unsafe)**. The "(unsafe)" wording is scary but is just Google's stock text for unverified apps; you're the developer, so it's your own app.

After approving the scope, the browser shows a confirmation page and the app lists your playlists. A "Liked Videos" entry is included automatically.

> **Newly created playlists:** the app fetches your playlists once at login. If you create a new playlist on YouTube after signing in, hit the **refresh** button in the settings panel to re-fetch. There's a brief propagation delay on Google's side (usually seconds, sometimes a minute).

## How it works

- **URL paste path:** the main process runs `yt-dlp --flat-playlist --dump-single-json <url>` to extract the playlist's video IDs and titles. No network call to YouTube from the renderer.
- **OAuth path:** the renderer holds a Google access token in `localStorage`, calls `playlists.list?mine=true` and `playlistItems.list` against the YouTube Data API. Tokens refresh automatically on expiry. The loopback HTTP server in the main process catches the redirect on a random `http://127.0.0.1:<port>` (Google's "Loopback IP" flow for installed apps).
- **Playback:** in both paths, the player already knows the YouTube video ID for each track, so it skips the YouTube-search step and goes straight to `yt-dlp -g <video URL>` to grab the stream. This makes YouTube playlists faster to play than Spotify/Apple tracks (which need a search to find the matching video).

## Troubleshooting

### `Error 403: access_denied` on the Google sign-in page
> *"cupid-player has not completed the Google verification process. The app is currently being tested..."*

The Google account you tried to sign in with isn't on the **Test users** list of your OAuth consent screen. Open the [OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent) in Google Cloud Console (correct project selected), scroll to **Test users**, click **+ Add users**, add your email, save. Then try logging in again.

You can add up to 100 test users without going through Google's app verification.

### Yellow "Google hasn't verified this app" warning when signing in
Expected — your app is in "Testing" status. Click **Advanced** at the bottom-left, then **Go to cupid-player (unsafe)**. Safe to bypass because it's your own app; the "unsafe" copy is generic.

### Playlist plays back as silence / `502 Bad Gateway` from `cupid-audio://`
The main process couldn't extract the audio stream from YouTube. Check the terminal where you ran `npm run dev` for a `[cupid-audio]` log line — that's the actual error.

Most common cause: **yt-dlp binary missing or broken**. The fix path:

1. Look for `bin/yt-dlp` (macOS/Linux) or `bin\yt-dlp.exe` (Windows) in the project root. It should exist after `npm install` — `scripts/install-yt-dlp.cjs` downloads it during postinstall.
2. If missing, re-run install: `npm install` (or run the script directly: `node scripts/install-yt-dlp.cjs`).
3. Confirm the binary works: `./bin/yt-dlp --version`. If you see a Python `ImportError: You are using an unsupported version of Python` message, your install picked up the old `yt-dlp-exec` package somehow — delete `bin/` and `node_modules/`, then `npm install` again.

If the binary is fine, **YouTube changed something** and yt-dlp needs an update — re-run `node scripts/install-yt-dlp.cjs` to grab the latest release.

### Sign-in button hangs at "waiting for browser..."
The local callback server times out after 5 minutes. If you closed the browser without approving, restart by hitting **log in with google** again. If it persists, restart the app.

### Playlists area appears empty after signing in
Two things to try:
1. **Scroll inside the settings panel** — with several long sections, the playlist list can be below the visible area. Open DevTools (Cmd+Shift+I), `console.log` will tell you what the Data API returned.
2. **Check the right account is signed in.** If you have multiple YouTube channels (e.g. brand accounts), OAuth resolves to the default channel. Playlists are scoped per channel.

### `Token exchange failed (400): invalid_grant`
The auth code expired (5-minute window). Try logging in again.

### `Token exchange failed (401): unauthorized_client`
`VITE_YOUTUBE_CLIENT_ID` or `VITE_YOUTUBE_CLIENT_SECRET` don't match what's in Google Cloud Console, or the client type isn't **Desktop app**. Double-check both, then restart `npm run dev`.

### `YouTube API 403: quotaExceeded`
You've hit the free 10,000-units/day quota — extremely unlikely for personal use. Wait until midnight Pacific Time or request a quota increase in the console.
