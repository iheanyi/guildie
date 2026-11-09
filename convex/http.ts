import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { sha256 } from "./claims";

const http = httpRouter();

// Battle.net's redirect for "claim my characters" (directly, or forwarded by
// the gateway). It only bounces the browser to the app that started the flow:
// the code is exchanged there, by the signed-in user who holds the state.
http.route({
	path: "/oauth/claim/callback",
	method: "GET",
	handler: httpAction(async (ctx, request) => {
		const url = new URL(request.url);
		const state = url.searchParams.get("state");
		const origin = state && (await ctx.runQuery(internal.claims.originFor, { stateHash: await sha256(state) }));
		if (!origin) return new Response("This link expired. Go back to guildies and start again.", { status: 400 });
		const next = new URL(`${origin}/claim/callback`);
		for (const key of ["code", "state", "error"]) {
			const value = url.searchParams.get(key);
			if (value) next.searchParams.set(key, value);
		}
		return new Response(null, {
			status: 302,
			headers: { Location: next.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
		});
	}),
});

export default http;
