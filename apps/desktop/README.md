# Guildie for Windows (`apps/desktop`)

Guildie in its own window, plus what the helper (`apps/helper`) does: it
uploads what the Guildie addon saves in game, and downloads your guild's data
into the addon for its tooltips. Sign in inside the window and that's it.

Electron + TypeScript. Windows first; it runs on macOS for development.

## Using it

- **Install:** `Guildie-Setup-<version>.exe` (per user, no admin), or unzip
  `Guildie-<version>-win-x64.zip` anywhere and run `Guildie.exe`.
- **Window:** guildie.club, with Windows' own window buttons over the site's
  header. Links to other sites open in your browser. Battle.net sign-in stays
  in the window.
- **Connecting:** signing in on the site hands the app a token (the bridge
  below). Until the site does that, choose **Connect...** in the tray: the
  window shows a code to approve, as the helper did.
- **Tray** (notification area): who you're connected as, the last upload, the
  WoW folder, **Open Guildie**, **Upload now**, **Choose World of Warcraft
  folder...**, **Start with Windows**, **About Guildie**, **Sign out**, **Quit**.
  Left-click opens the window. Closing the window keeps it running in the tray.
- **WoW folder:** found in the usual places (or the helper's remembered one);
  otherwise choose it from the tray. It watches every
  `_*_/WTF/Account/*/SavedVariables/Guildie.lua` and writes
  `_*_/Interface/AddOns/Guildie/GuildieData.lua` every 15 minutes, on connect,
  and on **Upload now** (only when it changed).
- One copy runs at a time; opening it again shows the window.

Settings and the log (`guildie.log`) are in `%APPDATA%\guildie\desktop`, next
to the helper's. Tokens are encrypted with Windows' DPAPI (Electron
`safeStorage`) and kept per site: a preview's token never applies to
guildie.club.

Flags: `--url <site>` (or `GUILDIE_URL`), `--hidden` (start in the tray; what
Start with Windows uses), `--smoke-test`, `--user-data <dir>`.

## Building

On the Windows PC (from the repo root):

```sh
pnpm install
pnpm --filter @guildie/desktop build:win
# -> apps/desktop/release/Guildie-Setup-0.1.0.exe and Guildie-0.1.0-win-x64.zip
```

From macOS, without wine: `pnpm --filter @guildie/desktop build:win-cross`
makes the zip (exe icon and version included). The NSIS installer needs
`makensis`, which electron-builder ships for Intel Macs only: on Apple Silicon
it runs once Rosetta is installed (`softwareupdate --install-rosetta`), then
`build:win` works on the Mac too.

Development (any OS):

```sh
pnpm --filter @guildie/desktop dev --url https://desktop.guildie.localhost:1355
pnpm --filter @guildie/desktop smoke --url https://desktop.guildie.localhost:1355
pnpm --filter @guildie/desktop test     # origin rules
pnpm --filter @guildie/desktop check
```

`--smoke-test` starts hidden with a throwaway settings folder, loads the site,
checks the bridge (present only on Guildie's pages, exactly these functions,
bad input rejected, no Node in the page), points the sync engine at a fake WoW
folder and checks the status reaches the page, prints PASS/FAIL and exits 0
or 1. With `GUILDIE_SMOKE_TOKEN=gld_…` (a token for that site) it also
connects, uploads, downloads guild data and signs out (which revokes the
token). With `GUILDIE_SMOKE_PAIR=1` it also runs the pairing fallback and
waits for someone to approve the code it logs.

## How it's put together

| File | What |
|---|---|
| `src/main.ts` | Start-up, single instance, the bridge's IPC handlers, tray actions |
| `src/window.ts` | The window: title bar overlay (`TITLEBAR`), size and position, what stays in the window |
| `src/origins.ts` | Which URLs are Guildie (bridge), sign-in hops (stay in the window), everything else (browser) |
| `src/preload.ts` | The bridge, `window.guildieDesktop` |
| `src/connection.ts` | Token, connect / pair / sign out, runs `SyncEngine` from `packages/sync` |
| `src/settings.ts` | `settings.json`: window, WoW folder, encrypted tokens |
| `src/tray.ts` | The tray menu |
| `src/smoke.ts` | `--smoke-test` |

The upload and download logic is `packages/sync` (`@guildie/sync`), shared
with the helper. `scripts/build.mjs` bundles main and preload with esbuild, so
the packaged app carries no `node_modules`.

Security: context isolation on, sandboxed page, no Node in the page, no
`<webview>`, and no permissions granted besides writing to the clipboard. The bridge is exposed only on
Guildie's own origins, and the main process checks each call's frame (main
frame, this site's origin) and validates every argument. The token goes in,
never comes back out. Self-signed certificates are accepted for `*.localhost`
only.

## The bridge (for the website)

On Guildie's pages only (`guildie.club`, `*.preview.guildie.club`,
`*.guildie.localhost`), the app sets `<html data-desktop="true">` and:

```ts
window.guildieDesktop = {
	isDesktop: true,
	version: string,
	getState(): Promise<{ connected: boolean; account?: string }>,
	setToken(token: string, account?: string): Promise<void>, // after sign-in; rejects if the site doesn't accept the token
	signOut(): Promise<void>, // revokes the token and disconnects
	getStatus(): Promise<{
		connected: boolean;
		account?: string;
		lastUpload?: { at: number; characters: string[] }; // character slugs
		guildDataAt?: number;
		wowFolder?: string;
	}>,
	onStatus(callback: (status) => void): () => void, // returns unsubscribe
};
```

Calls from a different Guildie site than the one the app is set to (say a
preview opened from guildie.club) get `{ connected: false }`, and `setToken`
and `signOut` reject.

The title bar: the window buttons are drawn over the top right, 40px tall, on
`TITLEBAR.color` (`#15110d` for now; it should match the site's `--titlebar`).
The site should keep that strip clear with
`env(titlebar-area-x)` / `env(titlebar-area-width)` / `env(titlebar-area-height)`
and mark its header `-webkit-app-region: drag` (links and buttons `no-drag`).
Until it does, the app makes any `<header>` draggable itself, with a rule any
site rule overrides.

## Not verified on Windows yet

Built from macOS and smoke-tested there against a local Guildie. Still to try
on Windows: the installer, the title bar overlay, the tray icon and menu,
notifications, Start with Windows, DPAPI, and WoW folder detection.
