import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, type MutationCtx, type QueryCtx, query } from "./_generated/server";
import { vRegion, vVisibility } from "./schema";
import { forgetAddonBundle } from "./addon";
import { pickTalents } from "./helper";
import { requireUserId } from "./users";
import { TALENT_TREE_BY_ID } from "./shared/foreverTalents";
import { guildSlug } from "./shared/wow";

/** Manual "sync now" is allowed once per this window. */
const MANUAL_SYNC_COOLDOWN_MS = 5 * 60_000;

/** The guilds a user's claimed characters are in now (per the last roster syncs). */
export async function guildsOf(ctx: QueryCtx, userId: Id<"users">) {
	const owned = await ctx.db
		.query("ownedCharacters")
		.withIndex("by_user", (q) => q.eq("userId", userId))
		.collect();
	const ids = new Set<Id<"guilds">>();
	for (const c of owned) {
		const rows = await ctx.db
			.query("characters")
			.withIndex("by_slug", (q) => q.eq("flavor", c.flavor).eq("region", c.region).eq("slug", c.slug))
			.collect();
		for (const row of rows) if (row.inRoster) ids.add(row.guildId);
	}
	const guilds = await Promise.all([...ids].map((id) => ctx.db.get(id)));
	return guilds.filter((g) => g !== null);
}

/** True when the viewer owns a character that's in this guild's roster. */
async function isMember(ctx: QueryCtx, guild: Doc<"guilds">, userId: Id<"users"> | null) {
	if (!userId) return false;
	return (await guildsOf(ctx, userId)).some((g) => g._id === guild._id);
}

/** Make the guild master's player the owner (roster syncs and claims call this). */
export async function setOwner(ctx: MutationCtx, guildId: Id<"guilds">, userId: Id<"users">) {
	const guild = await ctx.db.get(guildId);
	if (guild && guild.ownerId !== userId) await ctx.db.patch(guildId, { ownerId: userId });
}

export async function access(ctx: QueryCtx, guild: Doc<"guilds">) {
	const userId = (await getAuthUserId(ctx)) as Id<"users"> | null;
	const isOwner = userId !== null && guild.ownerId === userId;
	const member = isOwner || (await isMember(ctx, guild, userId));
	return { canView: guild.visibility === "public" || member, isOwner, isMember: member };
}

export const list = query({
	args: {},
	handler: async (ctx) => {
		const guilds = await ctx.db.query("guilds").collect();
		return guilds
			.filter((g) => g.visibility === "public")
			.map((g) => ({ _id: g._id, name: g.name, slug: g.slug, region: g.region, memberCount: g.memberCount, faction: g.faction }));
	},
});

export const get = query({
	args: { region: vRegion, slug: v.string() },
	handler: async (ctx, { region, slug }) => {
		const guild = await ctx.db
			.query("guilds")
			.withIndex("by_key", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", slug))
			.unique();
		if (!guild) return null;
		const { canView, isOwner, isMember } = await access(ctx, guild);
		if (!canView) {
			return { guild: { _id: guild._id, name: guild.name, region: guild.region, visibility: guild.visibility }, hidden: true as const };
		}
		const characters = await ctx.db
			.query("characters")
			.withIndex("by_guild", (q) => q.eq("guildId", guild._id).eq("inRoster", true))
			.collect();
		// Mark which characters someone has claimed (without saying who: that's for a later privacy pass).
		const talents = await Promise.all(characters.map((c) => pickTalents(ctx, c)));
		const claimed = await Promise.all(
			characters.map((c) =>
				ctx.db
					.query("ownedCharacters")
					.withIndex("by_slug", (q) => q.eq("flavor", c.flavor).eq("region", c.region).eq("slug", c.slug))
					.first(),
			),
		);
		return {
			guild,
			hidden: false as const,
			isOwner,
			isMember,
			members: characters.map((c, i) => ({
				_id: c._id,
				slug: c.slug,
				name: c.name,
				surname: c.surname,
				level: c.level,
				classId: c.classId,
				raceId: c.raceId,
				rank: c.rank,
				lastLoginAt: c.lastLoginAt,
				averageItemLevel: c.averageItemLevel,
				professions: c.professions,
				talentTrees: talents[i].talentTrees?.map(({ id, name, points }) => ({ id, name, points })),
				talentSource: talents[i].source,
				avatarUrl: c.avatarUrl,
				profileMissing: c.profileMissing,
				claimed: claimed[i] !== null,
			})),
		};
	},
});

export const character = query({
	args: { region: vRegion, slug: v.string() },
	handler: async (ctx, { region, slug }) => {
		const character = await ctx.db
			.query("characters")
			.withIndex("by_slug", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", slug))
			.first();
		if (!character) return null;
		const guild = await ctx.db.get(character.guildId);
		if (!guild || !(await access(ctx, guild)).canView) return null;
		const { talentTrees, source } = await pickTalents(ctx, character);
		const equipment = await Promise.all(
			(character.equipment ?? []).map(async (item) => {
				const known = await itemRow(ctx, item.itemId);
				return { ...item, icon: known?.icon };
			}),
		);
		// All of the class's trees, so empty ones show too, in the game's order.
		const layouts = await ctx.db
			.query("talentLayouts")
			.withIndex("by_classId", (q) => q.eq("classId", character.classId))
			.collect();
		return {
			character: { ...character, equipment, talentTrees },
			talentSource: source,
			talentLayouts: layouts
				.map(({ specId, name, nodes }) => ({
					specId,
					name,
					nodes,
					order: nodes.map((n) => TALENT_TREE_BY_ID.get(n.talentId)?.treeIndex).find((i) => i !== undefined) ?? specId,
				}))
				.sort((a, b) => a.order - b.order),
			guild: { name: guild.name, slug: guild.slug, region: guild.region },
		};
	},
});

export const add = mutation({
	args: { region: vRegion, name: v.string() },
	handler: async (ctx, { region, name }) => {
		await requireUserId(ctx);
		const slug = guildSlug(name);
		if (!slug) throw new ConvexError("Enter a guild name");
		const existing = await ctx.db
			.query("guilds")
			.withIndex("by_key", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", slug))
			.unique();
		if (existing) return { region, slug };
		await insertGuild(ctx, { region, slug, name: name.trim() });
		return { region, slug };
	},
});

/**
 * A new guild: public, no owner until a roster sync finds that its guild
 * master's character is claimed (sync.ts applyRoster).
 */
async function insertGuild(ctx: MutationCtx, g: { region: Doc<"guilds">["region"]; slug: string; name: string }) {
	const guildId = await ctx.db.insert("guilds", {
		flavor: "forever",
		...g,
		visibility: "public",
		memberCount: 0,
	});
	await ctx.scheduler.runAfter(0, internal.sync.syncGuild, { guildId });
	return guildId;
}

/** After a claim: make sure the guilds the player's characters are in exist here. */
export const ensureGuilds = internalMutation({
	args: { guilds: v.array(v.object({ region: vRegion, slug: v.string(), name: v.string() })) },
	handler: async (ctx, { guilds }) => {
		const out = [];
		for (const g of guilds) {
			const existing = await ctx.db
				.query("guilds")
				.withIndex("by_key", (q) => q.eq("flavor", "forever").eq("region", g.region).eq("slug", g.slug))
				.unique();
			if (!existing) await insertGuild(ctx, g);
			out.push({ region: g.region, slug: g.slug, name: existing?.name ?? g.name });
		}
		return out;
	},
});

export const requestSync = mutation({
	args: { guildId: v.id("guilds") },
	handler: async (ctx, { guildId }) => {
		await requireUserId(ctx);
		const guild = await ctx.db.get(guildId);
		if (!guild) throw new ConvexError("No such guild");
		if (guild.rosterSyncedAt && Date.now() - guild.rosterSyncedAt < MANUAL_SYNC_COOLDOWN_MS) {
			throw new ConvexError("Synced a few minutes ago. Try again later.");
		}
		await ctx.scheduler.runAfter(0, internal.sync.syncGuild, { guildId });
	},
});

export const setVisibility = mutation({
	args: { guildId: v.id("guilds"), visibility: vVisibility },
	handler: async (ctx, { guildId, visibility }) => {
		const userId = await requireUserId(ctx);
		const guild = await ctx.db.get(guildId);
		if (!guild || guild.ownerId !== userId) throw new ConvexError("Only the guild's owner can change this");
		await ctx.db.patch(guildId, { visibility });
		// A guild that turns members-only leaves the addon's public bundle now, not at the next rebuild.
		if (visibility === "members") await forgetAddonBundle(ctx);
	},
});

export async function itemRow(ctx: QueryCtx, itemId: number) {
	return await ctx.db
		.query("items")
		.withIndex("by_itemId", (q) => q.eq("itemId", itemId))
		.unique();
}
