// Static WoW data shared by the backend and the app. Imported by both, so
// keep it free of Convex server imports.

export type Flavor = "forever";
export type Region = "us" | "eu" | "kr" | "tw";
export type NamespaceKind = "static" | "dynamic" | "profile";

/**
 * How each flavor talks to the Blizzard API. Forever is realmless: characters
 * are `{name}-{surname}` and guilds are a bare name slug. A realm-based flavor
 * (Classic Era: `profile-classic1x-{region}`) would add realm slugs to both
 * paths — that's the main thing to change to support one.
 */
export const FLAVORS = {
	forever: {
		label: "WoW: Forever",
		namespace: (kind: NamespaceKind, region: Region) => `${kind}-forever-${region}`,
		guildPath: (slug: string) => `/data/wow/guild/${encodeURIComponent(slug)}`,
		characterPath: (slug: string) => `/profile/wow/character/${encodeURIComponent(slug)}`,
		/** Characters only appear in the profile API from this level, after a logout. */
		minProfileLevel: 10,
		maxLevel: 60,
	},
} as const satisfies Record<Flavor, unknown>;

export const REGIONS: Region[] = ["us", "eu", "kr", "tw"];

/** The API's guild slug: lowercase, spaces as hyphens. */
export function guildSlug(name: string) {
	return name.trim().toLowerCase().replace(/\s+/g, "-");
}

// From Blizzard's static-forever playable-class index (checked 2026-11-09).
export const CLASSES: Record<number, { name: string; color: string }> = {
	1: { name: "Warrior", color: "#C69B6D" },
	2: { name: "Paladin", color: "#F48CBA" },
	3: { name: "Hunter", color: "#AAD372" },
	4: { name: "Rogue", color: "#FFF468" },
	5: { name: "Priest", color: "#FFFFFF" },
	7: { name: "Shaman", color: "#0070DD" },
	8: { name: "Mage", color: "#3FC7EB" },
	9: { name: "Warlock", color: "#8788EE" },
	11: { name: "Druid", color: "#FF7C0A" },
};

// From Blizzard's static-forever playable-race index (checked 2026-11-09).
// Forever's Skyborne appear as two races.
export const RACES: Record<number, string> = {
	1: "Human",
	2: "Orc",
	3: "Dwarf",
	4: "Night Elf",
	5: "Undead",
	6: "Tauren",
	7: "Gnome",
	8: "Troll",
	95: "High Order Skyborne",
	96: "Windshaper Skyborne",
};

export const className = (id: number) => CLASSES[id]?.name ?? `Class ${id}`;
export const raceName = (id: number) => RACES[id] ?? `Race ${id}`;

export const QUALITY_ORDER = ["POOR", "COMMON", "UNCOMMON", "RARE", "EPIC", "LEGENDARY", "ARTIFACT"];

/** Equipment slots in paper-doll order. */
export const SLOT_ORDER = [
	"HEAD",
	"NECK",
	"SHOULDER",
	"BACK",
	"CHEST",
	"SHIRT",
	"TABARD",
	"WRIST",
	"HANDS",
	"WAIST",
	"LEGS",
	"FEET",
	"FINGER_1",
	"FINGER_2",
	"TRINKET_1",
	"TRINKET_2",
	"MAIN_HAND",
	"OFF_HAND",
	"RANGED",
];
