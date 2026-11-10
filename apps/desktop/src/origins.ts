// Which pages stay in the app's window, and which of them get the bridge.
// Pure functions, shared by the main process and the preload (and tested).

const parse = (url: string) => {
	try {
		return new URL(url);
	} catch {
		return undefined;
	}
};

const isLoopback = (host: string) => host === "localhost" || host === "127.0.0.1" || host === "[::1]";
const isLocalhost = (host: string) => host === "localhost" || host.endsWith(".localhost");

/** Guildie itself: guildie.club, a preview, or a local dev site. These get the bridge. */
export function isGuildieUrl(url: string) {
	const u = parse(url);
	if (!u) return false;
	const host = u.hostname;
	if (u.protocol === "https:") {
		return (
			host === "guildie.club" ||
			host === "www.guildie.club" ||
			host.endsWith(".preview.guildie.club") ||
			host === "guildie.localhost" ||
			host.endsWith(".guildie.localhost")
		);
	}
	// Local dev only: Portless serves https, but a bare dev server may not.
	return u.protocol === "http:" && (host === "guildie.localhost" || host.endsWith(".guildie.localhost"));
}

/** The hops of a Battle.net sign-in, which also stay in the window (but get no bridge). */
export function isSignInUrl(url: string) {
	const u = parse(url);
	if (!u) return false;
	const host = u.hostname;
	// A local Convex backend's site (the claim callback) is plain http on loopback.
	if (u.protocol === "http:") return isLoopback(host);
	if (u.protocol !== "https:") return false;
	return (
		host === "battle.net" ||
		host.endsWith(".battle.net") ||
		host === "blizzard.com" ||
		host.endsWith(".blizzard.com") ||
		host === "gateway.guildie.club" ||
		host === "gateway-dev.guildie.club" ||
		host.endsWith(".convex.site")
	);
}

/** Whether a navigation may happen inside the window (everything else opens in the browser). */
export const staysInWindow = (url: string) => isGuildieUrl(url) || isSignInUrl(url);

/** Links we hand to the default browser: web pages and mail only, never files or custom schemes. */
export function isExternalOpenable(url: string) {
	const u = parse(url);
	return !!u && (u.protocol === "https:" || u.protocol === "http:" || u.protocol === "mailto:");
}

/** Self-signed certificates are accepted for local dev sites only. */
export const allowsSelfSigned = (hostname: string) => isLocalhost(hostname);

/** The site's origin ("https://guildie.club"), which is what tokens are kept under. */
export function originOf(url: string) {
	const u = parse(url);
	return u ? u.origin : undefined;
}
