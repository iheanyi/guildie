import { api } from "@convex/_generated/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAction, useConvexAuth } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useRef, useState } from "react";
import { CLAIM_STATE_KEY } from "@/lib/claim";

type Search = { code?: string; state?: string; error?: string };

export const Route = createFileRoute("/claim/callback")({
	validateSearch: (search: Record<string, unknown>): Search => ({
		code: typeof search.code === "string" ? search.code : undefined,
		state: typeof search.state === "string" ? search.state : undefined,
		error: typeof search.error === "string" ? search.error : undefined,
	}),
	head: () => ({ meta: [{ title: "Claiming characters · guildies" }] }),
	component: ClaimCallback,
});

function ClaimCallback() {
	const { code, state, error } = Route.useSearch();
	const { isAuthenticated, isLoading } = useConvexAuth();
	const complete = useAction(api.claims.complete);
	const started = useRef(false);
	const [result, setResult] = useState<
		{ status: "working" } | { status: "done"; total: number; inGuilds: number } | { status: "error"; message: string }
	>({ status: "working" });

	useEffect(() => {
		if (started.current || isLoading) return;
		started.current = true;
		const expected = sessionStorage.getItem(CLAIM_STATE_KEY);
		sessionStorage.removeItem(CLAIM_STATE_KEY);
		if (error) return setResult({ status: "error", message: "Battle.net didn't grant access." });
		if (!isAuthenticated) return setResult({ status: "error", message: "Sign in first, then claim again." });
		if (!code || !state || state !== expected) {
			return setResult({ status: "error", message: "This claim didn't start in this browser. Start again." });
		}
		complete({ code, state })
			.then((r) => setResult({ status: "done", ...r }))
			.catch((err) =>
				setResult({
					status: "error",
					message: err instanceof ConvexError ? String(err.data) : "Claiming failed. Try again.",
				}),
			);
	}, [code, state, error, isAuthenticated, isLoading, complete]);

	return (
		<div className="max-w-xl py-10">
			<h1 className="text-4xl">Claiming characters</h1>
			<p className="mt-3 text-muted-foreground">
				{result.status === "working" && "Reading your character list…"}
				{result.status === "done" &&
					(result.total === 0
						? "Battle.net lists no characters for that region yet. New characters can take a while to show up."
						: `Found ${result.total} character${result.total === 1 ? "" : "s"}; ${result.inGuilds} ${result.inGuilds === 1 ? "is" : "are"} in a guild here.`)}
				{result.status === "error" && result.message}
			</p>
			{result.status !== "working" && (
				<Link to="/me" className="mt-4 inline-block underline underline-offset-4">
					Back to your account
				</Link>
			)}
		</div>
	);
}
