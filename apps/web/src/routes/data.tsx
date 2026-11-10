import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/data")({
	head: () => ({ meta: [{ title: "Where the data comes from · Guildie" }] }),
	component: DataNotes,
});

// Keep this page honest: everything here is about WoW: Forever specifically.
// When a gap closes (or a new one shows up), change it here.

const SOURCES = [
	["Blizzard's API, Forever namespaces", "Rosters, character profiles, gear, talents, professions and known recipes, item and recipe data, auction houses. Refreshed hourly."],
	["Your Battle.net account", "When you sign in: your BattleTag and your character list in every region, which ties you to your guild. We don't keep Battle.net's tokens."],
	["Wowhead (Forever)", "Item links and tooltips."],
	["Recipes and reagents", "Every Forever recipe and its reagents, and each member's known recipes, from Blizzard. The addon uses them to suggest who might want an item. Refreshed weekly (recipes) and hourly (members)."],
	["The Guildie addon (optional)", "Players who install it and its desktop helper can show talent changes after a /reload, before Blizzard's data updates. Shown only while it's newer than Blizzard's."],
];

const GAPS = [
	["Who's online", "Blizzard's API doesn't say. \"Last seen\" is the last logout."],
	["New characters", "A character appears on the roster right away, but its profile (gear, talents, professions, last seen) only once it's level 10 and has logged out."],
	["Snapshots, not live", "Profiles reflect the character's last logout, not right now."],
	["Portraits", "Can take a day or more to appear after a character first shows up."],
	["Rank names", "Only rank numbers; 0 is the guild master."],
	["Your guild", "Found from your characters at level 10 or higher. If all of yours are lower, add the guild by name."],
	["Talents", "Only the active talent group. Trees with no points aren't listed."],
	["Guild crests and achievements", "Not provided for Forever yet."],
	["Item data", "Blizzard's item data for Forever is incomplete: a good share of items return nothing."],
	["Recipes", "A few known recipes aren't in Blizzard's recipe lists, so their reagents aren't suggested."],
	["Documentation", "Blizzard hasn't documented the Forever API. Everything here works, but was found by testing, and can change."],
];

function DataNotes() {
	return (
		<div className="max-w-3xl py-10">
			<h1 className="text-4xl">Where the data comes from</h1>
			<p className="mt-3 text-muted-foreground">Everything here is for WoW: Forever.</p>

			<h2 className="mt-10 text-2xl">Sources</h2>
			<dl className="mt-3 border-t text-sm">
				{SOURCES.map(([name, text]) => (
					<div key={name} className="grid gap-x-6 border-b py-2 sm:grid-cols-[14rem_1fr]">
						<dt className="font-medium">{name}</dt>
						<dd className="text-muted-foreground">{text}</dd>
					</div>
				))}
			</dl>

			<h2 className="mt-10 text-2xl">What we can't know (yet)</h2>
			<dl className="mt-3 border-t text-sm">
				{GAPS.map(([name, text]) => (
					<div key={name} className="grid gap-x-6 border-b py-2 sm:grid-cols-[14rem_1fr]">
						<dt className="font-medium">{name}</dt>
						<dd className="text-muted-foreground">{text}</dd>
					</div>
				))}
			</dl>
		</div>
	);
}
