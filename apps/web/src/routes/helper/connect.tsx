import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { Button } from "@/components/ui/button";

// The desktop helper opens this page with its code; the signed-in player
// approves it, and the helper picks up its token by itself.
export const Route = createFileRoute("/helper/connect")({
	validateSearch: (search: Record<string, unknown>) => ({
		code: typeof search.code === "string" ? search.code.toUpperCase() : "",
	}),
	head: () => ({ meta: [{ title: "Connect the helper · guildie" }] }),
	component: Connect,
});

function Connect() {
	const { code } = Route.useSearch();
	const { data: viewer } = useSuspenseQuery(convexQuery(api.users.viewer, {}));
	const { data: pairing } = useQuery(convexQuery(api.helper.pairing, { code }));
	const approve = useMutation(api.helper.approvePairing);
	const [error, setError] = useState<string | null>(null);

	return (
		<div className="max-w-xl py-10">
			<h1 className="text-4xl">Connect the guildie helper</h1>
			{!viewer ? (
				<p className="mt-3">
					<Link
						to="/sign-in"
						search={{ next: `/helper/connect?code=${encodeURIComponent(code)}` }}
						className="underline underline-offset-4"
					>
						Sign in
					</Link>{" "}
					first, then you'll come back here.
				</p>
			) : !pairing ? null : pairing.state === "unknown" ? (
				<p className="mt-3 text-muted-foreground">
					This code expired or doesn't exist. Choose "Connect" in the helper again.
				</p>
			) : pairing.state === "approved" ? (
				<p className="mt-3">Connected. You can close this tab; the helper takes it from here.</p>
			) : (
				<>
					<p className="mt-3 text-muted-foreground">
						The helper on <span className="text-foreground">{pairing.label}</span> wants to upload your
						addon data as {viewer.battletag ?? viewer.name}. Check the code matches the one the helper
						shows.
					</p>
					<p className="num mt-6 font-mono text-3xl tracking-widest">{code}</p>
					<Button
						size="lg"
						className="mt-6"
						onClick={async () => {
							setError(null);
							try {
								await approve({ code });
							} catch (err) {
								setError(err instanceof ConvexError ? String(err.data) : "Couldn't connect. Try again.");
							}
						}}
					>
						Connect
					</Button>
					{error && <p className="mt-3 text-destructive">{error}</p>}
				</>
			)}
		</div>
	);
}
