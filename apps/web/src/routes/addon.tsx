import { createFileRoute, redirect } from "@tanstack/react-router";

// Moved into Settings. App builds 0.3.x open /addon from the tray.
export const Route = createFileRoute("/addon")({
	beforeLoad: () => {
		throw redirect({ to: "/settings/addon", replace: true });
	},
});
