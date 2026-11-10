import { useSignInAnonymously } from "@convex-dev/auth/methods/anonymous/react";
import { useOauth, useOauthSignIn } from "@convex-dev/auth/methods/oauth/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/sign-in")({
	// Battle.net returns here (never guarded for signed-out visitors), the
	// browser finishes the sign-in, and the next load forwards to /me.
	beforeLoad: ({ context }) => {
		if (context.token) throw redirect({ to: "/me" });
	},
	head: () => ({ meta: [{ title: "Sign in · guildie" }] }),
	component: SignIn,
});

function SignIn() {
	const { signIn } = useOauthSignIn({
		providerName: "battlenet",
		startSignIn: api.auth.startSignInWithBattlenet,
		completeSignIn: api.auth.completeSignInWithBattlenet,
	});
	const { flowError } = useOauth();
	const { data: guestEnabled } = useQuery(convexQuery(api.users.guestEnabled, {}));
	const [pending, setPending] = useState(false);
	const [startError, setStartError] = useState(false);

	return (
		<div className="max-w-md py-10">
			<h1 className="text-4xl">Sign in</h1>
			<p className="mt-3 text-muted-foreground">
				Use your Battle.net account. We only learn your BattleTag. Reading your characters is a
				separate step you choose to take, from your account page.
			</p>
			<Button
				size="lg"
				className="mt-6"
				disabled={pending}
				onClick={async () => {
					setPending(true);
					setStartError(false);
					const result = await signIn({ redirectTo: `${window.location.origin}/sign-in` });
					if (result.status === "error") {
						setPending(false);
						setStartError(true);
					}
				}}
			>
				{pending ? "Heading to Battle.net…" : "Continue with Battle.net"}
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
