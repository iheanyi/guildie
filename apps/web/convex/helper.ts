import { ConvexError, type Infer, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { sha256 } from "./claims";
import type { vTalentTree } from "./schema";
import { TALENT_TREE_BY_ID } from "./shared/foreverTalents";
import { requireUserId } from "./users";

// The desktop helper (apps/helper) uploads what the guildie addon
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

export const createToken = mutation({
	args: { label: v.string() },
	handler: async (ctx, { label }) => {
		const userId = await requireUserId(ctx);
		const existing = await ctx.db
			.query("helperTokens")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		if (existing.length >= 10) throw new ConvexError("You have 10 helper tokens. Revoke one first.");
		const token = newToken();
		await ctx.db.insert("helperTokens", {
			userId,
			tokenHash: await sha256(token),
			label: label.trim().slice(0, 40) || "Helper",
			createdAt: Date.now(),
		});
		// Shown once; we keep only the hash.
		return token;
	},
});

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
