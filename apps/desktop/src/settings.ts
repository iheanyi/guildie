// What the app remembers, in <userData>/settings.json. Tokens are encrypted
// with Electron's safeStorage (DPAPI on Windows, the Keychain on macOS) and
// kept per site origin, so a preview's token never applies to guildie.club.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { app, safeStorage } from "electron";

export type Bounds = { x: number; y: number; width: number; height: number; maximized?: boolean };

type Stored = {
	/** origin -> encrypted token (base64) and the account it belongs to. */
	tokens: Record<string, { token: string; account?: string }>;
	wow?: string;
	bounds?: Bounds;
	/** The "still running in the tray" notice was shown once. */
	trayNoticeShown?: boolean;
};

const file = () => join(app.getPath("userData"), "settings.json");

let cache: Stored | undefined;

function load(): Stored {
	if (cache) return cache;
	try {
		const raw = JSON.parse(readFileSync(file(), "utf8")) as Partial<Stored>;
		cache = { ...raw, tokens: raw.tokens && typeof raw.tokens === "object" ? raw.tokens : {} };
	} catch {
		cache = { tokens: {} };
	}
	return cache;
}

function save() {
	const path = file();
	mkdirSync(dirname(path), { recursive: true });
	// Write then rename, so a crash never leaves half a file.
	writeFileSync(`${path}.tmp`, JSON.stringify(load(), null, 2));
	renameSync(`${path}.tmp`, path);
}

export const settings = {
	get wow() {
		return load().wow;
	},
	set wow(wow: string | undefined) {
		load().wow = wow;
		save();
	},
	get bounds() {
		return load().bounds;
	},
	set bounds(bounds: Bounds | undefined) {
		load().bounds = bounds;
		save();
	},
	get trayNoticeShown() {
		return !!load().trayNoticeShown;
	},
	set trayNoticeShown(shown: boolean) {
		load().trayNoticeShown = shown;
		save();
	},
};

/** The token saved for a site, decrypted; undefined if none (or it can't be decrypted here). */
export function loadToken(origin: string): { token: string; account?: string } | undefined {
	const saved = load().tokens[origin];
	if (!saved || !safeStorage.isEncryptionAvailable()) return undefined;
	try {
		return { token: safeStorage.decryptString(Buffer.from(saved.token, "base64")), account: saved.account };
	} catch {
		return undefined;
	}
}

/** Saves a site's token encrypted. Returns false when the OS can't encrypt (then it's kept for this run only). */
export function saveToken(origin: string, token: string, account?: string) {
	if (!safeStorage.isEncryptionAvailable()) return false;
	load().tokens[origin] = { token: safeStorage.encryptString(token).toString("base64"), account };
	save();
	return true;
}

export function forgetToken(origin: string) {
	if (!(origin in load().tokens)) return;
	delete load().tokens[origin];
	save();
}
