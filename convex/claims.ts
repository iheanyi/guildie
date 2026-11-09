import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, mutation } from "./_generated/server";
import { routingPrefix } from "./authGateway";
import { allowedRedirectOrigins } from "./origins";
import { BATTLENET_AUTHORIZE } from "./authBattlenet";
import { exchangeToken } from "./blizzard";
import { vRegion } from "./schema";
import { requireUserId } from "./users";
import { FLAVORS, type Region } from "./shared/wow";

// "Claim my characters": a second, explicit Battle.net authorization with the
// wow.profile scope. We read the account's character list once, keep the
// names, and drop the Blizzard token.
//
// Battle.net redirects to <CONVEX_SITE_URL>/oauth/claim/callback, or to the
// gateway's /oauth/claim/callback when sign-in goes through the gateway
// (AUTH_BATTLENET_CALLBACK_URL set; docs/auth-environments.md). That endpoint (convex/http.ts) bounces the
// browser to the app, and the app completes the claim. Completing requires
// the same browser (state in sessionStorage) and being signed in as the
// person who started, so a claim link can't attach someone else's characters
// to your account.

const REQUEST_TTL_MS = 10 * 60_000;

function randomToken() {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256(value: string) {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Where Battle.net sends the browser. Behind the gateway it's the gateway's
 * claim callback, next to its sign-in one; otherwise ours.
 */
function claimCallbackUrl() {
	const site = process.env.CONVEX_SITE_URL;
	if (!site) throw new Error("CONVEX_SITE_URL is not set");
	const signIn = process.env.AUTH_BATTLENET_CALLBACK_URL;
	if (!signIn) return `${site}/oauth/claim/callback`;
	const claim = signIn.replace(/\/oauth\/battlenet\/callback$/, "/oauth/claim/callback");
	if (claim === signIn) throw new Error("AUTH_BATTLENET_CALLBACK_URL must end in /oauth/battlenet/callback");
	return claim;
}

export const start = mutation({
	args: { region: vRegion, origin: v.string() },
	handler: async (ctx, { region, origin }) => {
		const userId = await requireUserId(ctx);
		const clientId = process.env.AUTH_BATTLENET_CLIENT_ID;
		if (!clientId || clientId === "unset") throw new ConvexError("Battle.net isn't configured on this deployment");
		if (!allowedRedirectOrigins.includes(origin)) throw new ConvexError("Unknown origin");
		const state = randomToken();
		const callbackUrl = claimCallbackUrl();
		await ctx.db.insert("claimRequests", {
			userId,
			stateHash: await sha256(state),
			region,
			origin,
			callbackUrl,
			expiresAt: Date.now() + REQUEST_TTL_MS,
		});
		// Behind the gateway, the deployment signs its address into the state
		// Battle.net echoes back (convex/authGateway.ts).
		const secret = process.env.AUTH_GATEWAY_SECRET;
		const site = process.env.CONVEX_SITE_URL!;
		const sentState = secret ? `${await routingPrefix(secret, "claim", site)}${state}` : state;
		const url = new URL(BATTLENET_AUTHORIZE);
		url.searchParams.set("client_id", clientId);
		url.searchParams.set("response_type", "code");
		url.searchParams.set("scope", "wow.profile");
		url.searchParams.set("state", sentState);
		url.searchParams.set("redirect_uri", callbackUrl);
		return { url: url.toString(), state };
	},
});

/** The app origin a pending request returns to (convex/http.ts). */
export const originFor = internalQuery({
	args: { stateHash: v.string() },
	handler: async (ctx, { stateHash }) => {
		const request = await ctx.db
			.query("claimRequests")
			.withIndex("by_stateHash", (q) => q.eq("stateHash", stateHash))
			.unique();
		return request && request.expiresAt > Date.now() ? request.origin : null;
	},
});

/** Claims the pending request for the signed-in user. One use. */
export const consume = internalMutation({
	args: { stateHash: v.string() },
	handler: async (ctx, { stateHash }) => {
		const userId = await getAuthUserId(ctx);
		const request = await ctx.db
			.query("claimRequests")
			.withIndex("by_stateHash", (q) => q.eq("stateHash", stateHash))
			.unique();
		if (!request) return null;
		await ctx.db.delete(request._id);
		if (request.userId !== userId || request.expiresAt < Date.now()) return null;
		return { userId: request.userId, region: request.region, callbackUrl: request.callbackUrl };
	},
});

const vOwned = v.object({
	slug: v.string(),
	name: v.string(),
	level: v.optional(v.number()),
	classId: v.optional(v.number()),
});

export const save = internalMutation({
	args: { userId: v.id("users"), region: vRegion, characters: v.array(vOwned) },
	handler: async (ctx, { userId, region, characters }) => {
		// Replace this account's claims for the region: the list is the truth.
		const existing = await ctx.db
			.query("ownedCharacters")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		for (const row of existing) if (row.region === region) await ctx.db.delete(row._id);
		const now = Date.now();
		let inGuilds = 0;
		for (const c of characters) {
			// A character can only be claimed by one person at a time: the latest proof wins.
			const previous = await ctx.db
				.query("ownedCharacters")
				.withIndex("by_slug", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", c.slug))
				.collect();
			for (const row of previous) await ctx.db.delete(row._id);
			await ctx.db.insert("ownedCharacters", { ...c, userId, flavor: "forever", region, claimedAt: now });
			const member = await ctx.db
				.query("characters")
				.withIndex("by_slug", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", c.slug))
				.first();
			if (member?.inRoster) inGuilds++;
		}
		return inGuilds;
	},
});

type AccountProfile = {
	wow_accounts?: {
		characters?: {
			name: string;
			surname?: string;
			level?: number;
			playable_class?: { id: number };
			character?: { href?: string };
		}[];
	}[];
};

function slugOf(c: { name: string; surname?: string; character?: { href?: string } }) {
	if (c.surname) return `${c.name}-${c.surname}`.toLowerCase();
	const fromHref = c.character?.href?.match(/\/character\/([^/?]+)(?:\?|$)/)?.[1];
	return decodeURIComponent(fromHref ?? c.name).toLowerCase();
}

export const complete = action({
	args: { code: v.string(), state: v.string() },
	handler: async (ctx, { code, state }): Promise<{ total: number; inGuilds: number }> => {
		const request = await ctx.runMutation(internal.claims.consume, { stateHash: await sha256(state) });
		if (!request) throw new ConvexError("This claim link expired or isn't yours. Start again.");
		const { access_token } = await exchangeToken(
			new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: request.callbackUrl }),
		);
		const region = request.region as Region;
		const url = new URL(`https://${region}.api.blizzard.com/profile/user/wow`);
		url.searchParams.set("namespace", FLAVORS.forever.namespace("profile", region));
		url.searchParams.set("locale", "en_US");
		const res = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
		// 404: no characters in this flavor + region on the account.
		if (res.status !== 404 && !res.ok) throw new Error(`Account profile failed: ${res.status} ${await res.text()}`);
		const profile: AccountProfile = res.status === 404 ? {} : await res.json();
		const characters = (profile.wow_accounts ?? []).flatMap((a) => a.characters ?? []).map((c) => ({
			slug: slugOf(c),
			name: c.name,
			level: c.level,
			classId: c.playable_class?.id,
		}));
		const inGuilds: number = await ctx.runMutation(internal.claims.save, {
			userId: request.userId as Id<"users">,
			region,
			characters,
		});
		return { total: characters.length, inGuilds };
	},
});
