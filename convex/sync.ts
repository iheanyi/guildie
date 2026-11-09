import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { appToken, blizzardGet } from "./blizzard";
import { FLAVORS } from "./shared/wow";

// Roster sync (hourly cron + on demand) and per-character profile sync.
// Blizzard allows 100 requests/s and 36,000/hour per client; a character
// costs 4 requests, so profile syncs are staggered.

const PROFILE_STAGGER_MS = 150;
/** Re-fetch a character's profile at most this often. */
const PROFILE_TTL_MS = 60 * 60_000;

type Roster = {
	guild: { name: string; faction?: { type?: string } };
	members: {
		rank: number;
		character: {
			name: string;
			surname?: string;
			slug?: string;
			level: number;
			playable_class: { id: number };
			playable_race: { id: number };
			faction?: { type?: string };
		};
	}[];
};

type GuildInfo = { name: string; ruleset?: { name?: string }; faction?: { type?: string } };

export const getGuild = internalQuery({
	args: { guildId: v.id("guilds") },
	handler: async (ctx, { guildId }) => await ctx.db.get(guildId),
});

export const syncGuild = internalAction({
	args: { guildId: v.id("guilds") },
	handler: async (ctx, { guildId }) => {
		const guild = await ctx.runQuery(internal.sync.getGuild, { guildId });
		if (!guild) return;
		const flavor = FLAVORS[guild.flavor];
		try {
			const token = await appToken(ctx, guild.region);
			const common = { token, flavor: guild.flavor, region: guild.region, namespace: "profile" as const };
			const [info, roster] = await Promise.all([
				blizzardGet<GuildInfo>({ ...common, path: flavor.guildPath(guild.slug) }),
				blizzardGet<Roster>({ ...common, path: `${flavor.guildPath(guild.slug)}/roster` }),
			]);
			if (!roster.ok) {
				await ctx.runMutation(internal.sync.recordError, {
					guildId,
					error: "Blizzard doesn't know this guild yet. Check the name and region; new guilds can take a while to appear.",
				});
				return;
			}
			const members = roster.data.members.map(({ rank, character: c }) => ({
				slug: (c.slug ?? `${c.name}-${c.surname ?? ""}`).toLowerCase(),
				name: c.name,
				surname: c.surname,
				level: c.level,
				classId: c.playable_class.id,
				raceId: c.playable_race.id,
				faction: c.faction?.type,
				rank,
			}));
			const due = await ctx.runMutation(internal.sync.applyRoster, {
				guildId,
				name: info.ok ? info.data.name : roster.data.guild.name,
				ruleset: info.ok ? info.data.ruleset?.name : undefined,
				faction: info.ok ? info.data.faction?.type : roster.data.guild.faction?.type,
				members,
			});
			await Promise.all(
				due.map((characterId, i) =>
					ctx.scheduler.runAfter(i * PROFILE_STAGGER_MS, internal.sync.syncCharacter, { characterId }),
				),
			);
		} catch (error) {
			await ctx.runMutation(internal.sync.recordError, { guildId, error: String(error) });
			throw error;
		}
	},
});

export const recordError = internalMutation({
	args: { guildId: v.id("guilds"), error: v.string() },
	handler: async (ctx, { guildId, error }) => {
		await ctx.db.patch(guildId, { lastSyncError: error.slice(0, 500) });
	},
});

const vMember = v.object({
	slug: v.string(),
	name: v.string(),
	surname: v.optional(v.string()),
	level: v.number(),
	classId: v.number(),
	raceId: v.number(),
	faction: v.optional(v.string()),
	rank: v.number(),
});

/** Upsert the roster; returns the characters whose profile is due a refresh. */
export const applyRoster = internalMutation({
	args: {
		guildId: v.id("guilds"),
		name: v.string(),
		ruleset: v.optional(v.string()),
		faction: v.optional(v.string()),
		members: v.array(vMember),
	},
	handler: async (ctx, { guildId, members, ...info }) => {
		const guild = await ctx.db.get(guildId);
		if (!guild) return [];
		const minLevel = FLAVORS[guild.flavor].minProfileLevel;
		const existing = await ctx.db
			.query("characters")
			.withIndex("by_guild", (q) => q.eq("guildId", guildId))
			.collect();
		const bySlug = new Map(existing.map((c) => [c.slug, c]));
		const due: Id<"characters">[] = [];
		const now = Date.now();
		for (const member of members) {
			const row = bySlug.get(member.slug);
			bySlug.delete(member.slug);
			let id: Id<"characters">;
			if (row) {
				await ctx.db.patch(row._id, { ...member, inRoster: true });
				id = row._id;
			} else {
				id = await ctx.db.insert("characters", {
					...member,
					guildId,
					flavor: guild.flavor,
					region: guild.region,
					inRoster: true,
				});
			}
			const stale = !row?.profileSyncedAt || now - row.profileSyncedAt > PROFILE_TTL_MS;
			// A character that leveled since the last sync may have a profile now.
			const leveled = row?.profileMissing && row.level !== member.level;
			if (member.level >= minLevel && (stale || leveled)) due.push(id);
		}
		// Whoever is left has left the guild. Kept (not deleted) so claims and
		// history survive a gquit-and-return.
		for (const gone of bySlug.values()) {
			if (gone.inRoster) await ctx.db.patch(gone._id, { inRoster: false });
		}
		await ctx.db.patch(guildId, {
			...info,
			memberCount: members.length,
			rosterSyncedAt: now,
			lastSyncError: undefined,
		});
		return due;
	},
});

type Profile = {
	last_login_timestamp?: number;
	average_item_level?: number;
	gender?: { type?: string };
	level?: number;
};
type Equipment = {
	equipped_items?: {
		slot: { type: string };
		item: { id: number };
		name: string;
		quality: { type: string };
		level?: { value: number };
	}[];
};
type ProfessionEntry = {
	profession: { id: number; name: string };
	skill_points?: number;
	max_skill_points?: number;
	tiers?: { skill_points?: number; max_skill_points?: number }[];
};
type Professions = { primaries?: ProfessionEntry[]; secondaries?: ProfessionEntry[] };
type Media = { assets?: { key: string; value: string }[] };

function mapProfessions(data: Professions | undefined) {
	if (!data) return undefined;
	const map = (entry: ProfessionEntry, secondary: boolean) => {
		// Classic-style responses put skill on the entry; Retail-style on tiers.
		const tier = entry.tiers?.[0];
		return {
			id: entry.profession.id,
			name: entry.profession.name,
			skill: entry.skill_points ?? tier?.skill_points,
			maxSkill: entry.max_skill_points ?? tier?.max_skill_points,
			secondary,
		};
	};
	return [
		...(data.primaries ?? []).map((e) => map(e, false)),
		...(data.secondaries ?? []).map((e) => map(e, true)),
	];
}

export const getCharacter = internalQuery({
	args: { characterId: v.id("characters") },
	handler: async (ctx, { characterId }) => await ctx.db.get(characterId),
});

export const syncCharacter = internalAction({
	args: { characterId: v.id("characters") },
	handler: async (ctx, { characterId }) => {
		const character = await ctx.runQuery(internal.sync.getCharacter, { characterId });
		if (!character) return;
		const flavor = FLAVORS[character.flavor];
		const token = await appToken(ctx, character.region);
		const base = flavor.characterPath(character.slug);
		const common = {
			token,
			flavor: character.flavor,
			region: character.region,
			namespace: "profile" as const,
		};
		const profile = await blizzardGet<Profile>({ ...common, path: base });
		if (!profile.ok) {
			await ctx.runMutation(internal.sync.applyProfile, { characterId, missing: true });
			return;
		}
		const [equipment, professions, media] = await Promise.all([
			blizzardGet<Equipment>({ ...common, path: `${base}/equipment` }),
			blizzardGet<Professions>({ ...common, path: `${base}/professions` }),
			// Media can 404 for a day after a character first appears.
			blizzardGet<Media>({ ...common, path: `${base}/character-media` }),
		]);
		await ctx.runMutation(internal.sync.applyProfile, {
			characterId,
			missing: false,
			lastLoginAt: profile.data.last_login_timestamp,
			averageItemLevel: profile.data.average_item_level,
			gender: profile.data.gender?.type,
			equipment: equipment.ok
				? (equipment.data.equipped_items ?? []).map((i) => ({
						slot: i.slot.type,
						itemId: i.item.id,
						name: i.name,
						quality: i.quality.type,
						itemLevel: i.level?.value,
					}))
				: undefined,
			professions: professions.ok ? mapProfessions(professions.data) : undefined,
			avatarUrl: media.ok ? media.data.assets?.find((a) => a.key === "avatar")?.value : undefined,
		});
	},
});

export const applyProfile = internalMutation({
	args: {
		characterId: v.id("characters"),
		missing: v.boolean(),
		lastLoginAt: v.optional(v.number()),
		averageItemLevel: v.optional(v.number()),
		gender: v.optional(v.string()),
		equipment: v.optional(
			v.array(
				v.object({
					slot: v.string(),
					itemId: v.number(),
					name: v.string(),
					quality: v.string(),
					itemLevel: v.optional(v.number()),
				}),
			),
		),
		professions: v.optional(
			v.array(
				v.object({
					id: v.number(),
					name: v.string(),
					skill: v.optional(v.number()),
					maxSkill: v.optional(v.number()),
					secondary: v.boolean(),
				}),
			),
		),
		avatarUrl: v.optional(v.string()),
	},
	handler: async (ctx, { characterId, missing, ...data }) => {
		const character = await ctx.db.get(characterId);
		if (!character) return;
		const patch: Partial<Doc<"characters">> = { profileSyncedAt: Date.now(), profileMissing: missing };
		// Only overwrite what this sync actually got.
		for (const [key, value] of Object.entries(data)) {
			if (value !== undefined) (patch as Record<string, unknown>)[key] = value;
		}
		await ctx.db.patch(characterId, patch);
	},
});

/** Cron: refresh every guild's roster. */
export const syncAll = internalAction({
	args: {},
	handler: async (ctx) => {
		const ids = await ctx.runQuery(internal.sync.allGuildIds, {});
		await Promise.all(
			ids.map((guildId, i) => ctx.scheduler.runAfter(i * 30_000, internal.sync.syncGuild, { guildId })),
		);
	},
});

export const allGuildIds = internalQuery({
	args: {},
	handler: async (ctx) => (await ctx.db.query("guilds").collect()).map((g) => g._id),
});
