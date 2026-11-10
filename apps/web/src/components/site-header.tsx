import { useAuthActions } from "@convex-dev/auth/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { desktop } from "@/lib/desktop";

export function SiteHeader() {
	const { data: viewer } = useQuery(convexQuery(api.users.viewer, {}));
	return (
		<header className="flex items-baseline justify-between gap-4 border-b py-4">
			<Link to="/" className="font-heading text-2xl font-semibold tracking-tight">
				Guildie
			</Link>
			<nav className="flex items-baseline gap-5 text-sm">
				{viewer ? (
					<>
						{viewer.guilds.length === 1 ? (
							<Link
								to="/g/$region/$slug"
								params={{ region: viewer.guilds[0].region, slug: viewer.guilds[0].slug }}
								className="hover:underline underline-offset-4"
							>
								{viewer.guilds[0].name}
							</Link>
						) : (
							viewer.guilds.length > 1 && (
								<Link to="/me" className="hover:underline underline-offset-4">
									Your guilds
								</Link>
							)
						)}
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
				// Inside the desktop app, signing out here signs it out too.
				await desktop()?.signOut().catch(() => {});
				await router.invalidate();
			}}
		>
			Sign out
		</button>
	);
}
