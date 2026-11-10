import { api } from "@convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { bearerToken, convex, errorResponse, json } from "@/lib/helper-api";

// GET /api/helper/me: the helper checks its token. 200 with the account's
// BattleTag and claimed characters, or 401.
export const Route = createFileRoute("/api/helper/me")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const token = bearerToken(request);
				if (!token) return json(401, { error: "Missing token" });
				try {
					const me = await convex().query(api.helper.whoami, { token });
					return me ? json(200, me) : json(401, { error: "Unknown or revoked token" });
				} catch (error) {
					return errorResponse(error);
				}
			},
		},
	},
});
