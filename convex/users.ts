import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { vBattlenetProfile } from "./authBattlenet";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx, query, type QueryCtx } from "./_generated/server";

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

export const createFromGuest = internalMutation({
	args: {
		provider: v.object({ name: v.literal("anonymous"), accountId: v.string(), profile: v.object({}) }),
	},
	returns: v.id("users"),
	handler: async (ctx) => {
		if (process.env.AUTH_DEV_GUEST !== "true") throw new ConvexError("Guest sign-in is disabled");
		return await ctx.db.insert("users", { name: "Guest" });
	},
});

export const guestEnabled = query({
	args: {},
	handler: async () => process.env.AUTH_DEV_GUEST === "true",
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
		return { ...user, characters };
	},
});
