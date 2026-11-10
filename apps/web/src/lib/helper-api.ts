import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";

// Shared by the /api/helper/* routes the desktop helper (apps/helper) calls.

export function bearerToken(request: Request) {
	return request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1] ?? null;
}

export function convex() {
	return new ConvexHttpClient(import.meta.env.VITE_CONVEX_URL as string);
}

export function json(status: number, body: unknown) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
	});
}

/** Turn a Convex error into a JSON response; ConvexError messages are meant for the user. */
export function errorResponse(error: unknown) {
	if (error instanceof ConvexError) return json(400, { error: String(error.data) });
	console.error("helper api", error);
	return json(500, { error: "Something went wrong" });
}
