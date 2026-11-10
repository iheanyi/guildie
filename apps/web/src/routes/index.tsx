import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { REGIONS, type Region } from "@convex/shared/wow";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Page, PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/")({
	loader: ({ context }) => context.queryClient.ensureQueryData(convexQuery(api.guilds.list, {})),
	component: Home,
});

function Home() {
	const { data: guilds } = useSuspenseQuery(convexQuery(api.guilds.list, {}));
	const { data: viewer } = useSuspenseQuery(convexQuery(api.users.viewer, {}));
	return (
		<Page width="medium">
			<PageHeader
				title="Guilds"
				description="Who's in the guild, what they play, and what they're wearing. Rosters come from Blizzard's API and refresh every hour. Built for WoW: Forever, and open source."
			/>
			{guilds.length === 0 ? (
				<p className="text-muted-foreground">No guilds yet.</p>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Region</TableHead>
							<TableHead className="text-right">Members</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{guilds.map((g) => (
							<TableRow key={g._id} className="relative">
								<TableCell>
									<Link
										to="/g/$region/$slug"
										params={{ region: g.region, slug: g.slug }}
										className="font-medium after:absolute after:inset-0"
									>
										{g.name}
									</Link>
									{viewer?.guilds.some((mine) => mine._id === g._id) && (
										<span className="ml-2 text-xs text-muted-foreground">yours</span>
									)}
								</TableCell>
								<TableCell className="text-muted-foreground">{g.region.toUpperCase()}</TableCell>
								<TableCell className="num text-right">{g.memberCount}</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}

			{viewer ? (
				<AddGuild />
			) : (
				<p className="mt-6 text-[0.8125rem] text-muted-foreground">
					<Link to="/sign-in" className="text-foreground underline underline-offset-4">
						Sign in
					</Link>{" "}
					to add your guild.
				</p>
			)}
		</Page>
	);
}

function AddGuild() {
	const add = useMutation(api.guilds.add);
	const navigate = useNavigate();
	const [name, setName] = useState("");
	const [region, setRegion] = useState<Region>("us");
	const [error, setError] = useState<string | null>(null);
	return (
		<form
			className="mt-8 max-w-xl"
			onSubmit={async (e) => {
				e.preventDefault();
				setError(null);
				try {
					const params = await add({ name, region });
					await navigate({ to: "/g/$region/$slug", params });
				} catch (err) {
					setError(err instanceof ConvexError ? String(err.data) : "Couldn't add that guild.");
				}
			}}
		>
			<label htmlFor="guild-name" className="text-[0.8125rem] font-medium">
				Add a guild
			</label>
			<div className="mt-1.5 flex gap-2">
				<select
					aria-label="Region"
					value={region}
					onChange={(e) => setRegion(e.target.value as Region)}
					className="h-8 rounded-md border px-1.5 text-[0.8125rem]"
				>
					{REGIONS.map((r) => (
						<option key={r} value={r}>
							{r.toUpperCase()}
						</option>
					))}
				</select>
				<Input id="guild-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Guild name, exactly as in game" />
				<Button type="submit" disabled={!name.trim()}>
					Add
				</Button>
			</div>
			{error && <p className="mt-2 text-sm text-destructive">{error}</p>}
		</form>
	);
}
