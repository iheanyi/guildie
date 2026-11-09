import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { appToken, blizzardGet } from "./blizzard";
import { isLocalBackend } from "./origins";
import { vRegion } from "./schema";
import { CLASSES, FLAVORS, guildSlug, SLOT_ORDER } from "./shared/wow";

// Dev helpers.
//
// `pnpm seed`: a fake guild so the directory can be built and reviewed before
// Blizzard keys exist. Local backends only.

const FIRST = ["Aldric", "Brenna", "Corwin", "Dagny", "Edris", "Fenna", "Garrick", "Hesper", "Ivo", "Jorun", "Kael", "Liesel", "Maren", "Nils", "Orla", "Pell", "Quill", "Rowan", "Sable", "Tamsin", "Ulric", "Vesna", "Wren", "Yarrow"];
const LAST = ["Ashdown", "Brightwater", "Coldbrook", "Duskmantle", "Emberfall", "Fairwind", "Greyhollow", "Hearthstone", "Ironvale", "Larkspur", "Moonbrook", "Oakheart"];
const PROFESSIONS = ["Alchemy", "Blacksmithing", "Enchanting", "Engineering", "Herbalism", "Leatherworking", "Mining", "Skinning", "Tailoring"];
const QUALITIES = ["COMMON", "UNCOMMON", "UNCOMMON", "RARE", "RARE", "EPIC"];
const ALLIANCE_RACES = [1, 3, 4, 7];

export const seed = internalMutation({
	args: {},
	handler: async (ctx) => {
		if (!isLocalBackend()) throw new ConvexError("Local backends only");
		const slug = "the-long-watch";
		const existing = await ctx.db
			.query("guilds")
			.withIndex("by_key", (q) => q.eq("flavor", "forever").eq("region", "us").eq("slug", slug))
			.unique();
		if (existing) return "already seeded";
		const guildId = await ctx.db.insert("guilds", {
			flavor: "forever",
			region: "us",
			slug,
			name: "The Long Watch",
			faction: "ALLIANCE",
			ruleset: "Normal",
			visibility: "public",
			memberCount: FIRST.length,
			rosterSyncedAt: Date.now(),
		});
		const classIds = Object.keys(CLASSES).map(Number).filter((id) => id !== 7);
		let seedValue = 7;
		const rand = () => (seedValue = (seedValue * 16807) % 2147483647) / 2147483647;
		const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)];
		for (const [i, first] of FIRST.entries()) {
			const surname = LAST[i % LAST.length];
			const level = i < 6 ? 60 : Math.max(4, Math.floor(rand() * 60));
			const hasProfile = level >= 10;
			const professions = [pick(PROFESSIONS), pick(PROFESSIONS)]
				.filter((p, j, all) => all.indexOf(p) === j)
				.map((name, j) => ({ id: j + 1, name, skill: Math.min(300, level * 5), maxSkill: 300, secondary: false }));
			await ctx.db.insert("characters", {
				guildId,
				flavor: "forever",
				region: "us",
				slug: `${first}-${surname}`.toLowerCase(),
				name: first,
				surname,
				level,
				classId: pick(classIds),
				raceId: pick(ALLIANCE_RACES),
				faction: "ALLIANCE",
				rank: i === 0 ? 0 : i < 4 ? 1 : i < 12 ? 3 : 5,
				inRoster: true,
				profileMissing: !hasProfile,
				...(hasProfile && {
					lastLoginAt: Date.now() - Math.floor(rand() * 9 * 24 * 3600_000),
					averageItemLevel: Math.round(level * 0.9 + rand() * 10),
					professions,
					equipment: SLOT_ORDER.filter((s) => s !== "SHIRT" && s !== "TABARD").map((slot, j) => ({
						slot,
						itemId: 10000 + i * 100 + j,
						name: `${pick(["Worn", "Stalwart", "Gleaming", "Runed", "Dreadful"])} ${slot.toLowerCase().replace(/_\d/, "").replace("_", " ")}`,
						quality: pick(QUALITIES),
						itemLevel: Math.round(level * 0.9 + rand() * 10),
					})),
					profileSyncedAt: Date.now(),
				}),
			});
		}
		return "seeded";
	},
});

/**
 * `npx convex run dev:probe '{"guild": "Your Guild", "region": "us"}'`
 * Checks the Battle.net keys work and shows which fields Blizzard actually
 * returns for a guild and one of its members. Read-only.
 */
export const probe = internalAction({
	args: { guild: v.string(), region: v.optional(vRegion) },
	handler: async (ctx, args) => {
		const region = args.region ?? "us";
		const token = await appToken(ctx, region);
		const common = { token, flavor: "forever" as const, region, namespace: "profile" as const };
		const slug = guildSlug(args.guild);
		const roster = await blizzardGet<{ members: { character: { slug: string; level: number }; rank: number }[] }>({
			...common,
			path: `${FLAVORS.forever.guildPath(slug)}/roster`,
		});
		if (!roster.ok) return { token: "ok", guild: `404 for slug "${slug}"` };
		const sample = roster.data.members
			.filter((m) => m.character.level >= 10)
			.sort((a, b) => b.character.level - a.character.level)[0];
		const result: Record<string, unknown> = {
			token: "ok",
			guildSlug: slug,
			members: roster.data.members.length,
			rosterFields: Object.keys(roster.data.members[0]?.character ?? {}),
		};
		if (!sample) return result;
		const base = FLAVORS.forever.characterPath(sample.character.slug);
		for (const [key, path] of [
			["profile", base],
			["equipment", `${base}/equipment`],
			["professions", `${base}/professions`],
			["media", `${base}/character-media`],
		] as const) {
			const res = await blizzardGet<Record<string, unknown>>({ ...common, path });
			result[key] = res.ok ? Object.keys(res.data) : `HTTP ${res.status}`;
		}
		result.sampleCharacter = sample.character.slug;
		return result;
	},
});

/**
 * `npx convex run --deployment <name> dev:addGuild '{"name": "Your Guild", "region": "us"}'`
 * Adds a guild without a signed-in user (no owner) and syncs it. For seeding
 * cloud dev, which local worktrees import guilds from.
 */
export const addGuild = internalMutation({
	args: { name: v.string(), region: v.optional(vRegion) },
	handler: async (ctx, args) => {
		const region = args.region ?? "us";
		const slug = guildSlug(args.name);
		const existing = await ctx.db
			.query("guilds")
			.withIndex("by_key", (q) => q.eq("flavor", "forever").eq("region", region).eq("slug", slug))
			.unique();
		const guildId =
			existing?._id ??
			(await ctx.db.insert("guilds", {
				flavor: "forever",
				region,
				slug,
				name: args.name.trim(),
				visibility: "public",
				memberCount: 0,
			}));
		await ctx.scheduler.runAfter(0, internal.sync.syncGuild, { guildId });
		return `/g/${region}/${slug}`;
	},
});
