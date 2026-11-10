// Guildie helper: uploads what the Guildie addon saves in game to guildie.club.
//
// The addon can't use the internet. The game writes its data to
// WTF/Account/<account>/SavedVariables/Guildie.lua on logout and /reload; this
// watches that file and uploads it when it changes. It only reads files: it
// never touches the game, its memory or your input.
//
// On Windows it lives in the notification area (tray), with no console window.
// Elsewhere, or with --console, it runs in the terminal.
//
//   --api <url>     another Guildie (a preview, or https://guildie.localhost:1355)
//   --wow <folder>  your World of Warcraft folder, if it isn't found
//   --console       run in the terminal, even on Windows

import { spawn } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { Api, configDir, DEFAULT_API, displayName, loadConfig, logPath, makeLogger, saveConfig, SyncEngine } from "@guildie/sync";
import iconFile from "../assets/guildie.ico" with { type: "file" };
import { type TrayItem, WindowsTray } from "./tray-windows";

const args = process.argv.slice(2);
const flag = (name: string) => {
	const i = args.indexOf(name);
	return i === -1 ? undefined : args[i + 1];
};
const base = flag("--api") ?? DEFAULT_API;
const useTray = process.platform === "win32" && !args.includes("--console");
const log = makeLogger(!useTray);
const config = loadConfig();
if (flag("--wow")) {
	config.wow = flag("--wow");
	saveConfig(config);
}
// Local dev servers (*.localhost) use a self-signed certificate (Bun's fetch option).
const api = new Api(base, config.tokens[base]?.token, (url, init) =>
	fetch(url, new URL(url).hostname.endsWith(".localhost") ? { ...init, tls: { rejectUnauthorized: false } } : init),
);

// ---- One helper at a time ----------------------------------------------------

const lockPath = join(configDir(), "helper.lock");
function alreadyRunning() {
	try {
		const pid = Number(readFileSync(lockPath, "utf8"));
		if (pid && pid !== process.pid) {
			process.kill(pid, 0);
			return true;
		}
	} catch {}
	return false;
}
if (alreadyRunning()) {
	log("Another Guildie helper is already running; exiting.");
	if (!useTray) console.log("Another Guildie helper is already running.");
	process.exit(0);
}
writeFileSync(lockPath, String(process.pid));
function quit() {
	try {
		unlinkSync(lockPath);
	} catch {}
	tray?.close();
	process.exit(0);
}
process.on("SIGINT", quit);
process.on("SIGTERM", quit);

// ---- What the user sees: tray on Windows, the terminal elsewhere -------------

function openExternal(target: string) {
	if (process.platform === "win32") {
		spawn("rundll32", ["url.dll,FileProtocolHandler", target], { windowsHide: true, detached: true, stdio: "ignore" }).unref();
	} else {
		spawn(process.platform === "darwin" ? "open" : "xdg-open", [target], { detached: true, stdio: "ignore" }).unref();
	}
}

let tray: WindowsTray | undefined;

const ui = {
	status(text: string) {
		log(text);
		tray?.set("status", "disabled", text);
		tray?.tip(`guildie: ${text}`);
	},
	last(text: string) {
		tray?.set("last", "disabled", text);
	},
	connected(account: string | null) {
		tray?.set("connect", account ? "hidden" : "enabled", "Connect to Guildie...");
		tray?.set("upload", account ? "enabled" : "hidden", "Upload now");
		tray?.set("signout", account ? "enabled" : "hidden", `Sign out${account ? ` (${account})` : ""}`);
	},
	notify(title: string, text: string) {
		if (tray) tray.balloon(title, text);
		else console.log(`\n${title}: ${text}\n`);
	},
};

// ---- Connecting and signing out ---------------------------------------------

let account: string | null = null;
let pairing = false;

async function checkToken() {
	if (!api.token) return false;
	const me = await api.me();
	if (!me) {
		log("The saved token no longer works; connect again.");
		delete config.tokens[base];
		saveConfig(config);
		api.token = undefined;
		return false;
	}
	account = me.battletag ?? "you";
	config.tokens[base] = { token: api.token, account };
	saveConfig(config);
	ui.status(`Connected as ${account}`);
	ui.connected(account);
	if (!me.characters.length) ui.notify("Guildie", "No claimed characters yet. Claim them on your Guildie account page.");
	return true;
}

async function connect() {
	if (pairing || account) return;
	pairing = true;
	try {
		const { code, pollSecret, expiresInSeconds, connectUrl } = await api.startPairing(hostname() || "Helper");
		ui.status(`Waiting for you to approve ${code} in your browser`);
		ui.notify("Connect Guildie", `Approve the code ${code} in your browser.`);
		if (!tray) console.log(`Open ${connectUrl} and approve the code ${code}.`);
		openExternal(connectUrl);
		const until = Date.now() + expiresInSeconds * 1000;
		while (Date.now() < until) {
			await Bun.sleep(2_000);
			const result = await api.pollPairing(code, pollSecret).catch(() => ({ status: "pending" as const }));
			if (result.status === "approved") {
				api.token = result.token;
				config.tokens[base] = { token: result.token };
				saveConfig(config);
				if (await checkToken()) ui.notify("Guildie", `Connected as ${account}. Your addon data uploads when you log out of WoW.`);
				return;
			}
			if (result.status === "expired") break;
		}
		ui.status("Not connected");
		ui.connected(null);
		ui.notify("Guildie", 'Connecting timed out. Choose "Connect to Guildie" to try again.');
	} catch (e) {
		ui.status(`Can't reach ${base}`);
		log((e as Error).message);
		ui.connected(null);
	} finally {
		pairing = false;
	}
}

async function signOut() {
	await api.signOut();
	delete config.tokens[base];
	saveConfig(config);
	api.token = undefined;
	account = null;
	sync.reset();
	ui.status("Signed out");
	ui.connected(null);
	ui.last("No uploads yet");
}

// ---- Uploading, and downloading guild data for the addon's tooltips ---------
// (packages/sync: the same engine as the desktop app)

const sync = new SyncEngine(api, config.wow, {
	log,
	async onUnauthorized() {
		await signOut();
		ui.notify("Guildie", "This helper was disconnected. Connect again from the tray icon.");
	},
	onUpload({ at, characters }) {
		ui.last(`Last upload: ${characters.map(displayName).join(", ")} at ${new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
	},
	onUnmatched(names) {
		ui.notify("Guildie", `Not claimed on Guildie yet: ${names.join(", ")}. Claim them on your account page.`);
	},
});

// ---- Start ------------------------------------------------------------------

async function onClick(item: TrayItem) {
	if (item === "open") openExternal(new URL("/me", base).toString());
	if (item === "log") openExternal(logPath());
	if (item === "connect") void connect();
	if (item === "upload") sync.now();
	if (item === "signout") await signOut();
	if (item === "quit") quit();
}

if (useTray) {
	// The icon is embedded in the .exe; PowerShell needs a real file.
	const iconPath = join(configDir(), "guildie.ico");
	if (!existsSync(iconPath)) await Bun.write(iconPath, Bun.file(iconFile));
	tray = new WindowsTray(configDir(), iconPath, (item) => void onClick(item), quit);
}

log(`Guildie helper for ${base}`);
ui.status("Starting");
ui.connected(null);
const connected = await checkToken().catch((e: Error) => {
	ui.status(`Can't reach ${base}`);
	log(e.message);
	return false;
});
if (!connected) void connect();

let lastRetry = Date.now();
while (true) {
	if (account) await sync.tick();
	// Offline at start (or since): try the saved token again every minute.
	else if (api.token && !pairing && Date.now() - lastRetry > 60_000) {
		lastRetry = Date.now();
		await checkToken().catch(() => undefined);
	}
	await Bun.sleep(2_000);
}
