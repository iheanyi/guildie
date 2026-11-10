import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { className, raceName, type Region, SLOT_ORDER } from "@convex/shared/wow";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ClassText } from "@/components/class-name";
import { ago, rankLabel } from "@/lib/format";

export const Route = createFileRoute("/c/$region/$slug/")({
	loader: async ({ context, params }) => {
		const data = await context.queryClient.ensureQueryData(
			convexQuery(api.guilds.character, { region: params.region as Region, slug: params.slug }),
		);
		if (!data) throw notFound();
		return { name: `${data.character.name} ${data.character.surname ?? ""}`.trim() };
	},
	head: ({ loaderData }) => ({ meta: [{ title: `${loaderData?.name ?? "Character"} · Guildie` }] }),
	component: CharacterPage,
});

const slotLabel = (slot: string) =>
	slot
		.toLowerCase()
		.replace(/_(\d)$/, " $1")
		.replace(/_/g, " ")
		.replace(/^\w/, (c) => c.toUpperCase());

function CharacterPage() {
	const params = Route.useParams();
	const { data } = useSuspenseQuery(
		convexQuery(api.guilds.character, { region: params.region as Region, slug: params.slug }),
	);
	if (!data) return null;
	const { character: c, guild, talentSource } = data;
	const equipment = [...(c.equipment ?? [])].sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
	return (
		<div className="py-10">
			<div className="flex items-center gap-4">
				{c.avatarUrl && <img src={c.avatarUrl} alt="" className="size-16 rounded-[3px] border-2 border-bronze shadow-[0_0_0_1px_#000,inset_0_0_0_1px_#000]" />}
				<div>
					<h1 className="text-3xl sm:text-4xl">
						<ClassText classId={c.classId}>{c.name}</ClassText>{" "}
						<span className="text-muted-foreground">{c.surname}</span>
					</h1>
					<p className="num mt-1 text-muted-foreground">
						Level {c.level} {raceName(c.raceId)} {className(c.classId)} ·{" "}
						<Link
							to="/g/$region/$slug"
							params={{ region: guild.region, slug: guild.slug }}
							className="underline underline-offset-4"
						>
							{guild.name}
						</Link>
						, {rankLabel(c.rank)}
						{c.lastLoginAt && ` · last seen ${ago(c.lastLoginAt)}`}
					</p>
				</div>
			</div>

			{c.profileMissing ? (
				<p className="mt-8 max-w-xl text-muted-foreground">
					Blizzard hasn't published this character's profile yet. That happens once they're level 10
					and log out.
				</p>
			) : (
				<div className="mt-8 grid gap-8 md:grid-cols-[2fr_1fr]">
					<section>
						<h2 className="section-head text-2xl">
							Equipment
							{c.averageItemLevel !== undefined && (
								<span className="num font-sans text-base text-muted-foreground [text-shadow:none]">item level {c.averageItemLevel}</span>
							)}
						</h2>
						{equipment.length === 0 ? (
							<p className="mt-2 text-muted-foreground">Nothing yet.</p>
						) : (
							<dl className="inset mt-3 grid grid-cols-[6.5rem_1fr_auto] gap-x-4 text-sm sm:grid-cols-[8rem_1fr_auto]">
								{equipment.map((item) => (
									<div
										key={item.slot}
										className={`item-row col-span-3 grid grid-cols-subgrid border-b border-white/5 px-2.5 py-1.5 last:border-0 hover:bg-[rgb(255_209_0/0.06)]${item.quality ? ` q-${item.quality}` : ""}`}
									>
										<dt className="text-muted-foreground">{slotLabel(item.slot)}</dt>
										<dd>
											<a
												href={`https://www.wowhead.com/forever/item=${item.itemId}`}
												target="_blank"
												rel="noreferrer"
												className="hover:underline underline-offset-4"
											>
												<ClassText quality={item.quality}>{item.name}</ClassText>
											</a>
										</dd>
										<dd className="num text-right text-muted-foreground">{item.itemLevel}</dd>
									</div>
								))}
							</dl>
						)}
					</section>
					<section>
						<h2 className="section-head text-2xl">
							Talents
							{c.talentTrees?.length ? (
								<span className="num font-sans text-base text-muted-foreground [text-shadow:none]">
									{c.talentTrees.map((t) => t.points).join(" / ")}
								</span>
							) : null}
						</h2>
						<p className="mt-1.5 text-xs text-muted-foreground">
							{talentSource.kind === "addon"
								? `From the Guildie addon, ${ago(talentSource.at) ?? "just now"}.`
								: "From Blizzard, as of the last logout."}
						</p>
						{c.talentTrees?.length ? (
							c.talentTrees.map((tree) => (
								<div key={tree.id} className="inset mt-3">
									<div className="flex justify-between border-b border-bronze-dark bg-[var(--panel-raised)] px-2.5 py-1 font-heading text-gold">
										<span>{tree.name}</span>
										<span className="num">{tree.points}</span>
									</div>
									<ul className="text-sm">
										{tree.talents.map((t) => (
											<li key={t.id ?? t.name} className="flex justify-between border-b border-white/5 px-2.5 py-1 last:border-0">
												<span>{t.name}</span>
												<span className="num text-muted-foreground">{t.rank}</span>
											</li>
										))}
									</ul>
								</div>
							))
						) : (
							<p className="mt-2 text-muted-foreground">No points spent yet.</p>
						)}

						<h2 className="section-head mt-8 text-2xl">Professions</h2>
						{c.professions?.length ? (
							<ul className="inset mt-3 text-sm">
								{c.professions.map((p) => (
									<li key={p.id} className="flex justify-between border-b border-white/5 px-2.5 py-1.5 last:border-0">
										<span>{p.name}</span>
										<span className="num text-muted-foreground">
											{p.skill ?? "?"}
											{p.maxSkill ? ` / ${p.maxSkill}` : ""}
										</span>
									</li>
								))}
							</ul>
						) : (
							<p className="mt-2 text-muted-foreground">None reported.</p>
						)}
					</section>
				</div>
			)}
		</div>
	);
}
