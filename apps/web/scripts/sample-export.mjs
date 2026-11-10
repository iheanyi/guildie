// Writes the sample guild (fixtures/sample) from one guild on this checkout's
// local backend: its roster with made-up names, the items and recipes it
// references, and every talent layout. What contributors' local backends
// start with (scripts/sample-seed.mjs, docs/local-dev.md).
//
// Kept: what Blizzard publishes about the characters (class, race, level,
// rank, gear, talents, professions, renders). Dropped: users, claims, tokens,
// addon uploads, Blizzard character ids, the guild's real name.
//   usage (in a checkout with `pnpm dev` running):
//   node apps/web/scripts/sample-export.mjs [region/slug]   (default eu/unbound)
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// prettier-ignore
const MALE = ["Aldric", "Corwin", "Garrick", "Ivo", "Jorun", "Kael", "Nils", "Pell", "Rowan", "Ulric", "Bram", "Cedric", "Dorran", "Edmar", "Faolan", "Gideon", "Halvard", "Ingram", "Jasper", "Kestrel", "Leoric", "Magnar", "Osric", "Perrin", "Roderic", "Soren", "Torvald", "Varric", "Wystan", "Alaric", "Benedikt", "Caspian", "Dunstan", "Evander", "Fenwick", "Gorm", "Hadrian", "Ivar", "Joren", "Lucan"];
// prettier-ignore
const FEMALE = ["Brenna", "Dagny", "Fenna", "Hesper", "Liesel", "Maren", "Orla", "Sable", "Tamsin", "Vesna", "Wren", "Yarrow", "Astrid", "Briallen", "Calla", "Delphine", "Elowen", "Freya", "Gwendolyn", "Isolde", "Junia", "Katla", "Linnea", "Morwenna", "Nerys", "Ondine", "Petra", "Rhosyn", "Sigrun", "Thessaly", "Ysolde", "Aveline", "Brisa", "Cerys", "Eira", "Hollis", "Ilse", "Lark", "Mireille", "Saoirse"];
// prettier-ignore
const SURNAMES = ["Ashdown", "Brightwater", "Coldbrook", "Duskmantle", "Emberfall", "Fairwind", "Greyhollow", "Hearthstone", "Ironvale", "Larkspur", "Moonbrook", "Oakheart", "Stormcrest", "Thornfield", "Wolfsbane", "Ravenmoor", "Silverleaf", "Blackwood", "Frostmere", "Goldthorn"];

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(app, "fixtures/sample");
const [region, slug] = (process.argv[2] ?? "eu/unbound").split("/");

const tmp = mkdtempSync(join(tmpdir(), "guildie-sample-"));
try {
	const env = { ...process.env, CONVEX_AGENT_MODE: "anonymous" };
	execFileSync("npx", ["convex", "export", "--path", join(tmp, "snapshot.zip")], { cwd: app, env, stdio: ["ignore", "ignore", "inherit"] });
	execFileSync("unzip", ["-q", join(tmp, "snapshot.zip"), "-x", "_components/*", "-d", join(tmp, "data")]);
	const read = (table) => {
		try {
			return readFileSync(join(tmp, "data", table, "documents.jsonl"), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
		} catch {
			return [];
		}
	};

	const guild = read("guilds").find((g) => g.region === region && g.slug === slug);
	if (!guild) throw new Error(`No guild ${region}/${slug} on this checkout's backend`);
	const characters = read("characters")
		.filter((c) => c.guildId === guild._id && c.inRoster)
		.sort((a, b) => a.slug.localeCompare(b.slug));

	// Made-up names, the same for the same roster: shuffled with a fixed seed.
	let seed = 20261110;
	const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
	const shuffle = (list) => {
		const copy = [...list];
		for (let i = copy.length - 1; i > 0; i--) {
			const j = Math.floor(rand() * (i + 1));
			[copy[i], copy[j]] = [copy[j], copy[i]];
		}
		return copy;
	};
	const names = {
		MALE: shuffle(MALE),
		FEMALE: shuffle(FEMALE),
	};
	const surnames = shuffle(SURNAMES);
	const used = new Set();
	const fakeName = (gender, i) => {
		const pool = names[gender] ?? (i % 2 ? names.FEMALE : names.MALE);
		const name = pool.find((n) => !used.has(n));
		if (!name) throw new Error("Out of sample names; add some to scripts/sample-export.mjs");
		used.add(name);
		return { name, surname: surnames[i % surnames.length] };
	};
	// Last logins a few hours off, so the sample doesn't record when real people played.
	const jitter = (t) => (t === undefined ? undefined : Math.round(t + (rand() - 0.5) * 6 * 3600_000));

	const sampleCharacters = characters.map((c, i) => {
		const { name, surname } = fakeName(c.gender, i);
		const { blizzardId, ...rest } = c;
		return {
			...rest,
			name,
			surname,
			slug: `${name}-${surname}`.toLowerCase(),
			lastLoginAt: jitter(c.lastLoginAt),
			talentsChangedAt: jitter(c.talentsChangedAt),
		};
	});

	const known = new Set();
	const worn = new Set();
	for (const c of characters) {
		for (const p of c.professions ?? []) for (const id of p.knownRecipes ?? []) known.add(id);
		for (const e of c.equipment ?? []) worn.add(e.itemId);
	}
	const recipes = read("recipes").filter((r) => known.has(r.recipeId));
	const itemIds = new Set(worn);
	for (const r of recipes) {
		if (r.craftedItemId) itemIds.add(r.craftedItemId);
		for (const x of r.reagents) itemIds.add(x.itemId);
	}
	const items = read("items").filter((item) => itemIds.has(item.itemId));

	const { ownerId, lastSyncError, syncRequestedAt, ...guildRest } = guild;
	const tables = {
		guilds: [{ ...guildRest, name: "Sample Guild", slug: "sample-guild", memberCount: sampleCharacters.length }],
		characters: sampleCharacters,
		items: items.sort((a, b) => a.itemId - b.itemId),
		recipes: recipes.sort((a, b) => a.recipeId - b.recipeId),
		talentLayouts: read("talentLayouts").sort((a, b) => a.specId - b.specId),
		talentTreeInfo: read("talentTreeInfo").sort((a, b) => a.classToken.localeCompare(b.classToken) || a.treeIndex - b.treeIndex),
	};

	// Table numbers: the ids above encode them, so the import recreates each
	// app table (schema.ts) with its number here.
	const schema = readFileSync(join(app, "convex/schema.ts"), "utf8");
	const appTables = new Set([...schema.matchAll(/^\t(\w+): defineTable\(/gm)].map((m) => m[1]));
	const tableNumbers = read("_tables").filter((t) => appTables.has(t.name)).sort((a, b) => a.id - b.id);

	rmSync(out, { recursive: true, force: true });
	mkdirSync(out, { recursive: true });
	const jsonl = (rows) => rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
	writeFileSync(join(out, "_tables.jsonl"), jsonl(tableNumbers));
	for (const [table, rows] of Object.entries(tables)) writeFileSync(join(out, `${table}.jsonl`), jsonl(rows));
	// Times in the data are moved forward by (seed time - exportedAt) when seeding.
	writeFileSync(join(out, "meta.json"), JSON.stringify({ exportedAt: Date.now() }, null, "\t") + "\n");
	for (const file of readdirSync(out).sort()) {
		const size = readFileSync(join(out, file)).length;
		console.log(`sample-export: ${file.padEnd(20)} ${String(Math.round(size / 1024)).padStart(5)} KB`);
	}
} finally {
	rmSync(tmp, { recursive: true, force: true });
}
