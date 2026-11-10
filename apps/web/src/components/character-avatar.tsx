import { UserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";

/**
 * A character's portrait (Blizzard's avatar render), or a plain silhouette for
 * characters Blizzard hasn't published yet (under level 10, or not logged out
 * since joining).
 */
export function CharacterAvatar({ url, size, className }: { url?: string; size: number; className?: string }) {
	const frame = cn("shrink-0 overflow-hidden border border-border bg-muted", className);
	if (url) return <img src={url} alt="" width={size} height={size} className={cn(frame, "object-cover")} style={{ width: size, height: size }} />;
	return (
		<span className={cn(frame, "grid place-items-center text-muted-foreground/60")} style={{ width: size, height: size }} aria-hidden="true">
			<HugeiconsIcon icon={UserIcon} size={Math.round(size * 0.55)} strokeWidth={1.5} />
		</span>
	);
}

/** Why a character has no details: shown on the roster and their page. */
export const UNFETCHED_NOTE =
	"Blizzard hasn't published this character yet. That happens once they're level 10 and have logged out since. Guildie picks them up then.";
