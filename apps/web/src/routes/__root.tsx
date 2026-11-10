import { convexQuery, type ConvexQueryClient } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Link, Outlet, Scripts, useRouter } from "@tanstack/react-router";
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
				{ name: "theme-color", content: "#1c150e" },
			{ title: "Guildie" },
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
		<html lang="en" suppressHydrationWarning>
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
				<div className="app-shell">
					<SiteHeader />
					<div className="app-scroll">
						<main className="mx-auto w-full max-w-6xl flex-1 px-2.5 py-4 sm:px-6 sm:py-8">
							<div className="frame px-4 sm:px-8 [&>*]:pt-6 [&>*]:pb-8 sm:[&>*]:pt-8 sm:[&>*]:pb-10">
								<Outlet />
							</div>
						</main>
						<footer className="mx-auto flex w-full max-w-6xl gap-5 px-4 pt-1 pb-6 text-sm text-muted-foreground sm:px-8">
							<Link to="/data" className="hover:text-gold">
								Where the data comes from
							</Link>
							<a href="https://github.com/natedunn/guildie" className="hover:text-gold">
								Source
							</a>
						</footer>
					</div>
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
