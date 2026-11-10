# guildie helper

Uploads what the guildie addon (`apps/addon`) saves in game to guildie.club,
so your talents update after a `/reload` instead of only after you log out.

It only reads one file: `WTF/Account/<account>/SavedVariables/Guildie.lua`
under your World of Warcraft folder, which the game writes on `/reload` and
logout. It doesn't touch the game, its memory or your input.

```sh
pnpm --filter @guildie/helper dev                 # run from source (Bun)
pnpm --filter @guildie/helper build:win           # dist/guildie-helper.exe
pnpm --filter @guildie/helper test
```

First run asks for a token (make one on your guildie account page) and saves
it in `%APPDATA%\guildie\helper.json` (macOS: `~/Library/Application Support/guildie`).

- `--token` enter a new token
- `--wow <folder>` your World of Warcraft folder, if it isn't found
- `--api <url>` another guildie (a preview, or `https://guildie.localhost:1355`)

It looks in every `_*_` game folder under the WoW folder (we don't know
Forever's folder name for sure yet) and uploads only when the saved data
changes. Built with Bun, so the .exe carries Bun's runtime (~110 MB); a Go or
Rust build would be ~5 MB if size matters later.
