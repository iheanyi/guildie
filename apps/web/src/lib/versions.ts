/** "0.10.0" vs "0.9.2", part by part (missing parts are 0): -1, 0 or 1. */
export function compareVersions(a: string, b: string) {
	const parts = (v: string) =>
		v
			.replace(/^v/i, "")
			.split(/[.-]/)
			.map((p) => Number.parseInt(p, 10) || 0);
	const pa = parts(a);
	const pb = parts(b);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (diff) return Math.sign(diff);
	}
	return 0;
}
