import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { vBattlenetProfile } from "./authBattlenet";
import { guildsOf } from "./guilds";
import { isLocalBackend } from "./origins";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, type MutationCtx, query, type QueryCtx } from "./_generated/server";

export async function requireUserId(ctx: QueryCtx | MutationCtx) {
	const userId = await getAuthUserId(ctx);
	if (userId === null) throw new ConvexError("Not signed in");
	return userId as Id<"users">;
}

const vBattlenetProvider = v.object({
	name: v.literal("battlenet"),
	accountId: v.string(),
	profile: vBattlenetProfile,
});

export const createFromBattlenet = internalMutation({
	args: { provider: vBattlenetProvider },
	returns: v.id("users"),
	handler: async (ctx, { provider: { profile } }) =>
		await ctx.db.insert("users", {
			battlenetId: profile.id,
			battletag: profile.battletag,
			name: profile.battletag?.split("#")[0],
		}),
});

export const onBattlenetSignIn = internalMutation({
	args: { provider: vBattlenetProvider, userId: v.id("users") },
	returns: v.null(),
	handler: async (ctx, { provider: { profile }, userId }) => {
		const user = await ctx.db.get(userId);
		// BattleTags can change (paid name change); keep ours current.
		if (user && profile.battletag && user.battletag !== profile.battletag) {
			await ctx.db.patch(userId, { battletag: profile.battletag });
		}
		return null;
	},
});

/** The desktop app's sign-in (auth:signInWithDesktopCode): the account belongs to an existing user. */
export const createFromDesktop = internalMutation({
	args: {
		provider: v.object({ name: v.literal("desktop"), accountId: v.string(), profile: v.object({ userId: v.id("users") }) }),
	},
	returns: v.id("users"),
	handler: async (ctx, { provider: { profile } }) => {
		if (!(await ctx.db.get(profile.userId))) throw new ConvexError("No such user");
		return profile.userId;
	},
});

export const createFromGuest = internalMutation({
	args: {
		provider: v.object({ name: v.literal("anonymous"), accountId: v.string(), profile: v.object({}) }),
	},
	returns: v.id("users"),
	handler: async (ctx) => {
		if (!isLocalBackend()) throw new ConvexError("Guest sign-in is disabled");
		return await ctx.db.insert("users", { name: "Guest" });
	},
});

export const guestEnabled = query({
	args: {},
	handler: async () => isLocalBackend(),
});

export const viewer = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (userId === null) return null;
		const user = await ctx.db.get(userId as Id<"users">);
		if (!user) return null;
		const characters = await ctx.db
			.query("ownedCharacters")
			.withIndex("by_user", (q) => q.eq("userId", user._id))
			.collect();
		// The guilds their characters are in: header link, home page, where sign-in lands.
		const guilds = (await guildsOf(ctx, user._id)).map((g) => ({
			_id: g._id,
			name: g.name,
			region: g.region,
			slug: g.slug,
			memberCount: g.memberCount,
			faction: g.faction,
		}));
		return { ...user, characters, guilds };
	},
});

/** Account page: show or hide my BattleTag from guildmates on rosters. */
export const setHideBattletag = mutation({
	args: { hide: v.boolean() },
	handler: async (ctx, { hide }) => {
		const userId = await requireUserId(ctx);
		await ctx.db.patch(userId, { hideBattletag: hide || undefined });
	},
});
