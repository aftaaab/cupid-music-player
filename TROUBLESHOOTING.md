# Troubleshooting

## Electron binary won't install (`npm run dev` fails)

Symptoms — any of these when running `npm run dev`:

```
Error: ENOENT ... node_modules/electron/path.txt
Error: Electron failed to install correctly, please delete node_modules/electron and try installing again
```

**Cause:** a too-new Node version. Electron downloads its prebuilt binary fine but
then fails to *extract* it, so `node_modules/electron/dist/` and `path.txt` are
never created. This is most common on Windows when you installed the "latest"
Node instead of the LTS.

### Step 0 — diagnose

**Check your Node version** (this is the usual culprit):

```bash
node --version
```

If it's **25 or higher**, that's almost certainly the problem — jump to Fix 2.
The app is tested on Node 24.x LTS.

**Confirm the binary is actually missing.** These should all exist; if any is
absent, Electron isn't installed:

- **Windows (PowerShell):**
  ```powershell
  Test-Path node_modules\electron\path.txt          # should be True
  Test-Path node_modules\electron\dist\electron.exe # should be True
  ```
- **macOS / Linux:**
  ```bash
  cat node_modules/electron/path.txt                              # prints the exe path
  ls node_modules/electron/dist                                   # should list Electron.app / electron
  ```

### Fix 1 — re-run setup (try this first)

```bash
npm run setup
```

`setup` now auto-repairs this: it clears the download cache, reinstalls Electron,
and — if extraction still fails — **extracts the cached binary itself and writes
`path.txt` for you**. In most cases this is all you need.

Verify it worked (re-run the Step 0 checks, or just):

```bash
npm run dev
```

### Fix 2 — use Node 24 LTS (the real cure)

The cleanest fix is to stop using bleeding-edge Node:

1. Install **Node 24.x LTS** (e.g. via [nvm](https://github.com/nvm-sh/nvm),
   [nvm-windows](https://github.com/coreybutler/nvm-windows), or nodejs.org).
2. Confirm you're now on 24.x:
   ```bash
   node --version    # should print v24.x.x
   ```
3. Delete `node_modules` and reinstall:
   ```bash
   rm -rf node_modules        # Windows PowerShell: rmdir /s /q node_modules
   npm run setup
   ```

### Fix 3 — extract the binary by hand

If you can't change Node and `npm run setup` still can't finish, do exactly what
the setup script automates. You're unzipping the Electron binary into place and
writing the one-line `path.txt` that tells Electron where it lives.

**1. Make sure the binary zip is cached.** Run Electron's own installer once — it
will download the zip even if it can't extract it:

```bash
node node_modules/electron/install.js
```

**2. Find the cached zip.** It's named
`electron-v<version>-<platform>-<arch>.zip` (e.g.
`electron-v33.4.11-win32-x64.zip`) inside the Electron cache. Run the matching
command — it both locates and prints the path you'll use next:

- **Windows (PowerShell):**
  ```powershell
  Get-ChildItem "$env:LOCALAPPDATA\electron\Cache" -Recurse -Filter "electron-v*.zip" | Select-Object FullName
  ```
- **macOS / Linux:**
  ```bash
  find ~/Library/Caches/electron ~/.cache/electron -name 'electron-v*.zip' 2>/dev/null
  ```

If nothing prints, the download itself failed (network/firewall/antivirus) — the
zip never arrived, so go back to Step 1 or Fix 2.

| OS      | Cache location                                              |
| ------- | ---------------------------------------------------------- |
| Windows | `%LOCALAPPDATA%\electron\Cache\` (check the sub-folders)   |
| macOS   | `~/Library/Caches/electron/`                               |
| Linux   | `~/.cache/electron/`                                        |

**3. Extract it into `node_modules/electron/dist/`.**

- **Windows (PowerShell):**
  ```powershell
  $zip = (Get-ChildItem "$env:LOCALAPPDATA\electron\Cache" -Recurse -Filter "electron-v*-win32-*.zip" | Select-Object -First 1).FullName
  Expand-Archive -Path $zip -DestinationPath "node_modules\electron\dist" -Force
  ```
- **macOS / Linux:**
  ```bash
  ZIP=$(find ~/Library/Caches/electron ~/.cache/electron -name 'electron-v*.zip' 2>/dev/null | head -1)
  rm -rf node_modules/electron/dist && mkdir -p node_modules/electron/dist
  unzip -o "$ZIP" -d node_modules/electron/dist
  ```

Verify the executable is now there:

```bash
# Windows (PowerShell): Test-Path node_modules\electron\dist\electron.exe   -> True
ls node_modules/electron/dist     # macOS: Electron.app   Linux: electron
```

**4. Create `node_modules/electron/path.txt`** containing just the path to the
executable for your OS:

| OS      | Contents of `path.txt`                  |
| ------- | --------------------------------------- |
| Windows | `electron.exe`                          |
| macOS   | `Electron.app/Contents/MacOS/Electron`  |
| Linux   | `electron`                              |

- **Windows (PowerShell):**
  ```powershell
  "electron.exe" | Out-File -NoNewline -Encoding ascii "node_modules\electron\path.txt"
  ```
- **macOS:**
  ```bash
  printf 'Electron.app/Contents/MacOS/Electron' > node_modules/electron/path.txt
  ```
- **Linux:**
  ```bash
  printf 'electron' > node_modules/electron/path.txt
  ```

Confirm `path.txt` points at a file that actually exists:

```bash
# macOS / Linux — should print "OK"
test -e "node_modules/electron/dist/$(cat node_modules/electron/path.txt)" && echo OK || echo MISSING
```

**5. Start the app:**

```bash
npm run dev
```

### Fix 3b — Windows: extract with File Explorer (no command line)

If the PowerShell/`tar` unzip leaves `dist/` with **only `LICENSES.chromium.html`
and no `electron.exe`**, Windows' own "Extract All" succeeds where the
programmatic unzip doesn't. This is the most reliable route on Windows.

1. **Find the cached zip's folder.** In a terminal:
   ```bash
   # Git Bash:
   find "$LOCALAPPDATA/electron/Cache" -name 'electron-v*.zip' 2>/dev/null
   ```
   ```powershell
   # PowerShell:
   Get-ChildItem "$env:LOCALAPPDATA\electron\Cache" -Recurse -Filter "electron-v*.zip" | Select-Object FullName
   ```
   It prints something like
   `C:\Users\<you>\AppData\Local\electron\Cache\<long-hash>\electron-v33.4.11-win32-x64.zip`.
2. Open **File Explorer**, paste the `<long-hash>` folder path into the **address
   bar**, and press Enter.
3. Right-click **`electron-v33.4.11-win32-x64.zip`** → **Extract All…**
4. When it asks where to extract, **clear the suggested box** and paste your
   project's dist folder exactly, e.g.:
   ```
   C:\path\to\cupid-music-player\node_modules\electron\dist
   ```
5. Click **Extract**. If prompted, choose **Replace the files in the destination**
   (this overwrites the stray `LICENSES.chromium.html`).
6. Create `path.txt` — pick the command for the shell you're in:
   ```bash
   # Git Bash:
   printf 'electron.exe' > node_modules/electron/path.txt
   ```
   ```powershell
   # PowerShell:
   Set-Content -Path node_modules\electron\path.txt -Value "electron.exe" -NoNewline
   ```
7. Verify and run:
   ```bash
   ls node_modules/electron/dist/electron.exe   # PowerShell: dir node_modules\electron\dist\electron.exe
   npm run dev
   ```

### Windows shell gotchas

These trip people up while following the steps above:

- **`Get-ChildItem` / `Set-Content` / `Test-Path` "command not found"** → you're in
  **Git Bash**, not PowerShell. Either use the Git Bash command shown for that
  step, or type `powershell` (then Enter) to drop into PowerShell in the same
  folder.
- **`bash: ... command not found` for PowerShell commands** → same thing in
  reverse; you're in Git Bash. Backslash paths also get mangled there
  (`node_modules\electron\install.js` → `node_moduleselectroninstall.js`) — use
  **forward slashes** in Git Bash: `node node_modules/electron/install.js`.
- **`npm : ... npm.ps1 ... script execution is disabled on this system`** (a.k.a.
  `UnauthorizedAccess` / execution policy) → PowerShell is blocking npm's script.
  Easiest fix: run `npm run dev` from **Git Bash** instead. Or allow it for your
  user once:
  ```powershell
  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned   # answer Y
  ```
- **`electron.exe` keeps disappearing right after you extract it** → antivirus is
  quarantining the unsigned binary. Add a folder exclusion (Windows Security →
  Virus & threat protection → Manage settings → Exclusions → Add → Folder → your
  project folder), then extract again.

---

## yt-dlp binary missing (streaming doesn't work)

Streaming (Spotify/Apple/YouTube audio) is powered by a `yt-dlp` binary in `./bin`.
Its download is non-fatal, so `npm install` can succeed without it.

**Check whether it's there and working:**

```bash
# Windows (PowerShell): .\bin\yt-dlp.exe --version
./bin/yt-dlp --version      # should print a date-like version, e.g. 2026.03.17
```

If that errors or the file is missing, re-fetch it:

```bash
npm run setup
```

If that still can't get it (e.g. no network access to GitHub), download the
standalone binary for your OS from
[yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases) into `./bin`:

- Windows → `yt-dlp.exe`
- macOS → `yt-dlp_macos`, renamed to `yt-dlp` (then `chmod +x bin/yt-dlp`)
- Linux → `yt-dlp_linux`, renamed to `yt-dlp` (then `chmod +x bin/yt-dlp`)

---

## YouTube: "Sign in to confirm you're not a bot"

YouTube sometimes blocks a machine and demands proof you're a real person.
It's common on VPNs, shared/college networks, or after heavy use. The fix is
to let the app borrow your normal signed-in YouTube session, using "cookies"
from a browser where you're already logged into YouTube.

There are two ways. **Try Option A first — it's one line.** Only use Option B
if A doesn't work.

### Option A: let the app read your browser (easiest)

1. Open your normal browser and make sure you're **signed in to youtube.com**.
2. **Fully close that browser** — every window. (It locks its cookie file
   while open, so the app can't read it.)
3. Open the `.env` file in the project folder with Notepad. Add ONE line at
   the bottom, matching the browser you use:

   ```bash
   YTDLP_COOKIES_FROM_BROWSER=chrome
   ```

   Replace `chrome` with whichever you use: `edge`, `firefox`, `brave`, or
   `safari`. (Firefox is the only one you don't have to close.)
4. Save the file and restart the app (close it and run `npm run dev` again).

That's usually it. If YouTube still blocks you, do Option B.

### Option B: export a cookies file (if A fails)

Some Chrome/Edge versions encrypt their cookies so the app can't read them.
In that case, export the cookies to a file yourself:

1. In Chrome or Edge, install the extension **"Get cookies.txt LOCALLY"**
   from the Chrome Web Store. (Make sure it says **LOCALLY** — the one
   without it was pulled for being unsafe.)
2. Go to **youtube.com** and make sure you're signed in.
3. Click the extension icon → **Export** / **Download**. It saves a file
   named `cookies.txt` (probably in your Downloads folder).
4. In the project's `.env` file, add ONE line pointing at that file. Use the
   **full path**, and on Windows use forward slashes `/`:

   ```bash
   YTDLP_COOKIES=C:/Users/TSM/Downloads/cookies.txt
   ```

5. Save and restart the app.

> **One safety note:** these cookies are a key to your YouTube/Google account
> while they're valid. The file and your `.env` never leave your computer —
> the app doesn't upload them anywhere — but if you'd rather not risk your
> main account, sign into a spare Google account in step 1 and use that one's
> cookies instead.

### Still blocked?

Make sure yt-dlp itself is up to date — YouTube changes its defenses often and
yt-dlp ships fixes quickly:

```bash
npm run setup              # re-fetches the latest yt-dlp
./bin/yt-dlp --version     # Windows: .\bin\yt-dlp.exe --version
```

---

## YouTube: "Requested format is not available"

Different from the bot error above. Current yt-dlp has to run YouTube's player
JavaScript to unlock the real audio formats; without a JavaScript runtime it
falls back to a stripped result with no audio and fails with this message.

The app handles this automatically by telling yt-dlp to use **Node** (which you
already have — it's what runs the app), so a normal source checkout just works
after `git pull`. You only need to act if you still see this error:

- **Make sure Node is findable.** In the same terminal you run the app from:
  ```bash
  node --version            # should print v18+ — if "not recognized", reinstall Node
  ```
  Node must be on your `PATH` (it is if `npm run dev` works). If it lives
  somewhere unusual, point yt-dlp straight at it by adding this to `.env`:
  ```bash
  # Windows example — use the full path to your node.exe, forward slashes
  YTDLP_NODE_PATH=C:/Program Files/nodejs/node.exe
  ```
- **Or install Deno** (yt-dlp's built-in default) from <https://deno.com> if you
  prefer not to rely on Node.

---

## Spotify logs in but no playlists show

Sometimes the first login glitches before playlists load. Stop the app and
restart it:

1. In the terminal running the app, press **Ctrl + C** to quit.
2. Start it again:
   ```bash
   npm run dev
   ```

Log in once more — your playlists should appear. If they still don't, double-check
your `.env` Client ID and that you added yourself under **Settings > User
Management** in the Spotify dashboard (see [SPOTIFY_SETUP.md](SPOTIFY_SETUP.md)).
Remember Spotify also requires the developer account to have **Premium** as of
Feb 2026, or the API returns 403.
