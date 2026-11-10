import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { type QueryCtx, query } from "./_generated/server";
import { access, itemRow } from "./guilds";
import { vRegion } from "./schema";

// What characters can craft: their professions' known recipes (from
// Blizzard's profiles), joined with the recipe catalog and item data.

async function recipeRow(ctx: QueryCtx, recipeId: number) {
	return await ctx.db
		.query("recipes")
		.withIndex("by_recipeId", (q) => q.eq("recipeId", recipeId))
		.unique();
}

/** A recipe as the UI shows it: what it makes and what it takes. */
async function recipeView(ctx: QueryCtx, recipe: Doc<"recipes">, items: Map<number, Doc<"items"> | null>) {
	const item = async (itemId: number) => {
		if (!items.has(itemId)) items.set(itemId, await itemRow(ctx, itemId));
		return items.get(itemId) ?? null;
	};
	const made = recipe.craftedItemId ? await item(recipe.craftedItemId) : null;
	return {
		recipeId: recipe.recipeId,
		name: recipe.name,
		profession: recipe.profession,
		professionId: recipe.professionId,
		item: made
			? { itemId: made.itemId, name: made.name, quality: made.quality, icon: made.icon, kind: made.kind, tooltip: made.tooltip }
			: null,
		reagents: await Promise.all(
			recipe.reagents.map(async (r) => {
				const known = await item(r.itemId);
				return { itemId: r.itemId, name: r.name, quantity: r.quantity, icon: known?.icon, quality: known?.quality };
			}),
		),
	};
}

async function guildByKey(ctx: QueryCtx, region: Doc<"guilds">["region"], slug: string) {
	return await ctx.db
		.query("guilds")
		.withIndex("by_key", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", slug))
		.unique();
}

/** One character's professions, each with every recipe they know. */
export const characterProfessions = query({
	args: { region: vRegion, slug: v.string() },
	handler: async (ctx, { region, slug }) => {
		const character = await ctx.db
			.query("characters")
			.withIndex("by_slug", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", slug))
			.first();
		if (!character) return null;
		const guild = await ctx.db.get(character.guildId);
		if (!guild || !(await access(ctx, guild)).canView) return null;
		const items = new Map<number, Doc<"items"> | null>();
		return await Promise.all(
			(character.professions ?? []).map(async (p) => {
				const recipes = [];
				for (const id of p.knownRecipes ?? []) {
					const recipe = await recipeRow(ctx, id);
					if (recipe) recipes.push(await recipeView(ctx, recipe, items));
				}
				recipes.sort((a, b) => a.name.localeCompare(b.name));
				return { id: p.id, name: p.name, skill: p.skill, maxSkill: p.maxSkill, secondary: p.secondary, recipes };
			}),
		);
	},
});

/**
 * Everything the guild can craft: each recipe someone in the guild knows,
 * with who knows it (highest skill first). The UI searches it by recipe,
 * item, item kind ("Bag") and tooltip text ("8 Slot Bag").
 */
export const guildCrafting = query({
	args: { region: vRegion, slug: v.string() },
	handler: async (ctx, { region, slug }) => {
		const guild = await guildByKey(ctx, region, slug);
		if (!guild || !(await access(ctx, guild)).canView) return null;
		const members = await ctx.db
			.query("characters")
			.withIndex("by_guild", (q) => q.eq("guildId", guild._id).eq("inRoster", true))
			.collect();
		const crafters = new Map<number, { name: string; slug: string; classId: number; skill?: number }[]>();
		for (const m of members) {
			for (const p of m.professions ?? []) {
				for (const id of p.knownRecipes ?? []) {
					const list = crafters.get(id) ?? [];
					list.push({ name: m.name, slug: m.slug, classId: m.classId, skill: p.skill });
					crafters.set(id, list);
				}
			}
		}
		const items = new Map<number, Doc<"items"> | null>();
		const out = [];
		for (const [recipeId, who] of crafters) {
			const recipe = await recipeRow(ctx, recipeId);
			if (!recipe) continue;
			out.push({ ...(await recipeView(ctx, recipe, items)), crafters: who.sort((a, b) => (b.skill ?? 0) - (a.skill ?? 0)) });
		}
		return out.sort((a, b) => a.profession.localeCompare(b.profession) || a.name.localeCompare(b.name));
	},
});

/**
 * One item, for the item panel: its tooltip, the recipes that make it (with
 * who in the guild knows them) and the recipes it's a reagent in. `guild` is
 * the guild in view (a guild page, or the character's guild on a character
 * page); without it, crafters are left out.
 */
export const itemDetail = query({
	args: {
		itemId: v.number(),
		guild: v.optional(v.object({ region: vRegion, slug: v.string(), kind: v.union(v.literal("guild"), v.literal("character")) })),
	},
	handler: async (ctx, { itemId, guild: where }) => {
		const items = new Map<number, Doc<"items"> | null>();
		const item = await itemRow(ctx, itemId);
		items.set(itemId, item);

		let guild: Doc<"guilds"> | null = null;
		if (where?.kind === "guild") guild = await guildByKey(ctx, where.region, where.slug);
		if (where?.kind === "character") {
			const character = await ctx.db
				.query("characters")
				.withIndex("by_slug", (q) => q.eq("flavor", "forever").eq("region", where.region).eq("slug", where.slug))
				.first();
			guild = character ? await ctx.db.get(character.guildId) : null;
		}
		if (guild && !(await access(ctx, guild)).canView) guild = null;
		const members = guild
			? await ctx.db
					.query("characters")
					.withIndex("by_guild", (q) => q.eq("guildId", guild._id).eq("inRoster", true))
					.collect()
			: [];
		const craftersOf = (recipeId: number) =>
			members
				.flatMap((m) =>
					(m.professions ?? [])
						.filter((p) => p.knownRecipes?.includes(recipeId))
						.map((p) => ({ name: m.name, slug: m.slug, region: m.region, classId: m.classId, skill: p.skill })),
				)
				.sort((a, b) => (b.skill ?? 0) - (a.skill ?? 0));

		const makers = await ctx.db
			.query("recipes")
			.withIndex("by_craftedItemId", (q) => q.eq("craftedItemId", itemId))
			.collect();
		const craftedBy = await Promise.all(
			makers.map(async (r) => ({ ...(await recipeView(ctx, r, items)), crafters: craftersOf(r.recipeId) })),
		);

		// No index on reagents (an array); the catalog is a few thousand small rows.
		const usedIn = [];
		for await (const r of ctx.db.query("recipes")) {
			const reagent = r.reagents.find((x) => x.itemId === itemId);
			if (!reagent) continue;
			const view = await recipeView(ctx, r, items);
			usedIn.push({ recipeId: view.recipeId, name: view.name, profession: view.profession, item: view.item, quantity: reagent.quantity });
			if (usedIn.length >= 40) break;
		}
		usedIn.sort((a, b) => a.profession.localeCompare(b.profession) || a.name.localeCompare(b.name));

		return {
			itemId,
			item: item ? { name: item.name, quality: item.quality, icon: item.icon, kind: item.kind, tooltip: item.tooltip } : null,
			guild: guild ? { name: guild.name, region: guild.region, slug: guild.slug } : null,
			craftedBy,
			usedIn,
		};
	},
});
