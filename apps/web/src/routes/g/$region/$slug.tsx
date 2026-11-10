import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { CLASSES, className, raceName, type Region } from "@convex/shared/wow";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { useMemo, useState } from "react";
import { ClassText } from "@/components/class-name";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ago, rankLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/g/$region/$slug")({
	loader: async ({ context, params }) => {
		const data = await context.queryClient.ensureQueryData(
			convexQuery(api.guilds.get, { region: params.region as Region, slug: params.slug }),
		);
		if (!data) throw notFound();
		return { name: data.guild.name };
	},
	head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.name ?? "Guild"} · guildie` }] }),
	component: GuildPage,
});

type SortKey = "name" | "level" | "class" | "rank" | "ilvl" | "seen";

function GuildPage() {
	const params = Route.useParams();
	const { data } = useSuspenseQuery(
		convexQuery(api.guilds.get, { region: params.region as Region, slug: params.slug }),
	);
	if (!data) return null;
	if (data.hidden) {
		return (
			<div className="py-10">
				<h1 className="text-4xl">{data.guild.name}</h1>
				<p className="mt-3 text-muted-foreground">
					This guild's roster is for members only. <Link to="/me" className="underline underline-offset-4">Claim your characters</Link> to see it.
				</p>
			</div>
		);
	}
	const { guild, members, isOwner } = data;
	return (
		<div className="py-10">
			<h1 className="text-3xl sm:text-4xl">{guild.name}</h1>
			<p className="num mt-1.5 text-muted-foreground">
				{[
					guild.region.toUpperCase(),
					guild.ruleset,
					guild.faction && guild.faction[0] + guild.faction.slice(1).toLowerCase(),
					`${guild.memberCount} members`,
					guild.rosterSyncedAt ? `synced ${ago(guild.rosterSyncedAt)}` : "not synced yet",
				]
					.filter(Boolean)
					.join(" · ")}
			</p>
			{guild.lastSyncError && <p className="mt-2 text-sm text-destructive">{guild.lastSyncError}</p>}
			<Roster members={members} />
			<GuildFooter guildId={guild._id} isOwner={isOwner} visibility={guild.visibility} />
		</div>
	);
}

type GuildData = NonNullable<FunctionReturnType<typeof api.guilds.get>>;
type Member = Extract<GuildData, { hidden: false }>["members"][number];

function Roster({ members }: { members: Member[] }) {
	const [search, setSearch] = useState("");
	const [classFilter, setClassFilter] = useState<number | null>(null);
	const [maxOnly, setMaxOnly] = useState(false);
	const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "rank", desc: false });

	const rows = useMemo(() => {
		const q = search.trim().toLowerCase();
		const filtered = members.filter(
			(m) =>
				(!q ||
					m.name.toLowerCase().includes(q) ||
					m.surname?.toLowerCase().includes(q) ||
					m.professions?.some((p) => p.name.toLowerCase().includes(q)) ||
					m.talentTrees?.some((t) => t.name.toLowerCase().includes(q))) &&
				(classFilter === null || m.classId === classFilter) &&
				(!maxOnly || m.level === 60),
		);
		const value = (m: Member): string | number => {
			switch (sort.key) {
				case "name":
					return m.name.toLowerCase();
				case "level":
					return m.level;
				case "class":
					return className(m.classId);
				case "rank":
					return m.rank;
				case "ilvl":
					return m.averageItemLevel ?? -1;
				case "seen":
					return m.lastLoginAt ?? 0;
			}
		};
		return filtered.sort((a, b) => {
			const [x, y] = [value(a), value(b)];
			const cmp = x < y ? -1 : x > y ? 1 : a.name.localeCompare(b.name);
			return sort.desc ? -cmp : cmp;
		});
	}, [members, search, classFilter, maxOnly, sort]);

	const classCounts = useMemo(() => {
		const counts = new Map<number, number>();
		for (const m of members) counts.set(m.classId, (counts.get(m.classId) ?? 0) + 1);
		return counts;
	}, [members]);

	const header = (key: SortKey, label: string, align?: "right") => (
		<TableHead className={cn(align === "right" && "text-right")}>
			<button
				type="button"
				className={cn("hover:text-[#fff2b0]", sort.key === key && "text-[#fff2b0]")}
				onClick={() =>
					setSort((s) => ({ key, desc: s.key === key ? !s.desc : key === "level" || key === "ilvl" || key === "seen" }))
				}
			>
				{label}
				{sort.key === key && (sort.desc ? " ↓" : " ↑")}
			</button>
		</TableHead>
	);

	return (
		<section className="mt-6">
			<div className="flex flex-wrap items-center gap-x-5 gap-y-3">
				<Input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Search names, talents or professions"
					className="w-64"
				/>
				<label className="flex items-center gap-2 text-sm">
					<Switch checked={maxOnly} onCheckedChange={setMaxOnly} />
					Level 60 only
				</label>
			</div>
			<div className="mt-3 flex flex-wrap gap-1.5 text-sm">
				<button
					type="button"
					className="chip"
					data-active={classFilter === null}
					onClick={() => setClassFilter(null)}
				>
					All <span className="num">{members.length}</span>
				</button>
				{Object.entries(CLASSES)
					.filter(([id]) => classCounts.has(Number(id)))
					.map(([id, c]) => (
						<button
							key={id}
							type="button"
							onClick={() => setClassFilter(classFilter === Number(id) ? null : Number(id))}
							className="chip"
							data-active={classFilter === Number(id)}
						>
							<ClassText classId={Number(id)}>{c.name}</ClassText>
							<span className="num text-muted-foreground">{classCounts.get(Number(id))}</span>
						</button>
					))}
			</div>

			<div className="inset mt-4">
				<Table className="text-sm">
					<TableHeader>
						<TableRow>
							{header("name", "Name")}
							{header("level", "Level", "right")}
							{header("class", "Class")}
							<TableHead>Talents</TableHead>
							<TableHead>Race</TableHead>
							{header("rank", "Rank")}
							<TableHead>Professions</TableHead>
							{header("ilvl", "Item level", "right")}
							{header("seen", "Last seen", "right")}
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((m) => (
							<TableRow key={m._id}>
								<TableCell>
									<Link
										to="/c/$region/$slug"
										params={(p) => ({ region: p.region ?? "us", slug: m.slug })}
										className="hover:underline underline-offset-4"
									>
										<ClassText classId={m.classId} className="font-medium">
											{m.name}
										</ClassText>{" "}
										<span className="text-muted-foreground">{m.surname}</span>
									</Link>
									{m.claimed && (
										<span className="ml-2 text-xs text-muted-foreground" title="Claimed by a signed-in player">
											claimed
										</span>
									)}
								</TableCell>
								<TableCell className="num text-right">{m.level}</TableCell>
								<TableCell>
									<ClassText classId={m.classId}>{className(m.classId)}</ClassText>
								</TableCell>
								<TableCell className="num whitespace-nowrap">
									{m.talentTrees?.map((t, i) => (
										<span key={t.id} className={cn(i > 0 && "text-muted-foreground")}>
											{i > 0 && " · "}
											{t.name} {t.points}
										</span>
									))}
								</TableCell>
								<TableCell className="text-muted-foreground">{raceName(m.raceId)}</TableCell>
								<TableCell className="text-muted-foreground">{rankLabel(m.rank)}</TableCell>
								<TableCell className="num">
									{m.professions?.length ? (
										m.professions
											.filter((p) => !p.secondary)
											.map((p) => `${p.name}${p.skill ? ` ${p.skill}` : ""}`)
											.join(", ")
									) : (
										<span className="text-muted-foreground">{m.profileMissing ? "–" : ""}</span>
									)}
								</TableCell>
								<TableCell className="num text-right">{m.averageItemLevel ?? ""}</TableCell>
								<TableCell className="num text-right text-muted-foreground">{ago(m.lastLoginAt) ?? ""}</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
			{rows.length === 0 && <p className="mt-4 text-muted-foreground">Nobody matches.</p>}
			<p className="mt-4 text-xs text-muted-foreground">
				Talents, professions, gear and last seen fill in once a character is level 10 and has logged out.
				Blizzard's API doesn't say who's online right now.
			</p>
		</section>
	);
}

function GuildFooter({
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
		<div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-bronze-dark pt-4 text-sm">
			<Button
				variant="outline"
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
			{isOwner && (
				<label className="flex items-center gap-2">
					<Switch
						checked={visibility === "members"}
						onCheckedChange={(checked) => setVisibility({ guildId, visibility: checked ? "members" : "public" })}
					/>
					Members only
				</label>
			)}
			{message && <span className="text-muted-foreground">{message}</span>}
		</div>
	);
}
