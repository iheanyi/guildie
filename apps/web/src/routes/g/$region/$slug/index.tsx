import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { CLASSES, className, raceName, type Region } from "@convex/shared/wow";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowDown01Icon, ArrowUp01Icon, CheckmarkBadge01Icon, GameController03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { useMemo, useState } from "react";
import { ClassText } from "@/components/class-name";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ago, rankLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/g/$region/$slug/")({
	// The layout ($slug.tsx) loads the guild and draws its header.
	component: GuildPage,
});

type SortKey = "name" | "level" | "class" | "rank" | "ilvl" | "seen";

function GuildPage() {
	const params = Route.useParams();
	const { data } = useSuspenseQuery(
		convexQuery(api.guilds.get, { region: params.region as Region, slug: params.slug }),
	);
	if (!data || data.hidden) return null;
	return <Roster members={data.members} />;
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
					return m.synced?.at ?? 0;
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

	const header = (key: SortKey, label: string, align?: "right", className?: string) => (
		<TableHead className={cn(align === "right" && "text-right", className)} aria-sort={sort.key === key ? (sort.desc ? "descending" : "ascending") : undefined}>
			<button
				type="button"
				className={cn(
					"inline-flex items-center gap-1 hover:text-foreground",
					align === "right" && "flex-row-reverse",
					sort.key === key && "text-foreground",
				)}
				onClick={() =>
					setSort((s) => ({ key, desc: s.key === key ? !s.desc : key === "level" || key === "ilvl" || key === "seen" }))
				}
			>
				{label}
				<HugeiconsIcon
					icon={sort.key === key && sort.desc ? ArrowDown01Icon : ArrowUp01Icon}
					size={12}
					strokeWidth={2}
					className={cn(sort.key !== key && "invisible")}
				/>
			</button>
		</TableHead>
	);

	return (
		<section className="pb-10">
			<div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
				<Input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Search names, talents or professions"
					className="w-64"
				/>
				<div className="flex flex-wrap gap-1">
					<button type="button" className="chip" data-active={classFilter === null} onClick={() => setClassFilter(null)}>
						All <span className="num text-muted-foreground">{members.length}</span>
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
				<label className="ml-auto flex items-center gap-2 text-[0.8125rem] text-muted-foreground select-none">
					<Switch size="sm" checked={maxOnly} onCheckedChange={setMaxOnly} />
					Level 60 only
				</label>
			</div>

			<Table className="table-sticky">
				<TableHeader>
					<TableRow>
						{header("name", "Name")}
						{header("level", "Level", "right")}
						{header("class", "Race and class")}
						<TableHead className="max-lg:hidden">Talents</TableHead>
						{header("rank", "Rank")}
						<TableHead className="max-2xl:hidden">Professions</TableHead>
						{header("ilvl", "Item level", "right")}
						{header("seen", "Last synced", "right", "max-md:hidden")}
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((m) => (
						<TableRow key={m._id}>
							<TableCell>
								<Tooltip disabled={!m.battletag}>
									<TooltipTrigger
										render={
											<Link
												to="/c/$region/$slug"
												params={(p) => ({ region: p.region ?? "us", slug: m.slug })}
												className="hover:underline underline-offset-4"
											/>
										}
									>
										<ClassText classId={m.classId} className="font-medium">
											{m.name}
										</ClassText>{" "}
										<span className="text-muted-foreground">{m.surname}</span>
									</TooltipTrigger>
									{/* Only guild members get BattleTags (guilds.get), and only from players who haven't hidden theirs. */}
									<TooltipContent side="right">{m.battletag}</TooltipContent>
								</Tooltip>
								{m.claimed && (
									<span
										className="ml-1.5 inline-flex translate-y-[2px] text-muted-foreground/70"
										title="Claimed on Guildie"
										aria-label="Claimed on Guildie"
									>
										<HugeiconsIcon icon={CheckmarkBadge01Icon} size={14} strokeWidth={1.75} />
									</span>
								)}
							</TableCell>
							<TableCell className="num text-right">{m.level}</TableCell>
							<TableCell>
								<span className="text-muted-foreground">{raceName(m.raceId)}</span>{" "}
								<ClassText classId={m.classId}>{className(m.classId)}</ClassText>
							</TableCell>
							<TableCell className="num max-lg:hidden">
								{m.talentTrees?.map((t, i) => (
									<span key={t.id} className={cn(i > 0 && "text-muted-foreground")}>
										{i > 0 && " · "}
										{t.name} {t.points}
									</span>
								))}
							</TableCell>
							<TableCell className="text-muted-foreground">{rankLabel(m.rank)}</TableCell>
							<TableCell className="num text-muted-foreground max-2xl:hidden">
								{m.professions?.length
									? m.professions
											.filter((p) => !p.secondary)
											.map((p) => `${p.name}${p.skill ? ` ${p.skill}` : ""}`)
											.join(", ")
									: m.profileMissing
										? "–"
										: ""}
							</TableCell>
							<TableCell className="num text-right">{m.averageItemLevel ?? ""}</TableCell>
							<TableCell className="num text-right text-muted-foreground max-md:hidden">
								<LastSynced synced={m.synced} />
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
			{rows.length === 0 && <p className="py-6 text-center text-muted-foreground">Nobody matches.</p>}
			<p className="mt-4 text-xs text-muted-foreground">
				Talents, professions, gear and last synced fill in once a character is level 10 and has logged out.
				Blizzard's API doesn't say who's online right now.
			</p>
		</section>
	);
}

type Synced = { kind: "app"; at?: number } | { kind: "blizzard"; at: number; checkedAt?: number } | undefined;

const fullTime = (at: number) =>
	new Date(at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * How current a character's data is. A small controller icon when it came
 * from the game itself (the player's Guildie app synced it); otherwise
 * Blizzard's, as of their last logout. Hover says which.
 */
function LastSynced({ synced }: { synced: Synced }) {
	if (!synced?.at) return null;
	return (
		<Tooltip>
			<TooltipTrigger render={<span className="inline-flex items-center justify-end gap-1.5" />}>
				{synced.kind === "app" && (
					<HugeiconsIcon icon={GameController03Icon} size={14} strokeWidth={1.75} className="text-foreground/80" aria-label="Synced in game" />
				)}
				{ago(synced.at)}
			</TooltipTrigger>
			<TooltipContent side="left">
				{synced.kind === "app" ? (
					<>Synced from the game with the Guildie app, {fullTime(synced.at)}</>
				) : (
					<>
						From Blizzard, as of their last logout ({fullTime(synced.at)})
						{synced.checkedAt ? `. Checked ${ago(synced.checkedAt)}.` : ""}
					</>
				)}
			</TooltipContent>
		</Tooltip>
	);
}
