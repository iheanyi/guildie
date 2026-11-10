import { useAuthActions } from "@convex-dev/auth/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { desktop } from "@/lib/desktop";

export function SiteHeader() {
	const { data: viewer } = useQuery(convexQuery(api.users.viewer, {}));
	return (
		<header className="site-header">
			<div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
				<Link
					to="/"
					className="flex items-center gap-2 font-heading text-xl text-heading [text-shadow:0_1px_0_#000,0_0_10px_rgb(255_190_60/0.25)] hover:text-gold"
				>
					<svg viewBox="0 0 32 32" aria-hidden="true" className="size-5 drop-shadow-[0_1px_0_#000]">
						<path d="M16 5l9 4v7c0 5.5-3.8 9.6-9 11-5.2-1.4-9-5.5-9-11V9z" fill="var(--red)" stroke="currentColor" strokeWidth="2" />
						<path d="M16 11v10M11 16h10" stroke="currentColor" strokeWidth="2" />
					</svg>
					Guildie
				</Link>
				<nav className="flex items-center gap-5 text-sm">
					{viewer ? (
						<>
							{viewer.guilds.length === 1 ? (
								<Link
									to="/g/$region/$slug"
									params={{ region: viewer.guilds[0].region, slug: viewer.guilds[0].slug }}
									className="text-gold hover:text-[#fff2b0]"
								>
									{viewer.guilds[0].name}
								</Link>
							) : (
								viewer.guilds.length > 1 && (
									<Link to="/me" className="text-gold hover:text-[#fff2b0]">
										Your guilds
									</Link>
								)
							)}
							<Link to="/me" className="text-gold hover:text-[#fff2b0]">
								{viewer.battletag?.split("#")[0] ?? viewer.name ?? "You"}
							</Link>
							<SignOut />
						</>
					) : (
						<Link to="/sign-in" className="text-gold hover:text-[#fff2b0]">
							Sign in
						</Link>
					)}
				</nav>
			</div>
		</header>
	);
}

function SignOut() {
	const { signOut } = useAuthActions();
	const router = useRouter();
	return (
		<button
			type="button"
			className="text-muted-foreground hover:text-gold"
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
