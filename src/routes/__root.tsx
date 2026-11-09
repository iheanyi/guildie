import { convexQuery, type ConvexQueryClient } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet, Scripts, useRouter } from "@tanstack/react-router";
import { type ConvexReactClient, useConvexAuth } from "convex/react";
import { type ReactNode, useEffect, useRef } from "react";
import { SiteHeader } from "@/components/site-header";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getAuthToken } from "@/lib/convex-auth-start/functions";
import { ConvexAuthStartProvider } from "@/lib/convex-auth-start/provider";
import appCss from "@/styles/app.css?url";

export type RouterContext = {
	convex: ConvexReactClient;
	queryClient: QueryClient;
	convexQueryClient: ConvexQueryClient;
	token: string | null;
};

export const Route = createRootRouteWithContext<RouterContext>()({
	beforeLoad: async ({ context }) => {
		const token = await getAuthToken();
		// SSR queries run over HTTP; give them the request's identity.
		if (token) context.convexQueryClient.serverHttpClient?.setAuth(token);
		return { token };
	},
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(convexQuery(api.users.viewer, {}));
	},
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "guildies" },
			{ name: "description", content: "A home base for World of Warcraft guilds." },
		],
		links: [
			{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
			{ rel: "stylesheet", href: appCss },
		],
	}),
	shellComponent: RootDocument,
	component: RootComponent,
});

function RootDocument({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
}

function RootComponent() {
	const { convex, token } = Route.useRouteContext();
	return (
		<ConvexAuthStartProvider client={convex} initialToken={token}>
			<TooltipProvider>
				<AuthSync />
				<div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 sm:px-8">
					<SiteHeader />
					<main className="flex-1 pb-16">
						<Outlet />
					</main>
				</div>
			</TooltipProvider>
		</ConvexAuthStartProvider>
	);
}

/** Re-runs route guards/loaders when the browser signs in or out (e.g. after the OAuth redirect). */
function AuthSync() {
	const { isAuthenticated, isLoading } = useConvexAuth();
	const router = useRouter();
	const previous = useRef<boolean | null>(null);
	useEffect(() => {
		if (isLoading) return;
		if (previous.current !== null && previous.current !== isAuthenticated) {
			void router.invalidate();
		}
		previous.current = isAuthenticated;
	}, [isAuthenticated, isLoading, router]);
	return null;
}
