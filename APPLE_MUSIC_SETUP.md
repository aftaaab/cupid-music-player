# Apple Music Integration Setup

This guide walks you through connecting Cupid Player to your Apple Music account. Audio is streamed via YouTube (using yt-dlp), so **an Apple Music subscription is not required for playback** — your account is only used to browse your library playlists.

## 1. Create a MusicKit Key

1. Go to [Apple Developer - Keys](https://developer.apple.com/account/resources/authkeys/list)
2. Click **+** to create a new key
3. Name it anything (e.g. "Cupid Player")
4. Check **MusicKit**
5. Click **Configure**, select your app ID (or create one)
6. Click **Continue** → **Register**
7. **Download the .p8 file** — you can only download it once
8. Note your **Key ID** (shown on the key page)

## 2. Get Your Team ID

1. Go to [Apple Developer - Membership](https://developer.apple.com/account#MembershipDetailsCard)
2. Copy your **Team ID**

## 3. Add Your Credentials

1. Place the `.p8` key file in the project root
2. Add to your `.env` file:
   ```
   APPLE_TEAM_ID=your_team_id
   APPLE_KEY_ID=your_key_id
   ```

## 4. Run the App

```bash
npm install
npm run dev
```

1. Click the settings icon in the player
2. Switch to **apple** in the music toggle
3. Click **log in** — Apple Music authorization will appear
4. Your library playlists will load — click any to play

## How It Works

Cupid Player uses MusicKit JS to authenticate with Apple Music and fetch your library playlists and track metadata. Audio is then streamed from YouTube via yt-dlp, which searches for matching tracks automatically.

## Requirements

- Apple Developer account ($99/year) for the MusicKit key
- Apple Music subscription is **not** required for playback

## Troubleshooting

### `No Apple Music developer token`

Check that your `.env` has `APPLE_TEAM_ID` and `APPLE_KEY_ID` set, and that the `.p8` file is in the project root.

### `MusicKit JS timed out`

The MusicKit script failed to load. Check your internet connection and try again.

### Login popup doesn't appear

Make sure your Apple Developer account has MusicKit enabled for your key.
