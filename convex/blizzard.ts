import { v } from "convex/values";
import { internal } from "./_generated/api";
import { type ActionCtx, internalMutation, internalQuery } from "./_generated/server";
import { vRegion } from "./schema";
import { BATTLENET_TOKEN } from "./authBattlenet";
import { FLAVORS, type Flavor, type NamespaceKind, type Region } from "./shared/wow";

// A thin Blizzard API client for actions. The app authenticates with the
// client-credentials grant (no user involved) for public data: guilds,
// rosters and character profiles.

function clientCredentials() {
	const id = process.env.BATTLENET_CLIENT_ID;
	const secret = process.env.BATTLENET_CLIENT_SECRET;
	if (!id || !secret || id === "unset") {
		throw new Error("BATTLENET_CLIENT_ID / BATTLENET_CLIENT_SECRET are not set (docs/blizzard-setup.md)");
	}
	return { id, secret, basic: `Basic ${btoa(`${id}:${secret}`)}` };
}

export async function exchangeToken(body: URLSearchParams) {
	const res = await fetch(BATTLENET_TOKEN, {
		method: "POST",
		headers: {
			Authorization: clientCredentials().basic,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body,
	});
	if (!res.ok) throw new Error(`Battle.net token request failed: ${res.status} ${await res.text()}`);
	return (await res.json()) as { access_token: string; expires_in: number; scope?: string };
}

export const cachedToken = internalQuery({
	args: { region: vRegion },
	handler: async (ctx, { region }) => {
		const row = await ctx.db
			.query("apiTokens")
			.withIndex("by_region", (q) => q.eq("region", region))
			.unique();
		// Keep a margin so a token never expires mid-sync.
		return row && row.expiresAt > Date.now() + 5 * 60_000 ? row.token : null;
	},
});

export const storeToken = internalMutation({
	args: { region: vRegion, token: v.string(), expiresAt: v.number() },
	handler: async (ctx, args) => {
		const row = await ctx.db
			.query("apiTokens")
			.withIndex("by_region", (q) => q.eq("region", args.region))
			.unique();
		if (row) await ctx.db.patch(row._id, args);
		else await ctx.db.insert("apiTokens", args);
	},
});

export async function appToken(ctx: ActionCtx, region: Region) {
	const cached = await ctx.runQuery(internal.blizzard.cachedToken, { region });
	if (cached) return cached;
	const { access_token, expires_in } = await exchangeToken(
		new URLSearchParams({ grant_type: "client_credentials" }),
	);
	await ctx.runMutation(internal.blizzard.storeToken, {
		region,
		token: access_token,
		expiresAt: Date.now() + expires_in * 1000,
	});
	return access_token;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number };

/** GET a Blizzard API path. 404 is an expected answer (not found yet), so it isn't thrown. */
export async function blizzardGet<T>(args: {
	token: string;
	flavor: Flavor;
	region: Region;
	path: string;
	namespace: NamespaceKind;
}): Promise<ApiResult<T>> {
	const url = new URL(`https://${args.region}.api.blizzard.com${args.path}`);
	url.searchParams.set("namespace", FLAVORS[args.flavor].namespace(args.namespace, args.region));
	url.searchParams.set("locale", "en_US");
	const res = await fetch(url, { headers: { Authorization: `Bearer ${args.token}` } });
	if (res.status === 404) return { ok: false, status: 404 };
	if (!res.ok) throw new Error(`Blizzard API ${res.status} for ${args.path}: ${await res.text()}`);
	return { ok: true, data: (await res.json()) as T };
}
