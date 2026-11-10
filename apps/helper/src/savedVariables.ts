// Reads the payload the Guildie addon (apps/addon) leaves in its
// SavedVariables file: GuildieDB = { ..., ["payload"] = "<JSON>", ... }.

/** The JSON string stored under ["payload"], unescaped from Lua; null if absent. */
export function extractPayload(lua: string): string | null {
	const match = lua.match(/\["payload"\]\s*=\s*"((?:[^"\\]|\\[\s\S])*)"/);
	return match ? unescapeLua(match[1]) : null;
}

/** Undo Lua's %q-style escaping, which is how the game writes SavedVariables strings. */
export function unescapeLua(s: string): string {
	return s.replace(/\\(\d{1,3}|[\s\S])/g, (_, c: string) => {
		if (/^\d+$/.test(c)) return String.fromCharCode(Number(c));
		const map: Record<string, string> = { n: "\n", r: "\r", t: "\t", a: "\x07", b: "\b", f: "\f", v: "\v", "\\": "\\", '"': '"', "'": "'", "\n": "\n" };
		return map[c] ?? c;
	});
}
