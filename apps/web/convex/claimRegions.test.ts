import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchAccountCharacters, guildOfProfile, slugOf } from "./claimRegions.ts";

const REGIONS = ["us", "eu", "kr", "tw"] as const;
const namespace = (region: string) => `profile-forever-${region}`;

function fakeFetch(byRegion: Record<string, () => Response | Promise<Response>>) {
	const calls: { url: string; auth: string | null }[] = [];
	const fn = (async (input: URL | RequestInfo, init?: RequestInit) => {
		const url = new URL(String(input));
		calls.push({ url: url.toString(), auth: new Headers(init?.headers).get("authorization") });
		const region = url.hostname.split(".")[0];
		return await byRegion[region]();
	}) as typeof fetch;
	return { fn, calls };
}

const account = (characters: unknown[]) =>
	new Response(JSON.stringify({ wow_accounts: [{ characters }] }), { status: 200 });

test("asks every region's host with the user token and the region's namespace", async () => {
	const { fn, calls } = fakeFetch({
		us: () => account([]),
		eu: () => account([]),
		kr: () => account([]),
		tw: () => account([]),
	});
	await fetchAccountCharacters({ token: "tok", regions: REGIONS, namespace, fetch: fn });
	assert.equal(calls.length, 4);
	for (const region of REGIONS) {
		const call = calls.find((c) => c.url.startsWith(`https://${region}.api.blizzard.com/profile/user/wow?`));
		assert.ok(call, region);
		assert.equal(new URL(call.url).searchParams.get("namespace"), `profile-forever-${region}`);
		assert.equal(call.auth, "Bearer tok");
	}
});

test("404 is 'none', other failures are per-region errors, the rest still count", async () => {
	const { fn } = fakeFetch({
		us: () =>
			account([
				{ id: 7, name: "Brenna", surname: "Ashvale", level: 23, playable_class: { id: 5 } },
				{ id: 8, name: "Corwin", level: 9, character: { href: "https://us.api.blizzard.com/profile/wow/character/corwin-stone?namespace=x" } },
			]),
		eu: () => new Response("not found", { status: 404 }),
		kr: () => new Response("boom", { status: 500 }),
		tw: () => {
			throw new Error("network down");
		},
	});
	const results = await fetchAccountCharacters({ token: "tok", regions: REGIONS, namespace, fetch: fn });
	const by = Object.fromEntries(results.map((r) => [r.region, r]));
	assert.equal(by.us.status, "ok");
	assert.deepEqual(by.us.status === "ok" && by.us.characters, [
		{ slug: "brenna-ashvale", blizzardId: 7, name: "Brenna", level: 23, classId: 5 },
		{ slug: "corwin-stone", blizzardId: 8, name: "Corwin", level: 9, classId: undefined },
	]);
	assert.equal(by.eu.status, "none");
	assert.equal(by.kr.status, "error");
	assert.match(by.kr.status === "error" ? by.kr.error : "", /^500 boom/);
	assert.equal(by.tw.status, "error");
	assert.match(by.tw.status === "error" ? by.tw.error : "", /network down/);
});

test("an account with no wow_accounts is an empty list", async () => {
	const { fn } = fakeFetch({ us: () => new Response("{}", { status: 200 }) });
	assert.deepEqual(await fetchAccountCharacters({ token: "t", regions: ["us"], namespace, fetch: fn }), [
		{ region: "us", status: "ok", characters: [] },
	]);
});

test("slugs", () => {
	assert.equal(slugOf({ name: "Brenna", surname: "Ashvale" }), "brenna-ashvale");
	assert.equal(slugOf({ name: "Zoë" }), "zoë");
});

test("guild from a character profile", () => {
	assert.deepEqual(guildOfProfile({ guild: { name: "The Long Watch" } }), { name: "The Long Watch", slug: "the-long-watch" });
	assert.deepEqual(guildOfProfile({ guild: { name: "Ember", slug: "ember" } }), { name: "Ember", slug: "ember" });
	assert.equal(guildOfProfile({}), null);
	assert.equal(guildOfProfile(undefined), null);
});
