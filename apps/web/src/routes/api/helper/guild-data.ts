import { api } from "@convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { bearerToken, convex, errorResponse, json } from "@/lib/helper-api";

// GET /api/helper/guild-data (Bearer token): what the addon's tooltips show,
// for the guilds the token's claimed characters are in.
// -> { version, generatedAt, guilds, mine, reagents: { [itemId]: { name, users: [{ name, profession, recipes }] } } }
export const Route = createFileRoute("/api/helper/guild-data")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const token = bearerToken(request);
				if (!token) return json(401, { error: "Missing token" });
				try {
					const data = await convex().action(api.helper.guildData, { token });
					return data ? json(200, data) : json(401, { error: "Unknown or revoked token" });
				} catch (error) {
					return errorResponse(error);
				}
			},
		},
	},
});
