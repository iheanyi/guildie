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
	talents: v.array(v.object({ name: v.string(), rank: v.number() })),
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

	/** Cached client-credentials tokens for the Blizzard API. */
	apiTokens: defineTable({
		region: vRegion,
		token: v.string(),
		expiresAt: v.number(),
	}).index("by_region", ["region"]),
});
