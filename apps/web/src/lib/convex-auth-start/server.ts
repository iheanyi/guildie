import { api } from "@convex/_generated/api";
import { type CookieStore, ServerAuthSession, setupConvexAuthServer } from "@convex-dev/auth/ssr";
import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { ConvexHttpClient } from "convex/browser";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string;
const cookieOptions = { secure: import.meta.env.PROD };

export const authServer = setupConvexAuthServer({
	convexUrl,
	refreshSession: api.auth.refreshSession,
	signOut: api.auth.signOut,
	// Allowlist: every function that mints a session, and nothing else.
	signIn: [api.auth.completeSignInWithBattlenet, api.auth.signInWithDesktopCode, api.auth.signInAsGuest],
	cookieOptions,
	// The CSRF check also needs the app's public origin when a proxy rewrites Host.
	allowedOrigins: [import.meta.env.VITE_SITE_URL as string].filter(Boolean),
});

const requestCookies: CookieStore = {
	get: (name) => getCookie(name),
	set: (name, value, options) => setCookie(name, value, options),
	delete: (name, options) => deleteCookie(name, options),
};

/** The current request's access token, refreshed (and cookies rotated) if near expiry. */
export async function readAuthToken(): Promise<string | null> {
	const session = new ServerAuthSession({
		refreshSession: (refreshToken) =>
			new ConvexHttpClient(convexUrl).mutation(api.auth.refreshSession, { refreshToken }),
		cookies: requestCookies,
		cookieOptions,
	});
	try {
		return await session.getToken();
	} catch (error) {
		// The beta throws when a refresh fails outright (convex-auth#729).
		console.error("convex-auth-start: token refresh failed", error);
		return null;
	}
}
