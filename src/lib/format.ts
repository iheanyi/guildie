const units: [Intl.RelativeTimeFormatUnit, number][] = [
	["year", 365 * 24 * 3600_000],
	["month", 30 * 24 * 3600_000],
	["week", 7 * 24 * 3600_000],
	["day", 24 * 3600_000],
	["hour", 3600_000],
	["minute", 60_000],
];
const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function ago(timestamp: number | undefined, now = Date.now()) {
	if (!timestamp) return undefined;
	const diff = timestamp - now;
	for (const [unit, ms] of units) {
		if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
	}
	return "just now";
}

/** The API gives rank numbers only; 0 is always the guild master. */
export function rankLabel(rank: number) {
	return rank === 0 ? "Guild Master" : `Rank ${rank}`;
}
