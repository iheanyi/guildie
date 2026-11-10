import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { appToken, blizzardGet } from "./blizzard";

// Talent tree layouts: where each talent sits (row, column), its ranks,
// arrows and icon, from Blizzard's Forever talent-tree data. The same in
// every region (read from US). Synced with the recipe catalog (weekly).

type Index = { spec_talent_trees?: { key: { href: string } }[] };
type Tree = {
	name?: string;
	playable_class?: { id: number };
	playable_specialization?: { id: number };
	spec_talent_nodes?: {
		id: number;
		unlocks?: number[];
		display_row?: number;
		display_col?: number;
		ranks?: {
			rank: number;
			tooltip?: {
				talent?: { id: number; name?: string };
				spell_tooltip?: { spell?: { id: number }; description?: string };
			};
		}[];
	}[];
};
type Media = { assets?: { key: string; value: string }[] };

const common = { flavor: "forever" as const, region: "us" as const, namespace: "static" as const };

export const syncLayouts = internalAction({
	args: {},
	handler: async (ctx): Promise<{ queued: number }> => {
		const token: string = await appToken(ctx, "us");
		const index = await blizzardGet<Index>({ ...common, token, path: "/data/wow/talent-tree/index" });
		if (!index.ok) throw new Error("Talent tree index unavailable");
		const paths: string[] = (index.data.spec_talent_trees ?? []).map((t) => new URL(t.key.href).pathname);
		for (const [i, path] of paths.entries()) {
			await ctx.scheduler.runAfter(i * 2_000, internal.talents.syncTree, { path });
		}
		return { queued: paths.length };
	},
});

export const syncTree = internalAction({
	args: { path: v.string() },
	handler: async (ctx, { path }) => {
		const token = await appToken(ctx, "us");
		const tree = await blizzardGet<Tree>({ ...common, token, path });
		if (!tree.ok || !tree.data.playable_specialization || !tree.data.playable_class) return;
		const nodes = tree.data.spec_talent_nodes ?? [];
		const talentOfNode = new Map(nodes.map((n) => [n.id, n.ranks?.[0]?.tooltip?.talent?.id]));
		const out = await Promise.all(
			nodes.map(async (n) => {
				const first = n.ranks?.[0]?.tooltip;
				if (!first?.talent) return null;
				const spellId = first.spell_tooltip?.spell?.id;
				const media = spellId
					? await blizzardGet<Media>({ ...common, token, path: `/data/wow/media/spell/${spellId}` })
					: null;
				return {
					talentId: first.talent.id,
					name: first.talent.name ?? `Talent ${first.talent.id}`,
					row: n.display_row ?? 0,
					col: n.display_col ?? 0,
					maxRank: n.ranks?.length ?? 1,
					icon: media?.ok ? media.data.assets?.find((a) => a.key === "icon")?.value : undefined,
					unlocks: (n.unlocks ?? []).map((id) => talentOfNode.get(id)).filter((id): id is number => id !== undefined),
					ranks: (n.ranks ?? []).map((r) => r.tooltip?.spell_tooltip?.description ?? ""),
				};
			}),
		);
		await ctx.runMutation(internal.talents.save, {
			specId: tree.data.playable_specialization.id,
			classId: tree.data.playable_class.id,
			name: tree.data.name ?? `Tree ${tree.data.playable_specialization.id}`,
			nodes: out.filter((x) => x !== null),
		});
	},
});

export const save = internalMutation({
	args: {
		specId: v.number(),
		classId: v.number(),
		name: v.string(),
		nodes: v.array(
			v.object({
				talentId: v.number(),
				name: v.string(),
				row: v.number(),
				col: v.number(),
				maxRank: v.number(),
				icon: v.optional(v.string()),
				unlocks: v.array(v.number()),
				ranks: v.array(v.string()),
			}),
		),
	},
	handler: async (ctx, layout) => {
		const existing = await ctx.db
			.query("talentLayouts")
			.withIndex("by_specId", (q) => q.eq("specId", layout.specId))
			.unique();
		const row = { ...layout, syncedAt: Date.now() };
		if (existing) await ctx.db.replace(existing._id, row);
		else await ctx.db.insert("talentLayouts", row);
	},
});
