import { api } from "@convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { convex, errorResponse } from "@/lib/helper-api";

// GET /api/addon/bundle: every public guild's tooltip data, v2
// ({ version: 2, generatedAt, guilds: { ["region/slug"]: { name, region, slug, generatedAt, reagents } } }).
// The addon release script (apps/addon/scripts/build.ts) turns it into
// GuildieBundle.lua. Members-only guilds are never in it (addon:bundle).
//
// Public and the same for everyone, so it's cached: addon:bundle keeps a build
// for half an hour, and the response sits in the Worker's edge cache (where
// there is one; not in local dev) and in browsers for 10 minutes. Kept short
// because a guild that turns members-only must drop out soon.

const MAX_AGE = 10 * 60;

type EdgeCache = { match(request: Request): Promise<Response | undefined>; put(request: Request, response: Response): Promise<void> };

function edgeCache(): EdgeCache | undefined {
	return (globalThis as { caches?: { default?: EdgeCache } }).caches?.default;
}

export const Route = createFileRoute("/api/addon/bundle")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				// Query strings would make separate cache entries; there are none to honor.
				const key = new Request(new URL("/api/addon/bundle", request.url).toString());
				const cache = edgeCache();
				const hit = await cache?.match(key).catch(() => undefined);
				if (hit) return hit;
				try {
					const data: string = await convex().action(api.addon.bundle, {});
					const response = new Response(data, {
						status: 200,
						headers: {
							"Content-Type": "application/json",
							"Cache-Control": `public, max-age=${MAX_AGE}`,
							"Access-Control-Allow-Origin": "*",
						},
					});
					await cache?.put(key, response.clone()).catch(() => undefined);
					return response;
				} catch (error) {
					return errorResponse(error);
				}
			},
		},
	},
});
