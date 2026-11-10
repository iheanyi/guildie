import { createFileRoute, Outlet } from "@tanstack/react-router";

// A character's pages: gear (index), talents and professions.
export const Route = createFileRoute("/c/$region/$slug")({
	component: Outlet,
});
