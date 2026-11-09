import type { OauthCatalog } from "@convex-dev/auth/methods/oauth/server";
import { type Infer, v } from "convex/values";

// Battle.net sign-in on the generic OAuth component. OpenID Connect: the
// id_token's `sub` is the Battle.net account id, and /userinfo adds the
// BattleTag. Sign-in asks for `openid` only; reading the player's characters
// (wow.profile) is a separate, explicit step (convex/claims.ts).

export const BATTLENET_AUTHORIZE = "https://oauth.battle.net/authorize";
export const BATTLENET_TOKEN = "https://oauth.battle.net/token";

export const vBattlenetProfile = v.object({
	id: v.string(),
	battletag: v.optional(v.string()),
});

export type BattlenetProfile = Infer<typeof vBattlenetProfile>;

export type BattlenetUserInfo = { user: { sub?: unknown; id?: unknown; battletag?: unknown } };

export const battlenetCatalog: OauthCatalog<BattlenetProfile, BattlenetUserInfo> = {
	authorizationEndpoint: BATTLENET_AUTHORIZE,
	tokenEndpoint: BATTLENET_TOKEN,
	issuer: "https://oauth.battle.net",
	userInfoEndpoints: { user: "https://oauth.battle.net/userinfo" },
	scopes: ["openid"],
	profile: (claims, responses) => {
		const id = claims?.sub;
		if (!id) throw new Error("Battle.net returned no subject");
		const battletag = responses?.user?.battletag;
		return { id, battletag: typeof battletag === "string" ? battletag : undefined };
	},
};
