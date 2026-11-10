import { useSignInAnonymously } from "@convex-dev/auth/methods/anonymous/react";
import { useOauth, useOauthSignIn } from "@convex-dev/auth/methods/oauth/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { desktop, useInDesktopApp } from "@/lib/desktop";
import { landingPath, markSignInPending, safeNext, signInPending, startClaim, updateSignInPending } from "@/lib/claim";
import type { RouterContext } from "./__root";

/** Fresh on the client (the cached viewer can predate the sign-in). */
const fetchViewer = (context: RouterContext) =>
	typeof window === "undefined"
		? context.queryClient.ensureQueryData(convexQuery(api.users.viewer, {}))
		: context.convex.query(api.users.viewer, {});

export const Route = createFileRoute("/sign-in")({
	validateSearch: (search: Record<string, unknown>): { next?: string } => ({ next: safeNext(search.next) }),
	// Battle.net returns here (never guarded for signed-out visitors), the
	// browser finishes the sign-in, then SignIn runs the claim hop
	// (lib/claim.ts). Signed in otherwise: straight on to where they belong.
	beforeLoad: async ({ context, search }) => {
		if (context.token && !signInPending()) {
			throw redirect({ href: landingPath(await fetchViewer(context), search.next) });
		}
	},
	head: () => ({ meta: [{ title: "Sign in · Guildie" }] }),
	component: SignIn,
});

function SignIn() {
	const { next } = Route.useSearch();
	const { signIn } = useOauthSignIn({
		providerName: "battlenet",
		startSignIn: api.auth.startSignInWithBattlenet,
		completeSignIn: api.auth.completeSignInWithBattlenet,
	});
	const { flowError } = useOauth();
	const { data: guestEnabled } = useQuery(convexQuery(api.users.guestEnabled, {}));
	const [pending, setPending] = useState(false);
	const [startError, setStartError] = useState(false);
	const claiming = useFinishSignIn(!!flowError);
	const inApp = useInDesktopApp();

	// In the desktop app, signing in happens in the player's own browser.
	if (inApp) return <DesktopSignIn />;

	return (
		<div className="max-w-md py-10">
			<h1 className="text-4xl">Sign in</h1>
			<p className="mt-3 text-muted-foreground">
				Use your Battle.net account. We learn your BattleTag and your character list, which is how
				we find your guild. We don't keep Battle.net's tokens.
			</p>
			<Button
				size="lg"
				className="mt-6"
				disabled={pending || claiming}
				onClick={async () => {
					setPending(true);
					setStartError(false);
					markSignInPending(next);
					const back = new URL("/sign-in", window.location.origin);
					if (next) back.searchParams.set("next", next);
					const result = await signIn({ redirectTo: back.toString() });
					if (result.status === "error") {
						setPending(false);
						setStartError(true);
						updateSignInPending(null);
					}
				}}
			>
				{claiming ? "Reading your characters…" : pending ? "Heading to Battle.net…" : "Continue with Battle.net"}
			</Button>
			{(flowError || startError) && (
				<p className="mt-4 text-destructive">
					{flowError?.error === "ACCESS_DENIED"
						? "Sign-in was cancelled."
						: flowError?.error === "EXPIRED"
							? "That sign-in took too long. Try again."
							: "Sign-in didn't finish. Try again."}
				</p>
			)}
			{guestEnabled && <GuestSignIn />}
		</div>
	);
}

/**
 * Back from Battle.net and signed in: hop through the claim (Battle.net
 * approves it without asking) so characters and guild are set up, then land.
 * Returns true while that's under way.
 */
function useFinishSignIn(failed: boolean) {
	const { isAuthenticated } = useConvexAuth();
	const start = useMutation(api.claims.start);
	const { convex } = Route.useRouteContext();
	const router = useRouter();
	const [claiming, setClaiming] = useState(false);
	const started = useRef(false);
	useEffect(() => {
		const pending = signInPending();
		if (!pending) return;
		if (failed) return updateSignInPending(null);
		if (!isAuthenticated || started.current) return;
		started.current = true;
		const land = async () => {
			updateSignInPending(null);
			const viewer = await convex.query(api.users.viewer, {});
			await router.navigate({ href: landingPath(viewer, pending.next), replace: true });
		};
		// Already hopped once (e.g. Back from Battle.net): don't loop.
		if (pending.claimStarted) return void land();
		setClaiming(true);
		updateSignInPending({ ...pending, claimStarted: true });
		// Can't claim (e.g. Battle.net isn't configured here): sign-in still worked.
		startClaim(start, pending.next).catch(land);
	}, [isAuthenticated, failed, start, convex, router]);
	return claiming;
}

/** Local backends only; the backend refuses anywhere else. */
function GuestSignIn() {
	const { signIn } = useSignInAnonymously({ signInAnonymously: api.auth.signInAsGuest });
	const router = useRouter();
	return (
		<div className="mt-12 border-t pt-4 text-sm">
			<p className="text-muted-foreground">Local backend: guest accounts are on.</p>
			<Button
				variant="outline"
				className="mt-2"
				onClick={async () => {
					await signIn();
					await router.invalidate();
					await router.navigate({ to: "/" });
				}}
			>
				Sign in as a guest
			</Button>
		</div>
	);
}

/** The desktop app: sign in in the browser, and the app signs its window in when you approve it. */
function DesktopSignIn() {
	const [pending, setPending] = useState(false);
	return (
		<div className="max-w-md py-10">
			<h1 className="text-4xl">Sign in</h1>
			<p className="mt-3 text-muted-foreground">
				You'll sign in with Battle.net in your web browser, where any of your usual logins work. Then
				click Connect there, and the app signs in by itself.
			</p>
			<Button
				size="lg"
				className="mt-6"
				disabled={pending}
				onClick={async () => {
					setPending(true);
					await desktop()?.signIn?.().catch(() => undefined);
					setPending(false);
				}}
			>
				{pending ? "Continue in your browser…" : "Sign in with your browser"}
			</Button>
		</div>
	);
}
