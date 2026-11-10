// Guildie for Windows: the site in its own window, plus what the helper does
// (apps/helper, packages/sync): uploads what the Guildie addon saves in game,
// and downloads your guild's data into the addon. Signing in in the window
// connects it; nothing else to set up.
//
//   --url <url>        another Guildie (a preview, or https://<name>.guildie.localhost:1355);
//                      also GUILDIE_URL
//   --hidden           start in the tray (how "Start with Windows" launches it)
//   --smoke-test       start hidden, check the window, bridge and sync engine, print, exit
//   --user-data <dir>  keep settings somewhere else (tests)

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configDir, DEFAULT_API, loadConfig, makeLogger } from "@guildie/sync";
import { app, BrowserWindow, dialog, type IpcMainInvokeEvent, ipcMain, Notification, session, shell } from "electron";
import { Connection, type Status } from "./connection.ts";
import { allowsSelfSigned, isGuildieUrl, originOf } from "./origins.ts";
import { settings } from "./settings.ts";
import { runSmokeTest } from "./smoke.ts";
import { createTray } from "./tray.ts";
import { createWindow } from "./window.ts";

declare const __VERSION__: string;

const argv = process.argv.slice(1);
const flag = (name: string) => {
	const i = argv.indexOf(name);
	return i === -1 ? undefined : argv[i + 1];
};
const smokeTest = argv.includes("--smoke-test");
const startHidden = argv.includes("--hidden") || smokeTest;

const siteUrl = flag("--url") ?? process.env.GUILDIE_URL ?? DEFAULT_API;
const origin = isGuildieUrl(siteUrl) ? originOf(siteUrl) : undefined;
if (!origin) {
	console.error(`Not a Guildie site: ${siteUrl}`);
	app.exit(2);
}

app.setName("Guildie");
// Next to the helper's settings: %APPDATA%\guildie\desktop on Windows. A smoke
// test gets a fresh folder, and (macOS) a stand-in keychain, so it never asks.
app.setPath(
	"userData",
	flag("--user-data") ?? (smokeTest ? mkdtempSync(join(tmpdir(), "guildie-smoke-")) : join(configDir(), "desktop")),
);
if (smokeTest && process.platform === "darwin") app.commandLine.appendSwitch("use-mock-keychain");
const log = makeLogger(!app.isPackaged || smokeTest, join(app.getPath("userData"), "guildie.log"));

// A second launch focuses the running app instead.
if (!app.requestSingleInstanceLock()) app.exit(0);
if (process.platform === "win32") app.setAppUserModelId("club.guildie.desktop");

let win: BrowserWindow | undefined;
let quitting = false;

function showWindow() {
	if (!win || win.isDestroyed()) return;
	if (win.isMinimized()) win.restore();
	win.show();
	win.focus();
}

function notify(title: string, body: string) {
	log(`${title}: ${body}`);
	if (smokeTest || !Notification.isSupported()) return;
	new Notification({ title, body, icon: join(__dirname, "assets", "guildie-256.png") }).show();
}

/** "Start with Windows". A portable build runs from a temp copy, so point at the real .exe. */
const loginItem = {
	path: process.env.PORTABLE_EXECUTABLE_FILE ?? process.execPath,
	args: ["--hidden", ...(siteUrl === DEFAULT_API ? [] : ["--url", siteUrl])],
};
const startWithSystem =
	app.isPackaged && (process.platform === "win32" || process.platform === "darwin")
		? {
				get: () => app.getLoginItemSettings(loginItem).openAtLogin,
				set: (openAtLogin: boolean) => app.setLoginItemSettings({ ...loginItem, openAtLogin }),
			}
		: undefined;

/** The sync status as the page sees it. */
const publicStatus = ({ connected, account, lastUpload, guildDataAt, wowFolder }: Status) => ({
	connected,
	account,
	lastUpload,
	guildDataAt,
	wowFolder,
});

app.whenReady().then(async () => {
	if (!origin) return;
	// Local dev sites use a self-signed certificate: accept it there only.
	session.defaultSession.setCertificateVerifyProc((request, callback) =>
		callback(allowsSelfSigned(request.hostname) ? 0 : -3),
	);

	// The helper's remembered WoW folder is a good start.
	if (!settings.wow) {
		const helperWow = loadConfig().wow;
		if (helperWow) settings.wow = helperWow;
	}

	const connection = new Connection(origin, log);
	connection.onNotice = notify;
	log(`Guildie ${__VERSION__} for ${origin}`);

	// ---- The bridge (preload.ts): only Guildie's own page, on this site ----
	const fromSite = (event: IpcMainInvokeEvent) => {
		const frame = event.senderFrame;
		if (!frame || frame !== event.sender.mainFrame || !win || event.sender !== win.webContents) return false;
		return isGuildieUrl(frame.url) && originOf(frame.url) === origin;
	};
	ipcMain.handle("guildie:get-state", (event) => {
		const { connected, account } = connection.status;
		return fromSite(event) && connected ? { connected, account } : { connected: false };
	});
	ipcMain.handle("guildie:get-status", (event) =>
		fromSite(event) ? publicStatus(connection.status) : { connected: false },
	);
	ipcMain.handle("guildie:set-token", async (event, token: unknown, account: unknown) => {
		if (!fromSite(event)) throw new Error("Not allowed from this page.");
		await connection.setToken(token, account);
	});
	ipcMain.handle("guildie:sign-out", async (event) => {
		if (!fromSite(event)) throw new Error("Not allowed from this page.");
		await connection.disconnect();
	});

	// ---- The window ----
	win = createWindow(siteUrl, { show: !startHidden, preload: join(__dirname, "preload.cjs") });
	win.on("close", (event) => {
		if (quitting || smokeTest) return;
		// Closing hides to the tray: it keeps uploading.
		event.preventDefault();
		win?.hide();
		if (!settings.trayNoticeShown) {
			settings.trayNoticeShown = true;
			notify("Guildie is still running", "It keeps uploading your addon data. Quit from the tray icon.");
		}
	});
	connection.onStatus((status) => {
		const contents = win && !win.isDestroyed() ? win.webContents : undefined;
		if (contents && isGuildieUrl(contents.getURL()) && originOf(contents.getURL()) === origin) {
			contents.send("guildie:status", publicStatus(status));
		}
	});

	if (smokeTest) {
		const ok = await runSmokeTest(win, connection, siteUrl, log);
		quitting = true;
		app.exit(ok ? 0 : 1);
		return;
	}

	// ---- The tray ----
	const chooseWow = async () => {
		const result = await dialog.showOpenDialog({
			title: "Choose your World of Warcraft folder",
			message: "The folder with _classic_ or _forever_ inside",
			defaultPath: connection.status.wowFolder,
			properties: ["openDirectory"],
		});
		const folder = result.filePaths[0];
		if (result.canceled || !folder) return;
		try {
			connection.setWowFolder(folder);
			connection.uploadNow();
		} catch (e) {
			void dialog.showMessageBox({ type: "warning", message: (e as Error).message });
		}
	};
	// Sign in through the player's own browser (Battle.net's login, Google
	// included, can't run inside the app), then sign the window in with the
	// one-time code that comes back with the token.
	const signIn = () =>
		void connection.pair(
			(connectUrl) => void shell.openExternal(connectUrl),
			(sessionCode) => {
				void win?.loadURL(`${origin}/desktop/session?code=${encodeURIComponent(sessionCode)}`);
				showWindow();
			},
		);
	ipcMain.handle("guildie:sign-in", (event) => {
		if (!fromSite(event)) throw new Error("Not allowed from this page.");
		signIn();
	});
	const { update } = createTray({
		open: showWindow,
		connect: signIn,
		uploadNow: () => connection.uploadNow(),
		chooseWow: () => void chooseWow(),
		startWithSystem,
		about: () =>
			void dialog
				.showMessageBox({
					type: "info",
					title: "About Guildie",
					message: `Guildie ${__VERSION__}`,
					detail: `Site: ${origin}\nElectron ${process.versions.electron}\nSettings and log: ${app.getPath("userData")}`,
					buttons: ["OK", "Open log"],
				})
				.then(({ response }) => {
					if (response === 1) void shell.openPath(join(app.getPath("userData"), "guildie.log"));
				}),
		signOut: () => void connection.disconnect(),
		quit: () => app.quit(),
	});
	connection.onStatus(update);
	update(connection.status);

	await connection.start();
	if (!connection.status.wowFolder) log("No World of Warcraft folder found; choose it from the tray menu.");
});

app.on("second-instance", showWindow);
app.on("activate", showWindow); // macOS: clicking the Dock icon
app.on("before-quit", () => {
	quitting = true;
});
// The window only hides, so this means quitting.
app.on("window-all-closed", () => app.quit());
