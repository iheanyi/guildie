import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Api, isTokenShaped } from "./api.ts";
import { displayName, SyncEngine } from "./sync.ts";
import { findAddonFolders, findSavedVariables, findWowFolder } from "./watcher.ts";

/** A WoW folder with Forever and Classic, the addon installed in Forever, and a saved file. */
function fakeWow(payload = '{"version":1,"characters":[]}') {
	const wow = mkdtempSync(join(tmpdir(), "guildie-wow-"));
	const saved = join(wow, "_forever_", "WTF", "Account", "ACCOUNT1", "SavedVariables");
	mkdirSync(saved, { recursive: true });
	mkdirSync(join(wow, "_classic_", "WTF", "Account"), { recursive: true });
	const addon = join(wow, "_forever_", "Interface", "AddOns", "Guildie");
	mkdirSync(addon, { recursive: true });
	writeFileSync(join(addon, "Guildie.toc"), "## Title: Guildie\n");
	const file = join(saved, "Guildie.lua");
	writeFileSync(file, `GuildieDB = {\n\t["payload"] = "${payload.replace(/"/g, '\\"')}",\n}\n`);
	return { wow, file, addon };
}

type Call = { path: string; search?: string; method: string; auth?: string; body?: string };

/** An Api whose requests are answered by `answer` and recorded in `calls`. */
function fakeApi(answer: (call: Call) => { status: number; body: unknown }) {
	const calls: Call[] = [];
	const api = new Api("https://guildie.test", "gld_abcdefghijklmnopqrstuvwxyz012345", async (url, init) => {
		const headers = init.headers as Record<string, string>;
		const call = { path: new URL(url).pathname, search: new URL(url).search, method: init.method ?? "GET", auth: headers.Authorization, body: init.body as string | undefined };
		calls.push(call);
		const { status, body } = answer(call);
		return new Response(JSON.stringify(body), { status });
	});
	return { api, calls };
}

test("finds the install, its saved files and addon folders", () => {
	const { wow, file, addon } = fakeWow();
	assert.equal(findWowFolder(wow), wow);
	assert.equal(findWowFolder(join(wow, "nope")), undefined);
	assert.deepEqual(findSavedVariables(wow), [file]);
	assert.deepEqual(findAddonFolders(wow), [addon]);
});

test("uploads once per change, downloads guild data, writes GuildieData.lua", async () => {
	const { wow, file, addon } = fakeWow('{"version":1,"characters":[{"name":"Brenna"}]}');
	const { api, calls } = fakeApi(({ path }) =>
		path === "/api/helper/snapshot"
			? { status: 200, body: { accepted: ["brenna-ironfoot"], unmatched: ["Alt"] } }
			: {
					status: 200,
					body: { version: 2, generatedAt: 1, guilds: { "us/dawn": { name: "Dawn", region: "us", slug: "dawn", generatedAt: 1, reagents: {} } } },
				},
	);
	const uploads: string[][] = [];
	const unmatched: string[][] = [];
	const engine = new SyncEngine(api, wow, {
		log: () => {},
		onUnauthorized: () => assert.fail("not expected"),
		onUpload: (u) => uploads.push(u.characters),
		onUnmatched: (names) => unmatched.push(names),
	});
	await engine.tick();
	assert.deepEqual(
		calls.map((c) => c.path),
		["/api/helper/snapshot", "/api/helper/guild-data"],
	);
	assert.equal(calls[0]?.auth, "Bearer gld_abcdefghijklmnopqrstuvwxyz012345");
	assert.deepEqual(JSON.parse(calls[0]?.body ?? ""), { version: 1, characters: [{ name: "Brenna" }] });
	assert.deepEqual(uploads, [["brenna-ironfoot"]]);
	assert.deepEqual(unmatched, [["Alt"]]);
	assert.equal(calls[1]?.search, "?v=2");
	assert.ok(readFileSync(join(addon, "GuildieData.lua"), "utf8").includes('["guilds"]={["us/dawn"]={["name"]="Dawn"'));
	assert.ok(engine.guildDataAt);

	// Nothing changed: nothing to do.
	await engine.tick();
	assert.equal(calls.length, 2);

	// "Upload now" sends it again; the unmatched name isn't repeated.
	engine.now();
	await engine.tick();
	assert.equal(calls.length, 4);
	assert.deepEqual(unmatched, [["Alt"]]);

	// The game rewrites the file with something new.
	writeFileSync(file, 'GuildieDB = { ["payload"] = "{\\"version\\":1,\\"characters\\":[{\\"name\\":\\"Corwin\\"}]}" }');
	const later = new Date(Date.now() + 5_000);
	utimesSync(file, later, later);
	await engine.tick();
	assert.equal(calls.length, 5);
	assert.ok(calls[4]?.body?.includes("Corwin"));
});

test("a 401 disconnects", async () => {
	const { wow } = fakeWow();
	const { api } = fakeApi(() => ({ status: 401, body: { error: "Unknown or revoked token" } }));
	let disconnected = 0;
	const engine = new SyncEngine(api, wow, {
		log: () => {},
		onUnauthorized: () => {
			disconnected++;
			api.token = undefined;
		},
	});
	await engine.tick();
	assert.equal(disconnected, 1);
	assert.equal(engine.lastUpload, undefined);
});

test("token shape and display names", () => {
	assert.ok(isTokenShaped("gld_abcdefghijklmnopqrstuvwxyz012345"));
	assert.ok(!isTokenShaped("gld_short"));
	assert.ok(!isTokenShaped("abc_abcdefghijklmnopqrstuvwxyz012345"));
	assert.ok(!isTokenShaped("gld_abcdefghijklmnop qrstuvwxyz012345"));
	assert.ok(!isTokenShaped(42));
	assert.equal(displayName("brenna-ironfoot"), "Brenna");
});

test("puts GuildieData.lua back when an addon update removes it", async () => {
	const { wow, addon } = fakeWow();
	const { api, calls } = fakeApi(({ path }) =>
		path === "/api/helper/snapshot" ? { status: 200, body: { accepted: [] } } : { status: 200, body: { version: 2, generatedAt: 1, guilds: {} } },
	);
	const engine = new SyncEngine(api, wow, { log: () => {}, onUnauthorized: () => assert.fail("not expected") });
	await engine.tick();
	const file = join(addon, "GuildieData.lua");
	const content = readFileSync(file, "utf8");
	rmSync(file);
	(engine as unknown as { lastGuildDataCheck: number }).lastGuildDataCheck = 0;
	await engine.tick();
	assert.equal(readFileSync(file, "utf8"), content);
	assert.equal(calls.filter((c) => c.path === "/api/helper/guild-data").length, 1, "rewritten from memory, not downloaded again");
});
