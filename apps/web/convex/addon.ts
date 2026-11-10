import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, type ActionCtx, internalMutation, internalQuery, type MutationCtx } from "./_generated/server";

// Guild data for the addon's reagent tooltips, one entry per guild. Built by
// one function for both ways it reaches the game:
// - the Guildie app downloads its player's guilds (helper:guildData, token),
//   which works for members-only guilds too;
// - the addon release bundles every public guild (addon:bundle, no token),
//   published daily through the addon managers.
// The addon keys guilds by `region/slug` (guildSlug in shared/wow.ts).

/** Most users listed per reagent, most recipes first. */
const USERS_PER_REAGENT = 8;

export type ReagentUser = { name: string; classId: number; profession: string; recipes: number };
export type GuildEntry = {
	name: string;
	region: string;
	slug: string;
	/** When this entry was built (ms). The addon keeps the newest copy it has. */
	generatedAt: number;
	reagents: Record<string, { name: string; users: ReagentUser[] }>;
};
/** What GuildieData.lua (v2) and the bundle hold. `mine`: the app's player's character names, so tooltips skip them. */
export type GuildDataV2 = { version: 2; generatedAt: number; mine?: string[]; guilds: Record<string, GuildEntry> };

type GuildMembers = {
	name: string;
	region: string;
	slug: string;
	members: { name: string; slug: string; classId: number; professions: { name: string; knownRecipes: number[] }[] }[];
};

export const guildKey = (region: string, slug: string) => `${region}/${slug}`;

/** A guild and its members' known recipes. `publicOnly`: null for members-only guilds (the bundle). */
export const guildMembers = internalQuery({
	args: { guildId: v.id("guilds"), publicOnly: v.boolean() },
	handler: async (ctx, { guildId, publicOnly }): Promise<GuildMembers | null> => {
		const guild = await ctx.db.get(guildId);
		if (!guild || (publicOnly && guild.visibility !== "public")) return null;
		const members = await ctx.db
			.query("characters")
			.withIndex("by_guild", (q) => q.eq("guildId", guildId).eq("inRoster", true))
			.collect();
		return {
			name: guild.name,
			region: guild.region,
			slug: guild.slug,
			members: members.map((m) => ({
				name: m.name,
				slug: m.slug,
				classId: m.classId,
				professions: (m.professions ?? []).map((p) => ({ name: p.name, knownRecipes: p.knownRecipes ?? [] })),
			})),
		};
	},
});

/** Every public guild. Members-only guilds never leave the site in the bundle. */
export const publicGuildIds = internalQuery({
	args: {},
	handler: async (ctx): Promise<Id<"guilds">[]> => {
		const guilds = await ctx.db.query("guilds").collect();
		return guilds.filter((g) => g.flavor === "forever" && g.visibility === "public").map((g) => g._id);
	},
});

/**
 * For each guild: per reagent, the members whose known recipes use it (most
 * recipes first). Suggestions, not certainties: knowing a recipe doesn't mean
 * someone is still making it.
 */
export async function buildGuildEntries(ctx: ActionCtx, guildIds: Id<"guilds">[], publicOnly: boolean) {
	const guilds: GuildMembers[] = [];
	// A few at a time: each is its own query, so one big guild can't push the rest over a query's limits.
	for (let i = 0; i < guildIds.length; i += 8) {
		const batch = await Promise.all(
			guildIds.slice(i, i + 8).map((guildId) => ctx.runQuery(internal.addon.guildMembers, { guildId, publicOnly })),
		);
		for (const g of batch) if (g) guilds.push(g);
	}
	const ids = [...new Set(guilds.flatMap((g) => g.members.flatMap((m) => m.professions.flatMap((p) => p.knownRecipes))))];
	const reagentsByRecipe = new Map<number, { itemId: number; name: string }[]>();
	for (let i = 0; i < ids.length; i += 400) {
		for (const r of await ctx.runQuery(internal.recipes.byIds, { ids: ids.slice(i, i + 400) })) {
			reagentsByRecipe.set(r.recipeId, r.reagents);
		}
	}
	const generatedAt = Date.now();
	return guilds.map((g): GuildEntry => {
		// itemId -> member and profession -> recipes using it
		const uses = new Map<number, { name: string; users: Map<string, ReagentUser> }>();
		for (const m of g.members) {
			for (const p of m.professions) {
				for (const recipeId of p.knownRecipes) {
					for (const reagent of reagentsByRecipe.get(recipeId) ?? []) {
						let entry = uses.get(reagent.itemId);
						if (!entry) uses.set(reagent.itemId, (entry = { name: reagent.name, users: new Map() }));
						const key = `${m.slug}:${p.name}`;
						const user = entry.users.get(key) ?? { name: m.name, classId: m.classId, profession: p.name, recipes: 0 };
						user.recipes += 1;
						entry.users.set(key, user);
					}
				}
			}
		}
		const reagents: GuildEntry["reagents"] = {};
		for (const [itemId, entry] of [...uses].sort((a, b) => a[0] - b[0])) {
			reagents[itemId] = {
				name: entry.name,
				users: [...entry.users.values()].sort(byRecipes).slice(0, USERS_PER_REAGENT),
			};
		}
		return { name: g.name, region: g.region, slug: g.slug, generatedAt, reagents };
	});
}

export const byRecipes = (a: ReagentUser, b: ReagentUser) => b.recipes - a.recipes || a.name.localeCompare(b.name);

/** How long a built bundle is served before it's built again. */
const BUNDLE_MAX_AGE_MS = 30 * 60_000;

export const latestBundle = internalQuery({
	args: {},
	handler: async (ctx) => await ctx.db.query("addonBundles").first(),
});

/** Drops the kept bundle, so the next request builds a fresh one. */
export async function forgetAddonBundle(ctx: MutationCtx) {
	for (const old of await ctx.db.query("addonBundles").collect()) {
		await ctx.storage.delete(old.storageId);
		await ctx.db.delete(old._id);
	}
}

export const saveBundle = internalMutation({
	args: { storageId: v.id("_storage"), generatedAt: v.number() },
	handler: async (ctx, args) => {
		await forgetAddonBundle(ctx);
		await ctx.db.insert("addonBundles", args);
	},
});

/**
 * Every public guild's tooltip data for the addon release (GuildieBundle.lua),
 * as GuildDataV2 JSON. Public: the same data the guild pages show. Reads every
 * public guild, so the result is kept in file storage and reused for half an
 * hour; calling it often costs one read. Served by GET /api/addon/bundle.
 */
export const bundle = action({
	args: {},
	handler: async (ctx): Promise<string> => {
		const latest = await ctx.runQuery(internal.addon.latestBundle, {});
		if (latest && Date.now() - latest.generatedAt < BUNDLE_MAX_AGE_MS) {
			const blob = await ctx.storage.get(latest.storageId);
			if (blob) return await blob.text();
		}
		const guildIds: Id<"guilds">[] = await ctx.runQuery(internal.addon.publicGuildIds, {});
		const entries = await buildGuildEntries(ctx, guildIds, true);
		const guilds: GuildDataV2["guilds"] = {};
		for (const e of entries.sort((a, b) => guildKey(a.region, a.slug).localeCompare(guildKey(b.region, b.slug)))) {
			guilds[guildKey(e.region, e.slug)] = e;
		}
		const generatedAt = Date.now();
		const json = JSON.stringify({ version: 2, generatedAt, guilds } satisfies GuildDataV2);
		const storageId = await ctx.storage.store(new Blob([json], { type: "application/json" }));
		await ctx.runMutation(internal.addon.saveBundle, { storageId, generatedAt });
		return json;
	},
});
