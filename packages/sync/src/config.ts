import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// Where the helper keeps its settings and log (the desktop app keeps its own
// next to them, in desktop/).

export const DEFAULT_API = "https://guildie.club";

export function configDir() {
	if (process.platform === "win32")
		return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "guildie");
	if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "guildie");
	return join(homedir(), ".config", "guildie");
}

/** Tokens are kept per site, so a preview's token never follows you to guildie.club. */
export type Config = { tokens: Record<string, { token: string; account?: string }>; wow?: string };

const file = () => join(configDir(), "helper-config.json");

/** The helper's settings (the desktop app reads its WoW folder as a starting point). */
export function loadConfig(): Config {
	try {
		const raw = JSON.parse(readFileSync(file(), "utf8"));
		return { tokens: raw.tokens ?? {}, wow: raw.wow };
	} catch {
		return { tokens: {} };
	}
}

export function saveConfig(config: Config) {
	mkdirSync(configDir(), { recursive: true });
	writeFileSync(file(), JSON.stringify(config, null, 2));
}

export const logPath = () => join(configDir(), "helper.log");

export type Log = (...parts: unknown[]) => void;

/** Log to the file (and the console when there is one). Keeps the file under ~1 MB. */
export function makeLogger(toConsole: boolean, path = logPath()): Log {
	mkdirSync(dirname(path), { recursive: true });
	try {
		if (existsSync(path) && statSync(path).size > 1_000_000) writeFileSync(path, "");
	} catch {}
	return (...parts: unknown[]) => {
		const line = `[${new Date().toLocaleString()}] ${parts.map(String).join(" ")}`;
		if (toConsole) console.log(line);
		try {
			appendFileSync(path, `${line}\n`);
		} catch {}
	};
}
