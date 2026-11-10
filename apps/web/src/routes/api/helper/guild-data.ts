import { api } from "@convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { bearerToken, convex, errorResponse, json } from "@/lib/helper-api";

// GET /api/helper/guild-data (Bearer token): what the addon's tooltips show,
// for the guilds the token's claimed characters are in.
// ?v=2 -> { version: 2, generatedAt, mine, guilds: { ["region/slug"]: { name, region, slug, generatedAt, reagents } } }
// otherwise (Guildie app 0.2, the helper) -> { version: 1, generatedAt, guilds: [name], mine, reagents }
// reagents: { [itemId]: { name, users: [{ name, classId, profession, recipes }] } }
export const Route = createFileRoute("/api/helper/guild-data")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const token = bearerToken(request);
				if (!token) return json(401, { error: "Missing token" });
				const version = new URL(request.url).searchParams.get("v") === "2" ? 2 : undefined;
				try {
					const data = await convex().action(api.helper.guildData, { token, version });
					return data ? json(200, data) : json(401, { error: "Unknown or revoked token" });
				} catch (error) {
					return errorResponse(error);
				}
			},
		},
	},
});
