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
import { Page, PageHeader, SectionTitle } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
		<Page width="medium">
			<PageHeader
				title={viewer.battletag ?? viewer.name ?? "Your account"}
				description={
					viewer.guilds.length > 0 &&
					viewer.guilds.map((g, i) => (
						<span key={g._id}>
							{i > 0 && ", "}
							<Link to="/g/$region/$slug" params={{ region: g.region, slug: g.slug }} className="text-foreground hover:underline underline-offset-4">
								{g.name}
							</Link>
						</span>
					))
				}
			/>

			<section className="mt-4">
				<SectionTitle>Your characters</SectionTitle>
				<p className="mt-1 text-muted-foreground">
					Read from your Battle.net account each time you sign in, in every region. It proves which
					guild members are yours, so guildmates can find you and, later, so we can notify you.
				</p>
				{viewer.characters.length > 0 && (
					<Table className="mt-3">
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Class</TableHead>
								<TableHead className="text-right">Level</TableHead>
								<TableHead className="text-right">Region</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{viewer.characters.map((c) => (
								<TableRow key={c._id}>
									<TableCell>
										<Link to="/c/$region/$slug" params={{ region: c.region, slug: c.slug }} className="font-medium hover:underline underline-offset-4">
											<ClassText classId={c.classId}>{c.name}</ClassText>
										</Link>
									</TableCell>
									<TableCell className="text-muted-foreground">{c.classId ? className(c.classId) : ""}</TableCell>
									<TableCell className="num text-right">{c.level ?? ""}</TableCell>
									<TableCell className="text-right text-muted-foreground">{c.region.toUpperCase()}</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
				<ClaimCharacters />
			</section>

			<section className="mt-10">
				<SectionTitle>Privacy</SectionTitle>
				<BattletagSetting hidden={!!viewer.hideBattletag} />
			</section>

			<section className="mt-10">
				<SectionTitle>Desktop app</SectionTitle>
				<HelperTokens />
			</section>

			<section className="mt-10">
				<SectionTitle>Discord</SectionTitle>
				<p className="mt-1 text-muted-foreground">Optional, for notifications. Not built yet.</p>
			</section>
		</Page>
	);
}

function ClaimCharacters() {
	const start = useMutation(api.claims.start);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	// The claim is a trip to Battle.net that has to happen in the browser you signed in with.
	if (useInDesktopApp()) {
		return (
			<p className="mt-4 text-[0.8125rem] text-muted-foreground">
				Your characters refresh every time you sign in. To refresh them now, use "Refresh my characters"
				on guildie.club in your browser.
			</p>
		);
	}
	return (
		<div className="mt-4">
			<Button
				variant="outline"
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

/** Guildmates see your BattleTag when they hover your characters on the roster, unless you hide it. */
function BattletagSetting({ hidden }: { hidden: boolean }) {
	const setHide = useMutation(api.users.setHideBattletag);
	return (
		<label className="mt-2 flex items-start gap-3 text-[0.8125rem]">
			<Switch className="mt-0.5" checked={hidden} onCheckedChange={(hide) => void setHide({ hide })} />
			<span>
				Hide my BattleTag from guildmates
				<span className="block text-muted-foreground">
					Members of your guilds see it when they hover your characters on the roster. Nobody else ever does.
				</span>
			</span>
		</label>
	);
}
