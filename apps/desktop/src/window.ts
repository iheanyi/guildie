// The app's one window: Guildie, with Windows' own window buttons drawn over
// the site's header (titleBarOverlay). Remembers its size and position.

import { join } from "node:path";
import { BrowserWindow, type Rectangle, screen, shell } from "electron";
import { isExternalOpenable, staysInWindow } from "./origins.ts";
import { type Bounds, settings } from "./settings.ts";

/**
 * The title bar strip, matching the site's header (its CSS token --titlebar in
 * apps/web/src/styles/app.css). The site leaves room for the buttons with
 * env(titlebar-area-x/width) and marks its header -webkit-app-region: drag.
 */
export const TITLEBAR = { color: "#1c150e", symbolColor: "#e9dfcc", height: 40 } as const;

/** Make the header draggable until the site does it itself (any rule of the site's wins: :where() has no specificity). */
const FALLBACK_DRAG_CSS = `
:where(html[data-desktop="true"] body header) { -webkit-app-region: drag; }
:where(html[data-desktop="true"] body header :is(a, button, input, select, textarea, label, [role="button"], [tabindex])) { -webkit-app-region: no-drag; }
`;

const DEFAULT_SIZE = { width: 1200, height: 820 };

/** Saved bounds, if they're still on a screen (a monitor may have been unplugged). */
function savedBounds(): Bounds | undefined {
	const saved = settings.bounds;
	if (!saved) return undefined;
	const visible = screen.getAllDisplays().some(({ workArea: a }) => {
		const overlapX = Math.min(saved.x + saved.width, a.x + a.width) - Math.max(saved.x, a.x);
		const overlapY = Math.min(saved.y + saved.height, a.y + a.height) - Math.max(saved.y, a.y);
		return overlapX >= 100 && overlapY >= 40;
	});
	return visible ? saved : undefined;
}

export function createWindow(url: string, options: { show: boolean; preload: string }) {
	const saved = savedBounds();
	const win = new BrowserWindow({
		...(saved ? { x: saved.x, y: saved.y, width: saved.width, height: saved.height } : DEFAULT_SIZE),
		minWidth: 420,
		minHeight: 320,
		show: false,
		title: "Guildie",
		backgroundColor: TITLEBAR.color,
		icon: join(__dirname, "assets", "guildie-256.png"),
		titleBarStyle: "hidden",
		titleBarOverlay: { color: TITLEBAR.color, symbolColor: TITLEBAR.symbolColor, height: TITLEBAR.height },
		trafficLightPosition: { x: 14, y: 13 },
		autoHideMenuBar: true,
		webPreferences: {
			preload: options.preload,
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			webviewTag: false,
			spellcheck: true,
		},
	});
	win.removeMenu();
	if (saved?.maximized) win.maximize();
	if (options.show) win.once("ready-to-show", () => win.show());

	// Remember size and position (the normal bounds, also while maximized).
	let saveTimer: NodeJS.Timeout | undefined;
	const remember = () => {
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			if (win.isDestroyed() || win.isMinimized()) return;
			const b: Rectangle = win.getNormalBounds();
			settings.bounds = { ...b, maximized: win.isMaximized() };
		}, 500);
	};
	win.on("resize", remember);
	win.on("move", remember);
	win.on("maximize", remember);
	win.on("unmaximize", remember);

	const contents = win.webContents;

	// Our pages and the sign-in hops stay in the window; everything else opens in the browser.
	const guard = (event: { preventDefault: () => void }, target: string) => {
		if (staysInWindow(target)) return;
		event.preventDefault();
		if (isExternalOpenable(target)) void shell.openExternal(target);
	};
	contents.on("will-navigate", (event) => guard(event, event.url));
	contents.on("will-redirect", (event) => guard(event, event.url));
	contents.setWindowOpenHandler(({ url: target }) => {
		if (staysInWindow(target)) void win.loadURL(target);
		else if (isExternalOpenable(target)) void shell.openExternal(target);
		return { action: "deny" };
	});
	// No <webview>s, and no permission prompts (camera, location...): the site needs none.
	contents.on("will-attach-webview", (event) => event.preventDefault());
	contents.session.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === "clipboard-sanitized-write"));

	contents.on("did-finish-load", () => void contents.insertCSS(FALLBACK_DRAG_CSS).catch(() => undefined));

	void win.loadURL(url);
	return win;
}
