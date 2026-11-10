import { api } from "@convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { bearerToken, convex, errorResponse, json } from "@/lib/helper-api";

// POST /api/helper/snapshot: the helper uploads what the addon saved.
// Body: { "version": 1, "characters": [ { guid, name, level, classToken, capturedAt, talents: [ { id, rank, name } ] } ] }
// 200 { accepted: [slug], unmatched: [name] }. Characters must be claimed by the token's owner.
const MAX_BODY_BYTES = 256 * 1024;

export const Route = createFileRoute("/api/helper/snapshot")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const token = bearerToken(request);
				if (!token) return json(401, { error: "Missing token" });
				const text = await request.text();
				if (text.length > MAX_BODY_BYTES) return json(413, { error: "Upload too large" });
				let body: { version?: unknown; characters?: unknown };
				try {
					body = JSON.parse(text);
				} catch {
					return json(400, { error: "Body must be JSON" });
				}
				if (body.version !== 1 || !Array.isArray(body.characters)) {
					return json(400, { error: "Expected { version: 1, characters: [...] }" });
				}
				try {
					const result = await convex().mutation(api.helper.ingest, {
						token,
						characters: body.characters as never,
					});
					return json(200, result);
				} catch (error) {
					return errorResponse(error);
				}
			},
		},
	},
});
