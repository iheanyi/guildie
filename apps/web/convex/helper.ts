import { ConvexError, type Infer, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalQuery, mutation, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { buildGuildEntries, byRecipes, type GuildDataV2, guildKey, type ReagentUser } from "./addon";
import { sha256 } from "./claims";
import type { vTalentTree } from "./schema";
import { TALENT_TREE_BY_ID } from "./shared/foreverTalents";
import { requireUserId } from "./users";

// The desktop helper (apps/helper) uploads what the Guildie addon
// (apps/addon) saved in game. It authenticates with a token the player makes
// on their account page; only the token's hash is stored. Uploads are only
// accepted for characters the token's owner has claimed.
//
// Blizzard's data stays the fallback: an addon snapshot is shown only while
// it's newer than the last change we saw from Blizzard (see pickTalents).

/** One upload per token per this long. */
const MIN_UPLOAD_INTERVAL_MS = 5_000;
const MAX_CHARACTERS = 50;
const MAX_TALENTS = 120;

function newToken() {
	const bytes = crypto.getRandomValues(new Uint8Array(24));
	const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
	return `gld_${b64}`;
}

export const listTokens = query({
	args: {},
	handler: async (ctx) => {
		const userId = await requireUserId(ctx);
		const tokens = await ctx.db
			.query("helperTokens")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		return tokens.map(({ _id, label, createdAt, lastUsedAt }) => ({ _id, label, createdAt, lastUsedAt }));
	},
});

export const revokeToken = mutation({
	args: { tokenId: v.id("helperTokens") },
	handler: async (ctx, { tokenId }) => {
		const userId = await requireUserId(ctx);
		const token = await ctx.db.get(tokenId);
		if (token?.userId === userId) await ctx.db.delete(tokenId);
	},
});

async function tokenOwner(ctx: QueryCtx, token: string) {
	if (!token.startsWith("gld_")) return null;
	const tokenHash = await sha256(token);
	return await ctx.db
		.query("helperTokens")
		.withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
		.unique();
}

/** For the helper to check its token: who it belongs to and which characters it can upload. */
export const whoami = query({
	args: { token: v.string() },
	handler: async (ctx, { token }) => {
		const row = await tokenOwner(ctx, token);
		if (!row) return null;
		const user = await ctx.db.get(row.userId);
		const owned = await ctx.db
			.query("ownedCharacters")
			.withIndex("by_user", (q) => q.eq("userId", row.userId))
			.collect();
		return {
			battletag: user?.battletag ?? user?.name ?? null,
			characters: owned.map((c) => `${c.name} (${c.region.toUpperCase()})`),
		};
	},
});

const vUploadedCharacter = v.object({
	/** UnitGUID("player"), e.g. Player-1234-0A1B2C3D. */
	guid: v.string(),
	/** UnitName("player"). */
	name: v.string(),
	level: v.optional(v.number()),
	/** UnitClass's English token, e.g. PRIEST. */
	classToken: v.optional(v.string()),
	/** Game server time of the snapshot, seconds (GetServerTime()). */
	capturedAt: v.number(),
	talents: v.array(v.object({ id: v.number(), rank: v.number(), name: v.optional(v.string()) })),
});

/** The number in Player-<server>-<hex>: Blizzard's character id. */
function blizzardIdFromGuid(guid: string) {
	const hex = guid.match(/^Player-\d+-([0-9A-Fa-f]+)$/)?.[1];
	return hex ? Number.parseInt(hex, 16) : undefined;
}

async function treesFromRanks(ctx: MutationCtx, talents: Infer<typeof vUploadedCharacter>["talents"]) {
	const trees = new Map<string, Infer<typeof vTalentTree>>();
	for (const t of talents) {
		const where = TALENT_TREE_BY_ID.get(t.id);
		if (!where || t.rank <= 0) continue;
		const key = `${where.classToken}:${where.treeIndex}`;
		let tree = trees.get(key);
		if (!tree) {
			// Prefer Blizzard's id and name for the tree, learned from synced characters.
			const info = await ctx.db
				.query("talentTreeInfo")
				.withIndex("by_class_tree", (q) => q.eq("classToken", where.classToken).eq("treeIndex", where.treeIndex))
				.unique();
			tree = { id: info?.blizzardId ?? -(where.treeIndex + 1), name: info?.name ?? where.tree, points: 0, talents: [] };
			trees.set(key, tree);
		}
		tree.points += t.rank;
		tree.talents.push({ id: t.id, name: t.name ?? `Talent ${t.id}`, rank: t.rank });
	}
	return [...trees.values()].sort((a, b) => b.points - a.points);
}

/** Called by the /api/helper/snapshot route with the helper's token and the addon's data. */
export const ingest = mutation({
	args: { token: v.string(), characters: v.array(vUploadedCharacter) },
	handler: async (ctx, { token, characters }) => {
		const row = await tokenOwner(ctx, token);
		if (!row) throw new ConvexError("Unknown or revoked token");
		const now = Date.now();
		if (row.lastUsedAt && now - row.lastUsedAt < MIN_UPLOAD_INTERVAL_MS) throw new ConvexError("Too many uploads; slow down");
		if (characters.length > MAX_CHARACTERS) throw new ConvexError("Too many characters in one upload");
		await ctx.db.patch(row._id, { lastUsedAt: now });

		const owned = await ctx.db
			.query("ownedCharacters")
			.withIndex("by_user", (q) => q.eq("userId", row.userId))
			.collect();
		const accepted: string[] = [];
		const unmatched: string[] = [];
		for (const c of characters) {
			const match = matchOwned(owned, c);
			if (!match || c.talents.length > MAX_TALENTS) {
				unmatched.push(c.name);
				continue;
			}
			const capturedAt = c.capturedAt * 1000;
			// Don't trust a clock far in the future.
			if (capturedAt > now + 10 * 60_000) {
				unmatched.push(c.name);
				continue;
			}
			const existing = await ctx.db
				.query("addonSnapshots")
				.withIndex("by_slug", (q) => q.eq("flavor", match.flavor).eq("region", match.region).eq("slug", match.slug))
				.unique();
			const snapshot = {
				userId: row.userId,
				flavor: match.flavor,
				region: match.region,
				slug: match.slug,
				capturedAt,
				receivedAt: now,
				level: c.level,
				talentTrees: await treesFromRanks(ctx, c.talents),
			};
			if (!existing) await ctx.db.insert("addonSnapshots", snapshot);
			else if (existing.capturedAt <= capturedAt) await ctx.db.replace(existing._id, snapshot);
			accepted.push(match.slug);
		}
		return { accepted, unmatched };
	},
});

function matchOwned(owned: Doc<"ownedCharacters">[], c: Infer<typeof vUploadedCharacter>) {
	const id = blizzardIdFromGuid(c.guid);
	const byId = id !== undefined ? owned.find((o) => o.blizzardId === id) : undefined;
	if (byId) return byId;
	// Fallback: the first name, if exactly one claimed character has it.
	const byName = owned.filter((o) => o.name.toLowerCase() === c.name.toLowerCase());
	return byName.length === 1 ? byName[0] : undefined;
}

export type TalentSource = { kind: "addon" | "blizzard"; at?: number };

/**
 * The talents to show for a character: the addon's while its snapshot is
 * newer than the last change we saw from Blizzard, otherwise Blizzard's.
 */
export async function pickTalents(ctx: QueryCtx, character: Doc<"characters">) {
	const snapshot = await ctx.db
		.query("addonSnapshots")
		.withIndex("by_slug", (q) => q.eq("flavor", character.flavor).eq("region", character.region).eq("slug", character.slug))
		.unique();
	const blizzardAt = character.talentsChangedAt ?? character.profileSyncedAt ?? 0;
	if (snapshot && snapshot.capturedAt > blizzardAt) {
		return { talentTrees: snapshot.talentTrees, source: { kind: "addon", at: snapshot.capturedAt } as TalentSource };
	}
	return {
		talentTrees: character.talentTrees,
		source: { kind: "blizzard", at: character.profileSyncedAt } as TalentSource,
	};
}

// ---- Connecting the helper from the browser ---------------------------------

const PAIRING_TTL_MS = 10 * 60_000;
// No look-alike characters (0/O, 1/I/L), since people may type it.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function pairingCode() {
	const bytes = crypto.getRandomValues(new Uint8Array(8));
	const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
	return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

async function insertToken(ctx: MutationCtx, userId: Doc<"users">["_id"], label: string) {
	const existing = await ctx.db
		.query("helperTokens")
		.withIndex("by_user", (q) => q.eq("userId", userId))
		.collect();
	// Keep at most 10: connecting an 11th device retires the least recently used.
	if (existing.length >= 10) {
		const oldest = existing.sort((a, b) => (a.lastUsedAt ?? a.createdAt) - (b.lastUsedAt ?? b.createdAt))[0];
		await ctx.db.delete(oldest._id);
	}
	const token = newToken();
	await ctx.db.insert("helperTokens", {
		userId,
		tokenHash: await sha256(token),
		label: label.trim().slice(0, 40) || "Guildie app",
		createdAt: Date.now(),
	});
	return token;
}

/**
 * The Guildie desktop app shows our site in its window and asks for a token
 * through its bridge (src/lib/desktop.ts) once the player is signed in. Same
 * tokens as the helper's.
 */
export const issueDesktopToken = mutation({
	args: { label: v.string() },
	returns: v.string(),
	handler: async (ctx, { label }) => {
		const userId = await requireUserId(ctx);
		return await insertToken(ctx, userId, label || "Desktop app");
	},
});

/** The helper starts connecting: returns the code to show and the secret to poll with. */
export const startPairing = mutation({
	/** `session`: the desktop app, which also wants its window signed in. */
	args: { label: v.string(), session: v.optional(v.boolean()) },
	handler: async (ctx, { label, session }) => {
		// Tidy up pairings that have expired (a handful at most).
		for (const old of await ctx.db.query("helperPairings").take(50)) {
			if (old.expiresAt < Date.now()) await ctx.db.delete(old._id);
		}
		const pollSecret = newToken();
		const code = pairingCode();
		await ctx.db.insert("helperPairings", {
			code,
			pollSecretHash: await sha256(pollSecret),
			label: label.trim().slice(0, 40) || "Guildie app",
			expiresAt: Date.now() + PAIRING_TTL_MS,
			wantsSession: session || undefined,
		});
		return { code, pollSecret, expiresInSeconds: PAIRING_TTL_MS / 1000 };
	},
});

/** The connect page: what's asking to connect. */
export const pairing = query({
	args: { code: v.string() },
	handler: async (ctx, { code }) => {
		const row = await ctx.db
			.query("helperPairings")
			.withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
			.unique();
		if (!row) return { state: "unknown" as const };
		if (row.token || row.collectedAt) return { state: "approved" as const, label: row.label };
		if (row.expiresAt < Date.now()) return { state: "unknown" as const };
		return { state: "pending" as const, label: row.label };
	},
});

/** The signed-in player approves the code on /helper/connect. */
export const approvePairing = mutation({
	args: { code: v.string() },
	handler: async (ctx, { code }) => {
		const userId = await requireUserId(ctx);
		const row = await ctx.db
			.query("helperPairings")
			.withIndex("by_code", (q) => q.eq("code", code.trim().toUpperCase()))
			.unique();
		if (row?.token || row?.collectedAt) return;
		if (!row || row.expiresAt < Date.now()) throw new ConvexError("That code expired. Sign in from the Guildie app again.");
		let sessionCode: string | undefined;
		if (row.wantsSession) {
			sessionCode = newToken();
			await ctx.db.insert("desktopSessionCodes", {
				codeHash: await sha256(sessionCode),
				userId,
				expiresAt: Date.now() + 5 * 60_000,
			});
		}
		await ctx.db.patch(row._id, { userId, token: await insertToken(ctx, userId, row.label), sessionCode });
	},
});

/** The helper polls: pending, expired, or its token (once). */
export const pollPairing = mutation({
	args: { code: v.string(), pollSecret: v.string() },
	handler: async (ctx, { code, pollSecret }) => {
		const row = await ctx.db
			.query("helperPairings")
			.withIndex("by_code", (q) => q.eq("code", code))
			.unique();
		if (!row || row.pollSecretHash !== (await sha256(pollSecret))) return { status: "expired" as const };
		if (row.expiresAt < Date.now()) {
			await ctx.db.delete(row._id);
			return { status: "expired" as const };
		}
		if (row.collectedAt) return { status: "expired" as const };
		if (!row.token) return { status: "pending" as const };
		// Hand over once; keep the row (without secrets) so the Connect page
		// still shows "Connected". Expired rows go on the next startPairing.
		await ctx.db.patch(row._id, { token: undefined, sessionCode: undefined, collectedAt: Date.now() });
		return { status: "approved" as const, token: row.token, sessionCode: row.sessionCode };
	},
});

/** The helper signs out: its token stops working. */
export const signOut = mutation({
	args: { token: v.string() },
	handler: async (ctx, { token }) => {
		const row = await tokenOwner(ctx, token);
		if (row) await ctx.db.delete(row._id);
	},
});

// ---- Guild data for the addon's tooltips ------------------------------------
// Built per guild by addon.ts, shared with the addon release's bundle.

/** The original format: every guild's reagents merged. What Guildie app 0.2 and the helper ask for. */
export type GuildDataV1 = {
	version: 1;
	generatedAt: number;
	guilds: string[];
	mine: string[];
	reagents: Record<string, { name: string; users: ReagentUser[] }>;
};

/** The token's guilds (those its claimed characters are in) and its characters' names. */
export const guildDataBase = internalQuery({
	args: { token: v.string() },
	handler: async (ctx, { token }): Promise<{ mine: string[]; guildIds: Id<"guilds">[] } | null> => {
		const row = await tokenOwner(ctx, token);
		if (!row) return null;
		const owned = await ctx.db
			.query("ownedCharacters")
			.withIndex("by_user", (q) => q.eq("userId", row.userId))
			.collect();
		const guildIds = new Set<Id<"guilds">>();
		for (const c of owned) {
			const member = await ctx.db
				.query("characters")
				.withIndex("by_slug", (q) => q.eq("flavor", c.flavor).eq("region", c.region).eq("slug", c.slug))
				.first();
			if (member?.inRoster) guildIds.add(member.guildId);
		}
		return { mine: owned.map((c) => c.name), guildIds: [...guildIds] };
	},
});

/**
 * What the Guildie app writes to GuildieData.lua: the token's guilds, members-only
 * ones included. `version: 2` gives one entry per guild (what the addon keys
 * by guild); without it, the v1 shape older apps expect.
 */
export const guildData = action({
	args: { token: v.string(), version: v.optional(v.number()) },
	handler: async (ctx, { token, version }): Promise<GuildDataV1 | GuildDataV2 | null> => {
		const base: { mine: string[]; guildIds: Id<"guilds">[] } | null = await ctx.runQuery(internal.helper.guildDataBase, { token });
		if (!base) return null;
		const entries = await buildGuildEntries(ctx, base.guildIds, false);
		const generatedAt = Date.now();
		if (version === 2) {
			const guilds: GuildDataV2["guilds"] = {};
			for (const e of entries) guilds[guildKey(e.region, e.slug)] = e;
			return { version: 2, generatedAt, mine: base.mine, guilds };
		}
		const reagents: GuildDataV1["reagents"] = {};
		for (const e of entries) {
			for (const [itemId, r] of Object.entries(e.reagents)) {
				const merged = (reagents[itemId] ??= { name: r.name, users: [] });
				merged.users.push(...r.users);
			}
		}
		for (const r of Object.values(reagents)) r.users = r.users.sort(byRecipes).slice(0, 8);
		return { version: 1, generatedAt, guilds: entries.map((e) => e.name), mine: base.mine, reagents };
	},
});
