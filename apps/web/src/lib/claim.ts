// Claiming characters runs as its own Battle.net hop right after every
// sign-in (convex/claims.ts): /sign-in → claims.start → Battle.net (approves
// without asking; sign-in already granted wow.profile) → /claim/callback →
// wherever the player was going.

/** sessionStorage key holding the state of an in-flight claim. */
export const CLAIM_STATE_KEY = "guildie:claim-state";
/** sessionStorage key: where to go once the claim is done. */
const CLAIM_NEXT_KEY = "guildie:claim-next";
/** sessionStorage key: a Battle.net sign-in started here; finish it with a claim. */
const SIGN_IN_PENDING_KEY = "guildie:sign-in-pending";
const SIGN_IN_PENDING_TTL_MS = 15 * 60_000;

/** Only same-site paths, so `next` can't send anyone elsewhere. */
export const safeNext = (next: unknown) =>
	typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : undefined;

type Viewer = { guilds: { region: string; slug: string }[] } | null | undefined;

/** Where a signed-in player lands: `next`, else their guild if they're in exactly one, else their account. */
export function landingPath(viewer: Viewer, next?: string, guilds = viewer?.guilds ?? []) {
	if (next) return next;
	const unique = new Map(guilds.map((g) => [`${g.region}/${g.slug}`, g]));
	if (unique.size === 1) {
		const [g] = unique.values();
		return `/g/${g.region}/${encodeURIComponent(g.slug)}`;
	}
	return "/me";
}

type StartClaim = (args: { origin: string }) => Promise<{ url: string; state: string }>;

/** Send the browser to Battle.net to (re)read the player's characters, then on to `next`. */
export async function startClaim(start: StartClaim, next?: string) {
	const { url, state } = await start({ origin: window.location.origin });
	sessionStorage.setItem(CLAIM_STATE_KEY, state);
	if (next) sessionStorage.setItem(CLAIM_NEXT_KEY, next);
	else sessionStorage.removeItem(CLAIM_NEXT_KEY);
	window.location.assign(url);
}

/** The claim callback: the expected state and destination, once. */
export function takeClaim() {
	const state = sessionStorage.getItem(CLAIM_STATE_KEY);
	const next = safeNext(sessionStorage.getItem(CLAIM_NEXT_KEY));
	sessionStorage.removeItem(CLAIM_STATE_KEY);
	sessionStorage.removeItem(CLAIM_NEXT_KEY);
	sessionStorage.removeItem(SIGN_IN_PENDING_KEY);
	return { state, next };
}

type SignInPending = { next?: string; at: number; claimStarted?: boolean };

export function markSignInPending(next?: string) {
	sessionStorage.setItem(SIGN_IN_PENDING_KEY, JSON.stringify({ next, at: Date.now() } satisfies SignInPending));
}

/** The pending Battle.net sign-in started in this tab, if recent. Client only. */
export function signInPending(): SignInPending | null {
	if (typeof window === "undefined") return null;
	try {
		const value = JSON.parse(sessionStorage.getItem(SIGN_IN_PENDING_KEY) ?? "null") as SignInPending | null;
		if (value && Date.now() - value.at < SIGN_IN_PENDING_TTL_MS) return { ...value, next: safeNext(value.next) };
	} catch {}
	sessionStorage.removeItem(SIGN_IN_PENDING_KEY);
	return null;
}

export function updateSignInPending(value: SignInPending | null) {
	if (value) sessionStorage.setItem(SIGN_IN_PENDING_KEY, JSON.stringify(value));
	else sessionStorage.removeItem(SIGN_IN_PENDING_KEY);
}
