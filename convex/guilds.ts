import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type QueryCtx, query } from "./_generated/server";
import { vRegion, vVisibility } from "./schema";
import { requireUserId } from "./users";
import { guildSlug } from "./shared/wow";

/** Manual "sync now" is allowed once per this window. */
const MANUAL_SYNC_COOLDOWN_MS = 5 * 60_000;

/** True when the viewer owns a character that's in this guild's roster. */
async function isMember(ctx: QueryCtx, guild: Doc<"guilds">, userId: Id<"users"> | null) {
	if (!userId) return false;
	const owned = await ctx.db
		.query("ownedCharacters")
		.withIndex("by_user", (q) => q.eq("userId", userId))
		.collect();
	for (const c of owned) {
		const member = await ctx.db
			.query("characters")
			.withIndex("by_slug", (q) => q.eq("flavor", c.flavor).eq("region", c.region).eq("slug", c.slug))
			.first();
		if (member?.guildId === guild._id && member.inRoster) return true;
	}
	return false;
}

async function access(ctx: QueryCtx, guild: Doc<"guilds">) {
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
		return { character, guild: { name: guild.name, slug: guild.slug, region: guild.region } };
	},
});

export const add = mutation({
	args: { region: vRegion, name: v.string() },
	handler: async (ctx, { region, name }) => {
		const userId = await requireUserId(ctx);
		const slug = guildSlug(name);
		if (!slug) throw new ConvexError("Enter a guild name");
		const existing = await ctx.db
			.query("guilds")
			.withIndex("by_key", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", slug))
			.unique();
		if (existing) return { region, slug };
		const guildId = await ctx.db.insert("guilds", {
			flavor: "forever",
			region,
			slug,
			name: name.trim(),
			visibility: "public",
			// First come, first served for now. See docs/roadmap.md ("Guild ownership").
			ownerId: userId,
			memberCount: 0,
		});
		await ctx.scheduler.runAfter(0, internal.sync.syncGuild, { guildId });
		return { region, slug };
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
	},
});
