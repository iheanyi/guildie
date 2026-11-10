import { api } from "@convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { convex, errorResponse, json } from "@/lib/helper-api";

// POST /api/helper/pair/poll  { "code", "pollSecret" }
// -> { status: "pending" } | { status: "approved", token } (once) | { status: "expired" }
export const Route = createFileRoute("/api/helper/pair/poll")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const body = (await request.json().catch(() => ({}))) as { code?: unknown; pollSecret?: unknown };
				if (typeof body.code !== "string" || typeof body.pollSecret !== "string") {
					return json(400, { error: "Expected { code, pollSecret }" });
				}
				try {
					return json(200, await convex().mutation(api.helper.pollPairing, { code: body.code, pollSecret: body.pollSecret }));
				} catch (error) {
					return errorResponse(error);
				}
			},
		},
	},
});
