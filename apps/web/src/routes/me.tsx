import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { className } from "@convex/shared/wow";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { ClassText } from "@/components/class-name";
import { HelperTokens } from "@/components/helper-tokens";
import { Button } from "@/components/ui/button";
import { useInDesktopApp } from "@/lib/desktop";
import { isAuthReturn } from "@/lib/auth-return";
import { startClaim } from "@/lib/claim";


export const Route = createFileRoute("/me")({
	beforeLoad: ({ context, location }) => {
		// Not while a sign-in is finishing on this page (see isAuthReturn).
		if (!context.token && !isAuthReturn(location.searchStr)) throw redirect({ to: "/sign-in" });
	},
	head: () => ({ meta: [{ title: "Your account · Guildie" }] }),
	component: Me,
});

function Me() {
	const { data: viewer } = useSuspenseQuery(convexQuery(api.users.viewer, {}));
	if (!viewer) return null;
	return (
		<div className="max-w-2xl py-10">
			<h1 className="text-4xl">{viewer.battletag ?? viewer.name ?? "Your account"}</h1>

			{viewer.guilds.length > 0 && (
				<p className="mt-3">
					{viewer.guilds.map((g, i) => (
						<span key={g._id}>
							{i > 0 && ", "}
							<Link to="/g/$region/$slug" params={{ region: g.region, slug: g.slug }} className="underline underline-offset-4">
								{g.name}
							</Link>
						</span>
					))}
				</p>
			)}

			<h2 className="mt-10 text-2xl">Your characters</h2>
			<p className="mt-1 text-muted-foreground">
				Read from your Battle.net account each time you sign in, in every region. It proves which
				guild members are yours, so guildmates can find you and, later, so we can notify you.
			</p>
			{viewer.characters.length > 0 && (
				<ul className="mt-4 divide-y border-y text-sm">
					{viewer.characters.map((c) => (
						<li key={c._id} className="flex items-baseline justify-between py-2">
							<Link to="/c/$region/$slug" params={{ region: c.region, slug: c.slug }} className="hover:underline underline-offset-4">
								<ClassText classId={c.classId}>{c.name}</ClassText>
							</Link>
							<span className="num text-muted-foreground">
								{c.region.toUpperCase()} · {c.level ? `Level ${c.level} ` : ""}
								{c.classId ? className(c.classId) : ""}
							</span>
						</li>
					))}
				</ul>
			)}
			<ClaimCharacters />

			<h2 className="mt-12 text-2xl">Desktop helper</h2>
			<HelperTokens />

			<h2 className="mt-12 text-2xl">Discord</h2>
			<p className="mt-1 text-muted-foreground">
				Optional, for notifications. Not built yet.
			</p>
		</div>
	);
}

function ClaimCharacters() {
	const start = useMutation(api.claims.start);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	// The claim is a trip to Battle.net that has to happen in the browser you signed in with.
	if (useInDesktopApp()) {
		return (
			<p className="mt-4 text-sm text-muted-foreground">
				Your characters refresh every time you sign in. To refresh them now, use "Refresh my characters"
				on guildie.club in your browser.
			</p>
		);
	}
	return (
		<div className="mt-4">
			<Button
				disabled={pending}
				onClick={async () => {
					setError(null);
					setPending(true);
					try {
						await startClaim(start, "/me");
					} catch (err) {
						setPending(false);
						setError(err instanceof ConvexError ? String(err.data) : "Couldn't start. Try again.");
					}
				}}
			>
				{pending ? "Heading to Battle.net…" : "Refresh my characters"}
			</Button>
			{error && <p className="mt-2 text-sm text-destructive">{error}</p>}
		</div>
	);
}
