import type { Region } from "./shared/wow";

// The pure part of claiming: read a Battle.net account's characters from
// every regional API host with one user token. Kept free of Convex and
// value imports so `node --test` can run it (claimRegions.test.ts).

export type OwnedCharacter = {
	slug: string;
	blizzardId?: number;
	name: string;
	level?: number;
	classId?: number;
};

/**
 * Per region: `ok` (the list, which replaces what we had), `none` (404: no
 * characters there, also a definite answer), or `error` (couldn't tell;
 * keep what we had).
 */
export type RegionResult =
	| { region: Region; status: "ok"; characters: OwnedCharacter[] }
	| { region: Region; status: "none" }
	| { region: Region; status: "error"; error: string };

type AccountProfile = {
	wow_accounts?: {
		characters?: {
			id?: number;
			name: string;
			surname?: string;
			level?: number;
			playable_class?: { id: number };
			character?: { href?: string };
		}[];
	}[];
};

export function slugOf(c: { name: string; surname?: string; character?: { href?: string } }) {
	if (c.surname) return `${c.name}-${c.surname}`.toLowerCase();
	const fromHref = c.character?.href?.match(/\/character\/([^/?]+)(?:\?|$)/)?.[1];
	return decodeURIComponent(fromHref ?? c.name).toLowerCase();
}

export function charactersOf(profile: AccountProfile): OwnedCharacter[] {
	return (profile.wow_accounts ?? [])
		.flatMap((a) => a.characters ?? [])
		.map((c) => ({
			slug: slugOf(c),
			blizzardId: c.id,
			name: c.name,
			level: c.level,
			classId: c.playable_class?.id,
		}));
}

/** GET /profile/user/wow from each region's host, in parallel. Never throws. */
export async function fetchAccountCharacters(args: {
	token: string;
	regions: readonly Region[];
	namespace: (region: Region) => string;
	fetch?: typeof fetch;
}): Promise<RegionResult[]> {
	const get = args.fetch ?? fetch;
	return await Promise.all(
		args.regions.map(async (region): Promise<RegionResult> => {
			try {
				const url = new URL(`https://${region}.api.blizzard.com/profile/user/wow`);
				url.searchParams.set("namespace", args.namespace(region));
				url.searchParams.set("locale", "en_US");
				const res = await get(url, { headers: { Authorization: `Bearer ${args.token}` } });
				if (res.status === 404) return { region, status: "none" };
				if (!res.ok) return { region, status: "error", error: `${res.status} ${(await res.text()).slice(0, 200)}` };
				return { region, status: "ok", characters: charactersOf((await res.json()) as AccountProfile) };
			} catch (error) {
				return { region, status: "error", error: String(error) };
			}
		}),
	);
}

/** The guild a character profile names, as our key. Forever guild slugs are the lowercased name. */
export function guildOfProfile(profile: { guild?: { name?: string; slug?: string } } | undefined) {
	const name = profile?.guild?.name?.trim();
	if (!name) return null;
	const slug = (profile?.guild?.slug ?? name).trim().toLowerCase().replace(/\s+/g, "-");
	return { name, slug };
}
