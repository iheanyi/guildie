import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/auth/signout")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const { authServer } = await import("@/lib/convex-auth-start/server");
				return authServer.signOutHandler(request);
			},
		},
	},
});
