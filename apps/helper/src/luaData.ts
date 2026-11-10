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

/** The whole file. `bytes` is UTF-8 (written as latin1 so each byte lands as-is). */
export function guildDataFile(data: unknown) {
	return `-- Written by the Guildie helper from guildie.club; replaced on every refresh. Don't edit.\nGuildieData = ${toLua(data)}\n`;
}
