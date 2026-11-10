import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_API = "https://guildie.club";

export function configDir() {
	if (process.platform === "win32") return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "guildie");
	if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "guildie");
	return join(homedir(), ".config", "guildie");
}

/** Tokens are kept per site, so a preview's token never follows you to guildie.club. */
export type Config = { tokens: Record<string, { token: string; account?: string }>; wow?: string };

const file = () => join(configDir(), "helper-config.json");

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

/** Log to the file (and the console when there is one). Keeps the file under ~1 MB. */
export function makeLogger(toConsole: boolean) {
	mkdirSync(configDir(), { recursive: true });
	try {
		if (existsSync(logPath()) && statSync(logPath()).size > 1_000_000) writeFileSync(logPath(), "");
	} catch {}
	return (...parts: unknown[]) => {
		const line = `[${new Date().toLocaleString()}] ${parts.map(String).join(" ")}`;
		if (toConsole) console.log(line);
		try {
			appendFileSync(logPath(), `${line}\n`);
		} catch {}
	};
}
