/**
 * The query param Convex Auth's OAuth callback adds to the page it returns
 * to (`convexAuthCode`, or `convexAuthError`). The browser finishes sign-in by
 * reading it on that page, so a server-side redirect away from that page loses
 * the sign-in. Route guards let these URLs through.
 */
export function isAuthReturn(searchStr: string) {
	const params = new URLSearchParams(searchStr);
	return params.has("convexAuthCode") || params.has("convexAuthError");
}
