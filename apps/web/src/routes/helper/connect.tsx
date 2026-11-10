import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { Page, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

// The desktop app (or the older tray helper) opens this page with its code;
// the signed-in player approves it, and the app picks up its token by itself.
export const Route = createFileRoute("/helper/connect")({
	validateSearch: (search: Record<string, unknown>) => ({
		code: typeof search.code === "string" ? search.code.toUpperCase() : "",
	}),
	head: () => ({ meta: [{ title: "Connect the Guildie app · Guildie" }] }),
	component: Connect,
});

function Connect() {
	const { code } = Route.useSearch();
	const { data: viewer } = useSuspenseQuery(convexQuery(api.users.viewer, {}));
	const { data: pairing } = useQuery(convexQuery(api.helper.pairing, { code }));
	const approve = useMutation(api.helper.approvePairing);
	const [error, setError] = useState<string | null>(null);

	return (
		<Page width="narrow">
			<PageHeader title="Connect the Guildie app" />
			{!viewer ? (
				<p>
					<Link
						to="/sign-in"
						search={{ next: `/helper/connect?code=${encodeURIComponent(code)}` }}
						className="text-foreground underline underline-offset-4"
					>
						Sign in
					</Link>{" "}
					first, then you'll come back here.
				</p>
			) : !pairing ? null : pairing.state === "unknown" ? (
				<p className="text-muted-foreground">This code expired or doesn't exist. Sign in from the Guildie app again.</p>
			) : pairing.state === "approved" ? (
				<p>Connected. You can close this tab; the Guildie app takes it from here.</p>
			) : (
				<>
					<p className="text-muted-foreground">
						<span className="text-foreground">{pairing.label}</span> wants to sign in and upload your addon data as{" "}
						{viewer.battletag ?? viewer.name}. Check this code matches the one the app shows.
					</p>
					<p className="num mt-5 inline-block rounded-md border border-border bg-muted px-4 py-2 font-mono text-2xl tracking-[0.25em]">
						{code}
					</p>
					<Button
						size="lg"
						className="mt-5 flex"
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
		</Page>
	);
}
