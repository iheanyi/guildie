# Guildie helper

Uploads what the Guildie addon (`apps/addon`) saves in game to guildie.club,
so your talents update as soon as you log out (or `/reload`), instead of
whenever Blizzard's data catches up.

It only reads one file, `WTF/Account/<account>/SavedVariables/Guildie.lua`
under your World of Warcraft folder. It doesn't touch the game, its memory or
your input.

## Using it (Windows)

Run `guildie-helper.exe`. It sits in the notification area (tray), no window:

- First run: it opens guildie.club in your browser with a code; sign in and
  click **Connect**. No token to copy.
- Tray menu: who you're connected as, the last upload, **Open Guildie**,
  **Upload now**, **Open log**, **Sign out** (disconnects this computer and
  forgets it), **Quit**. Left-click opens Guildie.

Settings and the log live in `%APPDATA%\guildie`. One helper runs at a time.

## Building

```sh
pnpm --filter @guildie/helper build:win        # on Windows: hidden console, exe icon
pnpm --filter @guildie/helper build:win-cross  # from macOS/Linux: hidden console, generic exe icon
pnpm --filter @guildie/helper dev              # run from source in the terminal (any OS)
pnpm --filter @guildie/helper test
```

Flags: `--api <url>` (another guildie: a preview or
`https://guildie.localhost:1355`; tokens are kept per site), `--wow <folder>`
(if your WoW folder isn't found; remembered), `--console` (terminal instead of
tray).

The tray is drawn by Windows' own PowerShell (`System.Windows.Forms`), so
nothing else ships. Built with Bun, so the .exe carries Bun's runtime
(~110 MB); a Go or Rust build would be ~5 MB if size matters later. The icon
comes from `scripts/make-icon.py`.
