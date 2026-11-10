import { createFileRoute } from "@tanstack/react-router";
import { sourceNote, useCharacter } from "@/components/character-data";
import { PaperDoll } from "@/components/paper-doll";

// Gear: the paper doll. The layout route loads the character.
export const Route = createFileRoute("/c/$region/$slug/")({
	component: GearPage,
});

function GearPage() {
	const data = useCharacter();
	if (!data) return null;
	const c = data.character;
	const fromGame = data.sources.gear.kind === "addon";
	if (c.profileMissing && !fromGame) {
		return (
			<p className="max-w-xl text-sm text-muted-foreground">
				Blizzard hasn't published this character's profile yet. That happens once they're level 10 and log out.
			</p>
		);
	}
	return (
		<>
			<PaperDoll character={c} />
			<p className="mt-3 text-xs text-muted-foreground">{sourceNote(data.sources.gear)}</p>
		</>
	);
}
