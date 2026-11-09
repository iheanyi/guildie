import { setupAnonymous } from "@convex-dev/auth/methods/anonymous/server";
import { setupOauth } from "@convex-dev/auth/methods/oauth/server";
import { setupConvexAuth } from "@convex-dev/auth/server";
import { components, internal } from "./_generated/api";
import { viaGateway } from "./authGateway";
import { allowedRedirectOrigins } from "./origins";
import { type BattlenetProfile, type BattlenetUserInfo, battlenetCatalog } from "./authBattlenet";

const auth = setupConvexAuth({
	component: components.auth,
	// The default is 60s. Longer keeps SSR and the browser from refreshing
	// constantly; revocation takes effect when the token expires.
	accessTokenTtlSeconds: 10 * 60,
});

export const { signOut, refreshSession, isAuthenticated } = auth;


// Annotated: inferring the type from `internal.users` is circular.
type BattlenetSignIn = ReturnType<
	typeof setupOauth<"battlenet", BattlenetProfile, "users", BattlenetUserInfo>
>;
const battlenet: BattlenetSignIn = setupOauth(
	auth,
	"battlenet",
	battlenetCatalog,
	{ createUser: internal.users.createFromBattlenet, onSignIn: internal.users.onBattlenetSignIn },
	{ component: components.authBattlenet, allowedRedirectOrigins },
);
export const startSignInWithBattlenet = viaGateway("battlenet", battlenet.startSignIn);
export const completeSignInWithBattlenet = battlenet.completeSignIn;

// Dev-only guest accounts so the app can be exercised without Blizzard keys.
// createFromGuest refuses anywhere but a local backend (origins.ts).
export const { signInAnonymously: signInAsGuest } = setupAnonymous(auth, {
	component: components.authAnonymous,
}).attachUserCallbacks({ createUser: internal.users.createFromGuest });
