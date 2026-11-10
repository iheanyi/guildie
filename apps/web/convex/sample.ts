import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { setOwner } from "./guilds";
import { isLocalBackend } from "./origins";

// The sample guild (apps/web/fixtures/sample): what a local backend starts
// with when it can't copy cloud dev's data, e.g. for contributors without
// access to the maintainer's accounts (docs/local-dev.md). Local backends only.

export const SAMPLE_GUILD = { region: "eu", slug: "sample-guild" } as const;

/** The sample guild on a local backend. Blizzard doesn't know it, so syncs skip it. */
export const isSampleGuild = (guild: Pick<Doc<"guilds">, "region" | "slug">) =>
	isLocalBackend() && guild.region === SAMPLE_GUILD.region && guild.slug === SAMPLE_GUILD.slug;

/**
 * A new guest claims the sample guild's first unclaimed character, so it
 * sees the app as a member: the guild master's first (which makes the first
 * guest the guild's owner), then by rank and level. Nothing when there's no
 * sample guild (the maintainer's backends) or every character is taken.
 */
export async function claimSampleCharacter(ctx: MutationCtx, userId: Id<"users">) {
	if (!isLocalBackend()) return;
	const guild = await ctx.db
		.query("guilds")
		.withIndex("by_key", (q) => q.eq("flavor", "forever").eq("region", SAMPLE_GUILD.region).eq("slug", SAMPLE_GUILD.slug))
		.unique();
	if (!guild) return;
	const members = await ctx.db
		.query("characters")
		.withIndex("by_guild", (q) => q.eq("guildId", guild._id).eq("inRoster", true))
		.collect();
	members.sort((a, b) => a.rank - b.rank || b.level - a.level || a.slug.localeCompare(b.slug));
	for (const c of members) {
		const taken = await ctx.db
			.query("ownedCharacters")
			.withIndex("by_slug", (q) => q.eq("flavor", c.flavor).eq("region", c.region).eq("slug", c.slug))
			.first();
		if (taken) continue;
		await ctx.db.insert("ownedCharacters", {
			userId,
			flavor: c.flavor,
			region: c.region,
			slug: c.slug,
			name: c.name,
			level: c.level,
			classId: c.classId,
			claimedAt: Date.now(),
		});
		if (c.rank === 0) await setOwner(ctx, guild._id, userId);
		return;
	}
}
