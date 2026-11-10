import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import type { Region } from "@convex/shared/wow";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";

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
