import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Which game a guild plays. Forever is the only one implemented; the field
 * exists so realm-based flavors (Classic Era, Anniversary) can be added
 * without reshaping data. See convex/wow/flavors.ts.
 */
export const vFlavor = v.literal("forever");
export const vRegion = v.union(v.literal("us"), v.literal("eu"), v.literal("kr"), v.literal("tw"));
export const vVisibility = v.union(v.literal("public"), v.literal("members"));

const vEquippedItem = v.object({
	slot: v.string(),
	itemId: v.number(),
	name: v.string(),
	quality: v.string(),
	itemLevel: v.optional(v.number()),
});

/** A talent tree with points in it, from the active talent group. */
export const vTalentTree = v.object({
	id: v.number(),
	name: v.string(),
	points: v.number(),
	/** `id` is the TraitDefinition ID (same in Blizzard's API and in game). */
	talents: v.array(v.object({ id: v.optional(v.number()), name: v.string(), rank: v.number() })),
});

const vProfession = v.object({
	id: v.number(),
	name: v.string(),
	skill: v.optional(v.number()),
	maxSkill: v.optional(v.number()),
	secondary: v.boolean(),
});

export default defineSchema({
	users: defineTable({
		battletag: v.optional(v.string()),
		/** Battle.net account id (the OIDC `sub`). */
		battlenetId: v.optional(v.string()),
		name: v.optional(v.string()),
		/** Set when a person links Discord for notifications (not built yet). */
		discordId: v.optional(v.string()),
	}).index("by_battlenetId", ["battlenetId"]),

	guilds: defineTable({
		flavor: vFlavor,
		region: vRegion,
		/** The API slug: the guild name in lowercase, spaces as hyphens. Unique per flavor + region. */
		slug: v.string(),
		name: v.string(),
		faction: v.optional(v.string()),
		ruleset: v.optional(v.string()),
		visibility: vVisibility,
		/** The person who added the guild; can change visibility. */
		ownerId: v.optional(v.id("users")),
		memberCount: v.number(),
		rosterSyncedAt: v.optional(v.number()),
		lastSyncError: v.optional(v.string()),
	}).index("by_key", ["flavor", "region", "slug"]),

	/** One row per guild member, from the roster plus each character's profile. */
	characters: defineTable({
		guildId: v.id("guilds"),
		flavor: vFlavor,
		region: vRegion,
		/** `{name}-{surname}`, lowercase; unique per flavor + region. */
		slug: v.string(),
		/** Blizzard's character id; also the number in the in-game GUID. */
		blizzardId: v.optional(v.number()),
		name: v.string(),
		surname: v.optional(v.string()),
		level: v.number(),
		classId: v.number(),
		raceId: v.number(),
		faction: v.optional(v.string()),
		gender: v.optional(v.string()),
		rank: v.number(),
		/** Profile details: only for level 10+ characters that have logged out since. */
		lastLoginAt: v.optional(v.number()),
		averageItemLevel: v.optional(v.number()),
		equipment: v.optional(v.array(vEquippedItem)),
		professions: v.optional(v.array(vProfession)),
		/** Trees with points spent, most points first. */
		talentTrees: v.optional(v.array(vTalentTree)),
		/** When we first saw Blizzard's current talentTrees (compared with addon uploads). */
		talentsChangedAt: v.optional(v.number()),
		avatarUrl: v.optional(v.string()),
		profileSyncedAt: v.optional(v.number()),
		/** 404 from the profile endpoint: under level 10 or not logged out yet. */
		profileMissing: v.optional(v.boolean()),
		/** Still in the guild as of the last roster sync. */
		inRoster: v.boolean(),
	})
		.index("by_guild", ["guildId", "inRoster"])
		.index("by_slug", ["flavor", "region", "slug"])
		.index("by_profileSyncedAt", ["inRoster", "profileSyncedAt"]),

	/** Characters a person proved they own, via Battle.net's account profile. */
	ownedCharacters: defineTable({
		userId: v.id("users"),
		flavor: vFlavor,
		region: vRegion,
		slug: v.string(),
		blizzardId: v.optional(v.number()),
		name: v.string(),
		level: v.optional(v.number()),
		classId: v.optional(v.number()),
		claimedAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_slug", ["flavor", "region", "slug"]),

	/** In-flight "claim my characters" OAuth flows. */
	claimRequests: defineTable({
		userId: v.id("users"),
		stateHash: v.string(),
		region: vRegion,
		/** The app origin that started the flow; the callback returns there. */
		origin: v.string(),
		/** The redirect_uri sent to Battle.net (the gateway's or ours), reused for the code exchange. */
		callbackUrl: v.string(),
		expiresAt: v.number(),
	}).index("by_stateHash", ["stateHash"]),

	/** Tokens the desktop helper uploads addon data with (apps/helper). Only the hash is stored. */
	helperTokens: defineTable({
		userId: v.id("users"),
		tokenHash: v.string(),
		label: v.string(),
		createdAt: v.number(),
		lastUsedAt: v.optional(v.number()),
	})
		.index("by_tokenHash", ["tokenHash"])
		.index("by_user", ["userId"]),

	/**
	 * "Connect the helper" in the browser: the helper shows a short code, the
	 * signed-in player approves it at /helper/connect, and the helper picks up
	 * its token by polling with a secret only it has. Single use, 10 minutes.
	 */
	helperPairings: defineTable({
		code: v.string(),
		pollSecretHash: v.string(),
		/** A name for the device, from the helper (e.g. the PC's name). */
		label: v.string(),
		expiresAt: v.number(),
		/** Set when approved; handed to the helper once, then the row is deleted. */
		token: v.optional(v.string()),
		userId: v.optional(v.id("users")),
	}).index("by_code", ["code"]),

	/**
	 * The latest in-game snapshot per character, uploaded by the helper from
	 * the Guildie addon. Shown instead of Blizzard's data only while it's newer.
	 */
	addonSnapshots: defineTable({
		userId: v.id("users"),
		flavor: vFlavor,
		region: vRegion,
		slug: v.string(),
		/** Game server time of the snapshot, ms. */
		capturedAt: v.number(),
		receivedAt: v.number(),
		level: v.optional(v.number()),
		talentTrees: v.array(vTalentTree),
	}).index("by_slug", ["flavor", "region", "slug"]),

	/**
	 * Blizzard's id and name for each class's talent trees, learned from synced
	 * characters (convex/shared/foreverTalents.ts maps talents to trees). Lets
	 * addon uploads use the same tree names as Blizzard's data.
	 */
	talentTreeInfo: defineTable({
		classToken: v.string(),
		treeIndex: v.number(),
		blizzardId: v.number(),
		name: v.string(),
	}).index("by_class_tree", ["classToken", "treeIndex"]),

	/** Cached client-credentials tokens for the Blizzard API. */
	apiTokens: defineTable({
		region: vRegion,
		token: v.string(),
		expiresAt: v.number(),
	}).index("by_region", ["region"]),
});
