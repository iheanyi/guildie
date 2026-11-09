import auth from "@convex-dev/auth/convex.config.js";
import authAnonymous from "@convex-dev/auth/components/anonymous/convex.config.js";
import authOauth from "@convex-dev/auth/components/oauth/convex.config.js";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
	env: {
		AUTH_PRIVATE_KEY: v.string(),
		AUTH_JWKS: v.string(),
		// One Blizzard API client serves sign-in, character claiming and the
		// roster sync. See docs/blizzard-setup.md.
		BATTLENET_CLIENT_ID: v.string(),
		BATTLENET_CLIENT_SECRET: v.string(),
	},
});

app.use(auth, {
	httpPrefix: "/auth",
	env: {
		AUTH_PRIVATE_KEY: app.env.AUTH_PRIVATE_KEY,
		AUTH_JWKS: app.env.AUTH_JWKS,
	},
});
// Battle.net has no built-in Convex Auth method, so it runs on the generic
// OAuth component. Callback: <CONVEX_SITE_URL>/oauth/battlenet/callback.
app.use(authOauth, {
	name: "authBattlenet",
	httpPrefix: "/oauth/battlenet",
	env: {
		CLIENT_ID: app.env.BATTLENET_CLIENT_ID,
		CLIENT_SECRET: app.env.BATTLENET_CLIENT_SECRET,
	},
});
// Backs the dev-only guest sign-in (see auth.ts). Refused unless AUTH_DEV_GUEST=true.
app.use(authAnonymous);

export default app;
