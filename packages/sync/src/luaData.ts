import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { GuildData } from "./api.ts";
import type { Log } from "./config.ts";

// Turns the guild data from guildie.club into a Lua file the addon loads
// (GuildieData.lua). The game runs addon files as code, so everything here is
// written as plain data literals: numbers and fully escaped strings only.

function luaString(s: string) {
	let out = '"';
	for (const byte of new TextEncoder().encode(s)) {
		if (byte === 0x5c) out += "\\\\";
		else if (byte === 0x22) out += '\\"';
		else if (byte < 0x20 || byte === 0x7f) out += `\\${byte}`;
		// Other bytes (including UTF-8 sequences) are safe inside a Lua string.
		else out += String.fromCharCode(byte);
	}
	return `${out}"`;
}

export function toLua(value: unknown): string {
	if (value === null || value === undefined) return "nil";
	if (typeof value === "number") return Number.isFinite(value) ? String(value) : "nil";
	if (typeof value === "boolean") return value ? "true" : "false";
	if (typeof value === "string") return luaString(value);
	if (Array.isArray(value)) return `{${value.map(toLua).join(",")}}`;
	if (typeof value === "object") {
		const parts = Object.entries(value as Record<string, unknown>).map(([k, v]) => {
			const key = /^\d+$/.test(k) ? `[${k}]` : `[${luaString(k)}]`;
			return `${key}=${toLua(v)}`;
		});
		return `{${parts.join(",")}}`;
	}
	return "nil";
}

/** The whole file. Strings come out as UTF-8 bytes, one char each: write it as latin1 so each byte lands as-is. */
export function guildDataFile(data: unknown) {
	return `-- Written by the Guildie app from guildie.club; replaced on every refresh. Don't edit.\nGuildieData = ${toLua(data)}\n`;
}

/** Writes GuildieData.lua into each addon folder, only where it changed. Returns the files written. */
export function writeGuildData(folders: string[], data: GuildData, log: Log): string[] {
	const content = Buffer.from(guildDataFile(data), "latin1");
	const written: string[] = [];
	for (const folder of folders) {
		const file = join(folder, "GuildieData.lua");
		try {
			if (existsSync(file) && readFileSync(file).equals(content)) continue;
			writeFileSync(file, content);
			written.push(file);
			const upgrades = data.upgrades?.members?.length ?? 0;
			log(
				`Wrote guild data for ${data.guilds.join(", ") || "no guilds"} (${Object.keys(data.reagents).length} reagents, ${upgrades} guildmates for upgrades) to ${file}`,
			);
		} catch (e) {
			log(`Couldn't write ${file}: ${(e as Error).message}`);
		}
	}
	return written;
}
