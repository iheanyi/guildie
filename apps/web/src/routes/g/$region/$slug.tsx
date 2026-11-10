import { createFileRoute, Outlet } from "@tanstack/react-router";

// A guild's pages: the roster (index) and what the guild can craft (crafting).
export const Route = createFileRoute("/g/$region/$slug")({
	component: Outlet,
});
