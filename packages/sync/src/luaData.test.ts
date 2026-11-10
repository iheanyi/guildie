import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import type { GuildData } from "./api.ts";
import { bundleFile, guildDataFile, toLua, writeGuildData } from "./luaData.ts";

test("data literals only, strings escaped", () => {
	assert.equal(
		toLua({ reagents: { 2589: { name: 'Linen "Cloth"\\', users: [{ name: "Ðemo", recipes: 3 }] } } }),
		'{["reagents"]={[2589]={["name"]="Linen \\"Cloth\\"\\\\",["users"]={{["name"]="\xc3\x90emo",["recipes"]=3}}}}}',
	);
});

test("a name can't break out of its string", () => {
	const lua = toLua({ name: '"]=1} os.exit() --\n' });
	assert.equal(lua, '{["name"]="\\"]=1} os.exit() --\\10"}');
});

test("file headers", () => {
	assert.ok(guildDataFile({ version: 2 }).startsWith("-- Written by the Guildie app"));
	assert.ok(bundleFile({ version: 2 }).includes("\nGuildieBundle = {[\"version\"]=2}\n"));
});

test("writes UTF-8 bytes, and only when the content changes", () => {
	const folder = mkdtempSync(join(tmpdir(), "guildie-addon-"));
	const data: GuildData = {
		version: 2,
		generatedAt: 1,
		guilds: { "eu/ðawn": { name: "Ðawn", region: "eu", slug: "ðawn", generatedAt: 1, reagents: { 2589: { name: "Linen Cloth" } } } },
	};
	assert.deepEqual(writeGuildData([folder], data, () => {}), [join(folder, "GuildieData.lua")]);
	const file = readFileSync(join(folder, "GuildieData.lua"), "utf8");
	assert.ok(file.includes('["guilds"]={["eu/ðawn"]={["name"]="Ðawn"'));
	const mtime = statSync(join(folder, "GuildieData.lua")).mtimeMs;
	assert.deepEqual(writeGuildData([folder], data, () => {}), []);
	assert.equal(statSync(join(folder, "GuildieData.lua")).mtimeMs, mtime);
});
