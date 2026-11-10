import { useRouterState } from "@tanstack/react-router";

/** The current page's title, from its route's head() ("Unbound · Guildie" → "Unbound"). */
export function usePageTitle() {
	return useRouterState({
		select: (s) => {
			for (const match of [...s.matches].reverse()) {
				const meta = (match as { meta?: Array<{ title?: string } | undefined> }).meta;
				const title = meta?.find((m) => m?.title)?.title;
				if (title) return title === "Guildie" ? "Guilds" : title.replace(/ · Guildie$/, "");
			}
			return "Guildie";
		},
	});
}
