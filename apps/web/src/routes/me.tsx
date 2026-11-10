import { createFileRoute, redirect } from "@tanstack/react-router";

// Account moved to Settings; old links (and sign-ins in flight) still land there.
export const Route = createFileRoute("/me")({
	beforeLoad: ({ location }) => {
		throw redirect({ href: `/settings${location.searchStr}`, replace: true });
	},
});
