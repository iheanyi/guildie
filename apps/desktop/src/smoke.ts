// --smoke-test: start hidden, load the site, check the bridge and the sync
// engine's wiring, print what passed, exit (0 when everything did).
// With GUILDIE_SMOKE_TOKEN (a real token for that site) it also connects,
// uploads a fake SavedVariables file and downloads guild data.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Log } from "@guildie/sync";
import { app, type BrowserWindow } from "electron";
import type { Connection } from "./connection.ts";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until<T>(what: () => T | Promise<T>, ms: number): Promise<T | undefined> {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		const value = await what();
		if (value) return value;
		await wait(250);
	}
	return undefined;
}

/** A WoW folder with the addon installed and a saved file, like the game leaves it. */
function fakeWow() {
	const wow = mkdtempSync(join(tmpdir(), "guildie-smoke-wow-"));
	const saved = join(wow, "_forever_", "WTF", "Account", "SMOKE", "SavedVariables");
	const addon = join(wow, "_forever_", "Interface", "AddOns", "Guildie");
	mkdirSync(saved, { recursive: true });
	mkdirSync(addon, { recursive: true });
	writeFileSync(join(addon, "Guildie.toc"), "## Title: Guildie\n");
	const payload = JSON.stringify({ version: 1, characters: [] });
	writeFileSync(join(saved, "Guildie.lua"), `GuildieDB = {\n\t["payload"] = "${payload.replace(/"/g, '\\"')}",\n}\n`);
	return { wow, addon };
}

export async function runSmokeTest(win: BrowserWindow, connection: Connection, url: string, log: Log) {
	const results: { check: string; ok: boolean; detail?: string }[] = [];
	const check = (name: string, ok: boolean, detail?: unknown) => {
		results.push({ check: name, ok, detail: detail === undefined ? undefined : JSON.stringify(detail) });
		log(`${ok ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`);
	};
	const page = <T>(code: string) => win.webContents.executeJavaScript(code, true) as Promise<T>;

	try {
		const loaded = await until(() => !win.webContents.isLoading() && win.webContents.getURL().startsWith("http"), 60_000);
		check("page loads", !!loaded, win.webContents.getURL());
		await wait(1_500); // let the site hydrate

		const security = await page<Record<string, string>>(`({
			bridge: typeof window.guildieDesktop,
			keys: Object.keys(window.guildieDesktop || {}).sort().join(","),
			version: String(window.guildieDesktop?.version),
			isDesktop: String(window.guildieDesktop?.isDesktop),
			dataset: String(document.documentElement.dataset.desktop),
			require: typeof require,
			electron: String(typeof process === "object" && !!process?.versions?.electron),
			ipc: typeof ipcRenderer,
		})`);
		check("bridge exposed on the site", security.bridge === "object" && security.isDesktop === "true", security);
		check(
			"bridge has exactly the agreed functions",
			security.keys === "getState,getStatus,isDesktop,onStatus,setToken,signOut,version",
			security.keys,
		);
		check('html[data-desktop="true"]', security.dataset === "true");
		check("no Node or Electron in the page", security.require === "undefined" && security.electron === "false" && security.ipc === "undefined");

		const state = await page<{ connected: boolean }>("window.guildieDesktop.getState()");
		check("getState()", typeof state?.connected === "boolean", state);

		const rejects = async (code: string) =>
			page<string>(`${code}.then(() => "resolved", (e) => "rejected: " + e.message)`);
		const bad = await rejects('window.guildieDesktop.setToken("not-a-token")');
		check("setToken rejects a malformed token", bad.startsWith("rejected"), bad);
		const unknown = await rejects('window.guildieDesktop.setToken("gld_' + "x".repeat(32) + '")');
		check("setToken rejects a token the site doesn't know", unknown.startsWith("rejected"), unknown);
		const badAccount = await rejects('window.guildieDesktop.setToken("gld_' + "x".repeat(32) + '", {})');
		check("setToken rejects a non-string account", badAccount.startsWith("rejected"), badAccount);
		const badCallback = await page<string>(
			'(() => { try { window.guildieDesktop.onStatus("x"); return "accepted"; } catch (e) { return "threw"; } })()',
		);
		check("onStatus rejects a non-function", badCallback === "threw");

		// The sync engine: point it at a fake WoW folder and watch the status reach the page.
		await page("window.__statuses = []; window.__off = window.guildieDesktop.onStatus((s) => window.__statuses.push(s)); 1");
		const { wow, addon } = fakeWow();
		connection.setWowFolder(wow);
		const pushed = await until(
			() => page<{ wowFolder?: string }[]>("window.__statuses").then((s) => s.find((x) => x.wowFolder === wow)),
			5_000,
		);
		check("onStatus delivers the WoW folder to the page", !!pushed, pushed);
		const status = await page<{ wowFolder?: string }>("window.guildieDesktop.getStatus()");
		check("getStatus() has the WoW folder", status.wowFolder === wow, status);

		const token = process.env.GUILDIE_SMOKE_TOKEN;
		if (token) {
			await page(`window.guildieDesktop.setToken(${JSON.stringify(token)}, "Smoke")`);
			const connected = await page<{ connected: boolean; account?: string }>("window.guildieDesktop.getState()");
			check("setToken connects (checked with /api/helper/me)", connected.connected, connected);
			const stored = readFileSync(join(app.getPath("userData"), "settings.json"), "utf8");
			check("token saved encrypted, under the site's origin", !stored.includes(token) && stored.includes(connection.origin));
			connection.uploadNow();
			const synced = await until(() => {
				const s = connection.status;
				return s.guildDataAt ? s : undefined;
			}, 20_000);
			check("guild data downloaded", !!synced?.guildDataAt, synced);
			const file = join(addon, "GuildieData.lua");
			check(
				"GuildieData.lua written",
				existsSync(file) && readFileSync(file, "utf8").startsWith("-- Written by the Guildie helper"),
			);
			await page("window.guildieDesktop.signOut()");
			const after = await page<{ connected: boolean }>("window.guildieDesktop.getState()");
			check("signOut() disconnects", !after.connected, after);
		} else {
			log("(GUILDIE_SMOKE_TOKEN not set: skipping connect, upload and download)");
		}

		await page("window.__off(); 1");

		// The pairing fallback: someone approves the logged code on the site meanwhile.
		if (process.env.GUILDIE_SMOKE_PAIR) {
			const pairing = connection.pair((connectUrl) => {
				log(`Pairing: showing ${connectUrl}`);
				void win.loadURL(connectUrl);
			});
			const code = await until(() => connection.status.pairingCode, 10_000);
			log(`Pairing code: ${code}`);
			await pairing;
			check("pairing connects", connection.status.connected, connection.status);
			await connection.disconnect();
			await win.loadURL(url);
			await until(() => !win.webContents.isLoading(), 30_000);
		}

		// Pages that aren't Guildie get nothing.
		await win.loadURL("about:blank");
		const blank = await page<string>("typeof window.guildieDesktop");
		check("no bridge on other pages", blank === "undefined", blank);
	} catch (e) {
		check("smoke test ran", false, (e as Error).message);
	}

	const failed = results.filter((r) => !r.ok);
	console.log(`\nSmoke test against ${url}: ${results.length - failed.length}/${results.length} passed`);
	return failed.length === 0;
}
