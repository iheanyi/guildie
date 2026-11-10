// guildie helper: uploads what the guildie addon saves in game to guildie.club.
//
// The addon can't use the internet. The game writes its data to
// WTF/Account/<account>/SavedVariables/Guildie.lua on /reload and logout; this
// watches that file and uploads it when it changes. It only reads files: it
// never touches the game, its memory or your input.
//
//   guildie-helper                 run (asks for a token the first time)
//   guildie-helper --token         enter a new token
//   guildie-helper --wow <folder>  your World of Warcraft folder, if not found
//   guildie-helper --api <url>     another guildie, e.g. https://guildie.localhost:1355

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { extractPayload } from "./savedVariables";

const POLL_MS = 2_000;
const RESCAN_MS = 30_000;

type Config = { api: string; token?: string; wow?: string };

const args = process.argv.slice(2);
const flag = (name: string) => {
	const i = args.indexOf(name);
	return i === -1 ? undefined : (args[i + 1] ?? "");
};

function configPath() {
	if (process.platform === "win32") return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "guildie", "helper.json");
	if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "guildie", "helper.json");
	return join(homedir(), ".config", "guildie", "helper.json");
}

function loadConfig(): Config {
	try {
		return { api: "https://guildie.club", ...JSON.parse(readFileSync(configPath(), "utf8")) };
	} catch {
		return { api: "https://guildie.club" };
	}
}

function saveConfig(config: Config) {
	mkdirSync(dirname(configPath()), { recursive: true });
	writeFileSync(configPath(), JSON.stringify(config, null, 2));
}

const log = (...parts: unknown[]) => console.log(`[${new Date().toLocaleTimeString()}]`, ...parts);

function request(config: Config, path: string, init: RequestInit = {}) {
	const url = new URL(path, config.api);
	return fetch(url, {
		...init,
		headers: { ...init.headers, Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
		// Local dev servers (*.localhost) use a self-signed certificate.
		...(url.hostname.endsWith(".localhost") ? { tls: { rejectUnauthorized: false } } : {}),
	});
}

/** Default World of Warcraft folders, most likely first. */
function wowCandidates(config: Config) {
	if (config.wow) return [config.wow];
	if (process.platform === "win32") {
		return ["C:\\Program Files (x86)\\World of Warcraft", "C:\\Program Files\\World of Warcraft", "D:\\World of Warcraft", "D:\\Games\\World of Warcraft"];
	}
	return ["/Applications/World of Warcraft"];
}

/** Every Guildie.lua under <wow>/_*_/WTF/Account/<account>/SavedVariables/, Forever's folder first. */
function findSavedVariables(config: Config): string[] {
	const found: string[] = [];
	for (const root of wowCandidates(config)) {
		if (!existsSync(root)) continue;
		// Each game version has its own folder (_retail_, _classic_, ...). We don't
		// know Forever's folder name for sure, so look in all of them.
		const flavors = readdirSync(root)
			.filter((d) => /^_.+_$/.test(d))
			.sort((a, b) => Number(b.includes("forever")) - Number(a.includes("forever")));
		for (const flavor of flavors) {
			const accounts = join(root, flavor, "WTF", "Account");
			if (!existsSync(accounts)) continue;
			for (const account of readdirSync(accounts)) {
				const file = join(accounts, account, "SavedVariables", "Guildie.lua");
				if (existsSync(file)) found.push(file);
			}
		}
	}
	return found;
}

async function ensureToken(config: Config) {
	const prompt = createInterface({ input: process.stdin, output: process.stdout });
	let ask = args.includes("--token");
	while (true) {
		if (!config.token || ask) {
			console.log(`\nMake a token on your guildie account page (${new URL("/me", config.api)}), then paste it here.`);
			config.token = (await prompt.question("Token: ")).trim();
			ask = false;
		}
		const res = await request(config, "/api/helper/me").catch((e: Error) => e);
		if (res instanceof Error) {
			log(`Can't reach ${config.api}: ${res.message}. Retrying in 30s.`);
			await Bun.sleep(RESCAN_MS);
			continue;
		}
		if (res.ok) {
			const me = (await res.json()) as { battletag: string | null; characters: string[] };
			prompt.close();
			saveConfig(config);
			log(`Signed in as ${me.battletag ?? "you"}. Claimed characters: ${me.characters.join(", ") || "none yet (claim them on your account page)"}.`);
			return;
		}
		log("That token didn't work. Make a new one on your account page.");
		config.token = undefined;
	}
}

async function upload(config: Config, file: string, payload: string) {
	const res = await request(config, "/api/helper/snapshot", { method: "POST", body: payload });
	const body = (await res.json().catch(() => ({}))) as { accepted?: string[]; unmatched?: string[]; error?: string };
	if (!res.ok) {
		log(`Upload failed (${res.status}): ${body.error ?? "unknown error"}`);
		return false;
	}
	log(`Uploaded from ${file}`);
	if (body.accepted?.length) log(`  updated: ${body.accepted.join(", ")}`);
	if (body.unmatched?.length) log(`  not claimed on guildie (skipped): ${body.unmatched.join(", ")}`);
	return true;
}

async function main() {
	const config = loadConfig();
	if (flag("--api")) config.api = flag("--api")!;
	if (flag("--wow")) config.wow = flag("--wow")!;
	console.log(`guildie helper: uploads the guildie addon's data to ${config.api}`);
	await ensureToken(config);

	const seen = new Map<string, { mtime: number; payload: string | null; retryAt?: number }>();
	let files: string[] = [];
	let lastScan = 0;
	while (true) {
		if (Date.now() - lastScan > RESCAN_MS || files.length === 0) {
			const next = findSavedVariables(config);
			if (next.join() !== files.join()) {
				files = next;
				if (files.length) log(`Watching:\n  ${files.join("\n  ")}`);
				else log("No Guildie.lua yet. Install the addon, log in, and /reload (or pass --wow <folder>).");
			}
			lastScan = Date.now();
		}
		for (const file of files) {
			let mtime: number;
			try {
				mtime = statSync(file).mtimeMs;
			} catch {
				continue;
			}
			const before = seen.get(file);
			if (before && before.mtime === mtime) continue;
			if (before?.retryAt && Date.now() < before.retryAt) continue;
			const payload = extractPayload(readFileSync(file, "utf8"));
			// Upload whenever the saved data differs from what we last sent (also on
			// startup; the server keeps only the newest snapshot per character).
			if (payload && payload !== before?.payload) {
				const ok = await upload(config, file, payload).catch((e: Error) => {
					log(`Upload failed: ${e.message}`);
					return false;
				});
				seen.set(file, ok ? { mtime, payload } : { mtime: 0, payload: before?.payload ?? null, retryAt: Date.now() + RESCAN_MS });
			} else {
				seen.set(file, { mtime, payload: before?.payload ?? payload });
			}
		}
		await Bun.sleep(POLL_MS);
	}
}

await main();
