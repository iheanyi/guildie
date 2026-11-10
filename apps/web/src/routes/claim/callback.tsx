import { api } from "@convex/_generated/api";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useAction, useConvex, useConvexAuth } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useRef, useState } from "react";
import { landingPath, takeClaim } from "@/lib/claim";

type Search = { code?: string; state?: string; error?: string };

export const Route = createFileRoute("/claim/callback")({
	validateSearch: (search: Record<string, unknown>): Search => ({
		code: typeof search.code === "string" ? search.code : undefined,
		state: typeof search.state === "string" ? search.state : undefined,
		error: typeof search.error === "string" ? search.error : undefined,
	}),
	head: () => ({ meta: [{ title: "Reading your characters · Guildie" }] }),
	component: ClaimCallback,
});

function ClaimCallback() {
	const { code, state, error } = Route.useSearch();
	const { isAuthenticated, isLoading } = useConvexAuth();
	const complete = useAction(api.claims.complete);
	const convex = useConvex();
	const router = useRouter();
	const started = useRef(false);
	const [next, setNext] = useState("/settings");
	const [result, setResult] = useState<
		{ status: "working" } | { status: "done"; total: number; inGuilds: number } | { status: "error"; message: string }
	>({ status: "working" });

	useEffect(() => {
		if (started.current || isLoading) return;
		started.current = true;
		const expected = takeClaim();
		if (expected.next) setNext(expected.next);
		if (error) return setResult({ status: "error", message: "Battle.net didn't grant access to your characters." });
		if (!isAuthenticated) return setResult({ status: "error", message: "Sign in first, then try again." });
		if (!code || !state || state !== expected.state) {
			return setResult({
				status: "error",
				message: "This didn't start in this browser. Try again from your account page.",
			});
		}
		complete({ code, state })
			.then(async (r) => {
				setResult({ status: "done", ...r });
				// Guilds just found (maybe not synced yet) plus those already known.
				const viewer = await convex.query(api.users.viewer, {});
				const guilds = [...r.guilds, ...(viewer?.guilds ?? [])];
				await router.navigate({ href: landingPath(viewer, expected.next, guilds), replace: true });
			})
			.catch((err) =>
				setResult({
					status: "error",
					message:
						err instanceof ConvexError
							? String(err.data)
							: "Reading your characters failed. Try again from your account page.",
				}),
			);
	}, [code, state, error, isAuthenticated, isLoading, complete, convex, router]);

	return (
		<div className="max-w-xl py-10">
			<h1 className="text-4xl">Reading your characters</h1>
			<p className="mt-3 text-muted-foreground">
				{result.status === "working" && "Reading your character list…"}
				{result.status === "done" &&
					(result.total === 0
						? "Battle.net lists no WoW: Forever characters on your account yet. New characters can take a while to show up."
						: `Found ${result.total} character${result.total === 1 ? "" : "s"}; ${result.inGuilds} ${result.inGuilds === 1 ? "is" : "are"} in a guild here.`)}
				{result.status === "error" && result.message}
			</p>
			{result.status === "error" && (
				<a href={next} className="mt-4 inline-block underline underline-offset-4">
					Continue
				</a>
			)}
		</div>
	);
}
