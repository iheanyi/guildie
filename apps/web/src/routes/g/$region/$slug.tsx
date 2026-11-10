import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { Region } from "@convex/shared/wow";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound, Outlet } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ago } from "@/lib/format";

// A guild's pages: the roster (index) and what the guild can craft
// (crafting), under one header with the guild's facts and the owner's
// controls. The sidebar switches between them (no tabs here).
export const Route = createFileRoute("/g/$region/$slug")({
	loader: async ({ context, params }) => {
		const data = await context.queryClient.ensureQueryData(
			convexQuery(api.guilds.get, { region: params.region as Region, slug: params.slug }),
		);
		if (!data) throw notFound();
		return { name: data.guild.name };
	},
	head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.name ?? "Guild"} · Guildie` }] }),
	component: GuildLayout,
});

function GuildLayout() {
	const params = Route.useParams();
	const { data } = useSuspenseQuery(
		convexQuery(api.guilds.get, { region: params.region as Region, slug: params.slug }),
	);
	if (!data) return null;
	if (data.hidden) {
		return (
			<PageHeader
				title={data.guild.name}
				description={
					<>
						This guild's roster is for members only.{" "}
						<Link to="/settings" className="text-foreground underline underline-offset-4">
							Claim your characters
						</Link>{" "}
						to see it.
					</>
				}
			/>
		);
	}
	const { guild, isOwner } = data;
	const faction = guild.faction && guild.faction[0] + guild.faction.slice(1).toLowerCase();
	return (
		<div className="flex min-h-full flex-col">
			<PageHeader
				title={guild.name}
				description={
					<span className="num">
						{[
							guild.region.toUpperCase(),
							faction,
							`${guild.memberCount} members`,
							guild.rosterSyncedAt ? `synced ${ago(guild.rosterSyncedAt)}` : "not synced yet",
						]
							.filter(Boolean)
							.join(" · ")}
					</span>
				}
				actions={<GuildActions guildId={guild._id} isOwner={isOwner} visibility={guild.visibility} />}
				className="pb-0"
			>
				{guild.lastSyncError && <p className="mt-2 text-[0.8125rem] text-destructive">{guild.lastSyncError}</p>}
			</PageHeader>
			<Outlet />
		</div>
	);
}

function GuildActions({
	guildId,
	isOwner,
	visibility,
}: {
	guildId: Id<"guilds">;
	isOwner: boolean;
	visibility: "public" | "members";
}) {
	const requestSync = useMutation(api.guilds.requestSync);
	const setVisibility = useMutation(api.guilds.setVisibility);
	const [message, setMessage] = useState<string | null>(null);
	return (
		<>
			{message && <span className="text-xs text-muted-foreground">{message}</span>}
			{isOwner && (
				<label className="flex items-center gap-2 pr-2 text-[0.8125rem] text-muted-foreground select-none">
					<Switch
						size="sm"
						checked={visibility === "members"}
						onCheckedChange={(checked) => setVisibility({ guildId, visibility: checked ? "members" : "public" })}
					/>
					Members only
				</label>
			)}
			<Button
				variant="outline"
				size="sm"
				onClick={async () => {
					try {
						await requestSync({ guildId });
						setMessage("Syncing. The roster updates by itself.");
					} catch (err) {
						setMessage(err instanceof ConvexError ? String(err.data) : "Couldn't start a sync.");
					}
				}}
			>
				Sync now
			</Button>
		</>
	);
}
