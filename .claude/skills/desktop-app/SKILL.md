---
name: desktop-app
description: How the Guildie Windows app (apps/desktop, Electron) is built, secured, tested and released. Use when changing anything in apps/desktop or packages/sync, the window.guildieDesktop bridge or the site code that calls it (apps/web/src/lib/desktop.ts, components/desktop-bridge.tsx, Settings → Addon/App), addon installation, app updates, or the release workflow.
---

# The desktop app

Electron + TypeScript. Guildie in a window, plus: installs and updates the
addon in WoW: Forever, uploads what the addon saves, writes `GuildieData.lua`,
and updates itself. Windows first; runs on macOS for development. Full
reference: apps/desktop/README.md.

## Layout

| File | What | Ask first? |
|---|---|---|
| `src/main.ts` | Start-up, single instance, the bridge's IPC handlers (`guildie:*`), tray actions | yes |
| `src/preload.ts` | The bridge (`window.guildieDesktop`), sandboxed | yes |
| `src/origins.ts` | Which URLs are Guildie (get the bridge), sign-in hops, everything else (opens in the browser) | yes |
| `src/updater.ts` | Self-update (electron-updater, GitHub Releases) | yes |
| `src/window-border.ts` | Hides Windows 11's accent border via `dwmapi.dll` through **koffi** (FFI) | yes |
| `src/window.ts` | Window, title bar overlay, user agent (`GuildieDesktop/<v>`, ` (Mica)`) | |
| `src/connection.ts` | Token, connect/pair/sign out, runs `SyncEngine` from `packages/sync` | |
| `src/addon.ts` | Installs/updates the addon from the bundled copy | |
| `src/tray.ts`, `src/settings.ts` | Tray menu; `settings.json` with DPAPI-encrypted tokens | |
| `src/smoke.ts` | `--smoke-test` | |
| `scripts/build.mjs` | esbuild bundles main + preload into `dist/` (no `node_modules` shipped), copies `assets/` icons | |
| `electron-builder.yml` | NSIS installer + zip, `extraResources` (addon, koffi binary), publish to GitHub | yes |
| `packages/sync` | Upload/download logic: SavedVariables reader, uploader, `GuildieData.lua` writer, WoW folder search | |

## The bridge: security rules

The bridge connects web pages to the player's computer. Keep all of these:

- Exposed **only on Guildie origins** (`isGuildieUrl`: `guildie.club`,
  `*.preview.guildie.club`, `*.guildie.localhost`). Never on Battle.net or
  any other page.
- Every IPC handler checks `event.senderFrame`: main frame, and the origin of
  the site the app is set to (`fromSite` and `pageOnly` in `main.ts`). A preview opened from
  guildie.club gets `{ connected: false }` and its writes reject.
- **Validate every argument** in the main process (types, lengths, enums).
  The preload passes `unknown`.
- **The token only goes in.** Nothing returns a token, a path the page didn't
  choose, or file contents to the page.
- Context isolation on, sandbox on, no Node in the page, no `<webview>`, no
  permissions besides clipboard write. Self-signed certificates only for
  `*.localhost`.
- New bridge methods are **optional** on the site side
  (`apps/web/src/lib/desktop.ts`): older app versions stay installed for a
  while. Check `bridge.method` exists before calling; never remove or change
  the shape of an existing one. Document it in apps/desktop/README.md ("The
  bridge").

## Running and testing

```sh
pnpm --filter @guildie/desktop check    # typecheck
pnpm --filter @guildie/desktop test     # origin rules, addon install/update (node --test)
pnpm --filter @guildie/desktop dev --url https://guildie.localhost:1355     # with pnpm dev running
pnpm --filter @guildie/desktop smoke --url https://guildie.localhost:1355   # headless PASS/FAIL
```

The smoke test loads the site hidden with throwaway settings, checks the
bridge (only on Guildie's pages, exactly the expected functions, bad input
rejected, no Node), installs the addon into a fake WoW folder, updates an
older one keeping its `GuildieData.lua`, and checks status reaches the page.
`GUILDIE_SMOKE_TOKEN=gld_…` adds connect, upload, download and sign-out.
Add a smoke check when you add a bridge method.

## What you can't test on macOS

Mica and the title bar overlay, the window border (koffi + dwmapi), tray
behavior, notifications, Start with Windows, DPAPI, WoW folder detection, the
NSIS installer and self-update. Say so in the PR; a maintainer or a guildie
on Windows tries it. Self-update only runs in an NSIS install
(`canSelfUpdate`); dev, zip and smoke never update.

## Releases (maintainers)

1. CHANGELOG.md: `## Unreleased` becomes `## <version>` (the release notes on
   GitHub and in Settings → App come from that section; the workflow fails
   without it).
2. Bump `version` in `apps/desktop/package.json`; bump `## Version` in
   `apps/addon/Guildie/Guildie.toc` if the addon changed (players' copies
   update only when it goes up).
3. Tag `desktop-v<version>` and push the tag.
   `.github/workflows/desktop-release.yml` checks the tag matches, runs check
   and test, creates the release and uploads the installer, `.blockmap` and
   `latest.yml`.

electron-updater reads only the repo's **Latest, non-draft** release. Any
other release in this repo must be a pre-release or not marked Latest, or
installed apps stop finding updates. Builds aren't code-signed (SmartScreen
asks once).

## Gotchas

- The preload runs sandboxed: it may only `require("electron")` and what
  esbuild inlines (`origins.ts`).
- `__VERSION__` is injected by `scripts/build.mjs` from `package.json`.
- koffi's native binary is loaded at runtime from `resources/koffi`
  (external in esbuild, `extraResources` in electron-builder).
- Settings and the log live in `%APPDATA%\guildie\desktop` (`guildie.log`).
- Icons are `apps/desktop/assets/` (drawn by `scripts/make-icon.py`).
