import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ConvexHttpClient } from "convex/browser";
import { useEffect, useRef, useState } from "react";
import { landingPath } from "@/lib/claim";

// The desktop app opens this in its window with a one-time code, after the
// player approved the app in their own browser (/helper/connect). The code is
// swapped for a session through the same sign-in proxy as Battle.net's
// (session cookie, refresh token httpOnly), then on to where they belong.
export const Route = createFileRoute("/desktop/session")({
	validateSearch: (search: Record<string, unknown>) => ({
		code: typeof search.code === "string" ? search.code : "",
	}),
	head: () => ({ meta: [{ title: "Signing in · Guildie" }] }),
	component: DesktopSession,
});

function DesktopSession() {
	const { code } = Route.useSearch();
	const { setSession } = useAuthActions();
	const router = useRouter();
	const started = useRef(false);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		if (started.current) return;
		started.current = true;
		// Don't leave the code in the address (or history).
		router.history.replace("/desktop/session");
		void (async () => {
			try {
				const proxy = new ConvexHttpClient("/auth/signin?path=", { skipConvexDeploymentUrlCheck: true });
				const result = await proxy.mutation(api.auth.signInWithDesktopCode, { code });
				if (result.status !== "complete") return setFailed(true);
				await setSession(result.tokens);
				await router.invalidate();
				const viewer = await router.options.context.queryClient.fetchQuery(convexQuery(api.users.viewer, {}));
				await router.navigate({ href: landingPath(viewer), replace: true });
			} catch {
				setFailed(true);
			}
		})();
	}, [code, router, setSession]);

	return (
		<div className="max-w-md py-10">
			<h1 className="text-4xl">Signing in</h1>
			<p className="mt-3 text-muted-foreground">
				{failed ? (
					<>
						That sign-in link expired or was already used.{" "}
						<Link to="/sign-in" className="underline underline-offset-4">
							Sign in again
						</Link>
						.
					</>
				) : (
					"One moment…"
				)}
			</p>
		</div>
	);
}
