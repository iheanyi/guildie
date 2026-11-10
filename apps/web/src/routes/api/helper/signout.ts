import { api } from "@convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { bearerToken, convex, errorResponse, json } from "@/lib/helper-api";

// POST /api/helper/signout (Bearer token): the token stops working.
export const Route = createFileRoute("/api/helper/signout")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const token = bearerToken(request);
				if (!token) return json(401, { error: "Missing token" });
				try {
					await convex().mutation(api.helper.signOut, { token });
					return json(200, { ok: true });
				} catch (error) {
					return errorResponse(error);
				}
			},
		},
	},
});
