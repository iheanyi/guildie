import assert from "node:assert/strict";
import { test } from "node:test";
import { extractPayload } from "./savedVariables.ts";

test("extracts and unescapes the payload", () => {
	const json = JSON.stringify({ version: 1, characters: [{ name: 'Lich "the" Braz', talents: [{ id: 134214, rank: 5 }] }] });
	// How the game writes a string: backslashes and quotes escaped.
	const luaString = json.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
	const file = `\nGuildieDB = {\n\t["version"] = 1,\n\t["payload"] = "${luaString}",\n\t["lastReason"] = "PLAYER_LOGOUT",\n}\n`;
	assert.deepEqual(JSON.parse(extractPayload(file)!), JSON.parse(json));
});

test("decimal escapes", () => {
	assert.equal(extractPayload('GuildieDB = { ["payload"] = "a\\10b\\092" }'), "a\nb\\");
});

test("no payload yet", () => {
	assert.equal(extractPayload("GuildieDB = {}"), null);
});

test("a version 2 payload with tooltips and recipes survives the game's escaping", () => {
	const payload = {
		version: 2,
		characters: [
			{
				name: "Lich",
				equipment: { capturedAt: 1, items: [{ slot: 16, id: 2520, name: "Broadsword of the Eagle", tooltip: [{ left: 'Equip: "Quoted" \\ back\nslash', color: "#00ff00" }] }] },
				recipes: [{ profession: "Tailoring", capturedAt: 1, known: Array.from({ length: 400 }, (_, i) => ({ name: `Recipe ${i} — Ðawn`, item: i + 1 })) }],
			},
		],
	};
	const json = JSON.stringify(payload);
	const luaString = json.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
	assert.deepEqual(JSON.parse(extractPayload(`GuildieDB = {\n\t["payload"] = "${luaString}",\n}\n`)!), payload);
});
