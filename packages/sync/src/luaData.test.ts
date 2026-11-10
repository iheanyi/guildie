import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { guildDataFile, toLua, writeGuildData } from "./luaData.ts";

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

test("file header", () => {
	assert.ok(guildDataFile({ version: 1 }).startsWith("-- Written by the Guildie app"));
});

test("writes UTF-8 bytes, and only when the content changes", () => {
	const folder = mkdtempSync(join(tmpdir(), "guildie-addon-"));
	const data = { generatedAt: 1, guilds: ["Ðawn"], reagents: { 2589: { name: "Linen Cloth" } } };
	assert.deepEqual(
		writeGuildData([folder], data, () => {}),
		[join(folder, "GuildieData.lua")],
	);
	const file = readFileSync(join(folder, "GuildieData.lua"), "utf8");
	assert.ok(file.includes('["guilds"]={"Ðawn"}'));
	const mtime = statSync(join(folder, "GuildieData.lua")).mtimeMs;
	assert.deepEqual(
		writeGuildData([folder], data, () => {}),
		[],
	);
	assert.equal(statSync(join(folder, "GuildieData.lua")).mtimeMs, mtime);
});

test("gear-upgrade data: numeric keys as Lua numbers, decimals and spec keys kept", () => {
	const lua = toLua({
		upgrades: {
			version: 1,
			rules: {
				upgrade: 0.15,
				specs: { "DRUID:1": { name: "Feral", w: { AGILITY: 1, ARMOR: 0.08 } } },
				classes: { 11: { armor: { 1: 1, 2: 1 } } },
			},
			members: [{ name: "Brisket", classId: 11, slots: { 10: 8.5, 16: 12 }, worn: [5001] }],
		},
	});
	assert.equal(
		lua,
		'{["upgrades"]={["version"]=1,["rules"]={["upgrade"]=0.15,["specs"]={["DRUID:1"]={["name"]="Feral",["w"]={["AGILITY"]=1,["ARMOR"]=0.08}}},["classes"]={[11]={["armor"]={[1]=1,[2]=1}}}},["members"]={{["name"]="Brisket",["classId"]=11,["slots"]={[10]=8.5,[16]=12},["worn"]={5001}}}}}',
	);
});
