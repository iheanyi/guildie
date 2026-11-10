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

export const Route = createFileRoute("/")({
	loader: ({ context }) => context.queryClient.ensureQueryData(convexQuery(api.guilds.list, {})),
	component: Home,
});

function Home() {
	const { data: guilds } = useSuspenseQuery(convexQuery(api.guilds.list, {}));
	const { data: viewer } = useSuspenseQuery(convexQuery(api.users.viewer, {}));
	return (
		<div className="py-10">
			<h1 className="max-w-2xl text-4xl leading-tight">
				Who's in the guild, what they play, and what they're wearing.
			</h1>
			<p className="mt-3 max-w-2xl text-muted-foreground">
				Rosters come from Blizzard's API and refresh every hour. Built for WoW: Forever, and open
				source.
			</p>

			{viewer && viewer.guilds.length > 0 && (
				<p className="mt-6 text-lg">
					Your guild:{" "}
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

			<h2 className="mt-12 text-2xl">Guilds</h2>
			{guilds.length === 0 ? (
				<p className="mt-2 text-muted-foreground">No guilds yet.</p>
			) : (
				<ul className="mt-3 divide-y border-y">
					{guilds.map((g) => (
						<li key={g._id}>
							<Link
								to="/g/$region/$slug"
								params={{ region: g.region, slug: g.slug }}
								className="flex items-baseline justify-between gap-4 py-2.5 hover:bg-muted/60"
							>
								<span className="text-lg">{g.name}</span>
								<span className="num text-sm text-muted-foreground">
									{g.region.toUpperCase()} · {g.memberCount} members
								</span>
							</Link>
						</li>
					))}
				</ul>
			)}

			{viewer ? (
				<AddGuild />
			) : (
				<p className="mt-6 text-sm text-muted-foreground">
					<Link to="/sign-in" className="underline underline-offset-4">
						Sign in
					</Link>{" "}
					to add your guild.
				</p>
			)}
		</div>
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
			className="mt-10 max-w-xl"
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
			<label htmlFor="guild-name" className="text-sm font-medium">
				Add a guild
			</label>
			<div className="mt-1.5 flex gap-2">
				<select
					aria-label="Region"
					value={region}
					onChange={(e) => setRegion(e.target.value as Region)}
					className="h-7 rounded-md border bg-transparent px-1.5 text-xs"
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
