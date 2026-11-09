import { useAuthActions } from "@convex-dev/auth/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";

export function SiteHeader() {
	const { data: viewer } = useQuery(convexQuery(api.users.viewer, {}));
	return (
		<header className="flex items-baseline justify-between gap-4 border-b py-4">
			<Link to="/" className="font-heading text-2xl font-semibold tracking-tight">
				guildies
			</Link>
			<nav className="flex items-baseline gap-5 text-sm">
				{viewer ? (
					<>
						<Link to="/me" className="hover:underline underline-offset-4">
							{viewer.battletag?.split("#")[0] ?? viewer.name ?? "You"}
						</Link>
						<SignOut />
					</>
				) : (
					<Link to="/sign-in" className="hover:underline underline-offset-4">
						Sign in
					</Link>
				)}
			</nav>
		</header>
	);
}

function SignOut() {
	const { signOut } = useAuthActions();
	const router = useRouter();
	return (
		<button
			type="button"
			className="text-muted-foreground hover:text-foreground"
			onClick={async () => {
				await signOut();
				await router.invalidate();
			}}
		>
			Sign out
		</button>
	);
}
