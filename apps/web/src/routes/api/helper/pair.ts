import { api } from "@convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { convex, errorResponse, json } from "@/lib/helper-api";

// POST /api/helper/pair  { "label": "Todd's PC", "session"?: true }
// (`session`: the desktop app, which also gets a one-time code to sign its window in)
// -> { code, pollSecret, expiresInSeconds, connectUrl }. The helper opens
// connectUrl in the browser and polls /api/helper/pair/poll.
export const Route = createFileRoute("/api/helper/pair")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const body = (await request.json().catch(() => ({}))) as { label?: unknown; session?: unknown };
				try {
					const pairing = await convex().mutation(api.helper.startPairing, {
						label: typeof body.label === "string" ? body.label : "Helper",
						session: body.session === true,
					});
					// The site's public origin (behind Portless locally, request.url is the dev server's).
					const origin = (import.meta.env.VITE_SITE_URL as string | undefined) || new URL(request.url).origin;
					const connectUrl = new URL(`/helper/connect?code=${pairing.code}`, origin).toString();
					return json(200, { ...pairing, connectUrl });
				} catch (error) {
					return errorResponse(error);
				}
			},
		},
	},
});
