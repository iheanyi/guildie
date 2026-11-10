import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import type { Region } from "@convex/shared/wow";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { ago } from "@/lib/format";

// One query feeds every character tab: the layout route's loader fills the
// cache, and each tab reads the same entry, so switching tabs costs nothing.

export type CharacterData = NonNullable<FunctionReturnType<typeof api.guilds.character>>;
export type Character = CharacterData["character"];
export type TalentLayout = CharacterData["talentLayouts"][number];
export type TalentNode = TalentLayout["nodes"][number];
export type CharacterTree = NonNullable<Character["talentTrees"]>[number];

export const characterQuery = (region: string, slug: string) =>
	convexQuery(api.guilds.character, { region: region as Region, slug });

/** The current character. Null only if it vanished after the page loaded (the loader 404s otherwise). */
export function useCharacter(): CharacterData | null {
	const { region, slug } = useParams({ from: "/c/$region/$slug" });
	return useSuspenseQuery(characterQuery(region, slug)).data;
}

export type DataSource = CharacterData["sources"]["gear"];

/**
 * Where a part of the character came from, for the small note under it: the
 * game (the player's Guildie app uploaded it) or Blizzard's profile.
 */
export function sourceNote(source: DataSource, what = "From") {
	return source.kind === "addon"
		? `${what} the game, ${ago(source.at) ?? "just now"}.`
		: `${what} Blizzard, as of the last logout.`;
}
