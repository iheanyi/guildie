// Builds an addon release: downloads every public guild's tooltip data from
// the site, writes it into GuildieBundle.lua, stamps the version and zips it.
//
//   node apps/addon/scripts/build.ts [--url https://guildie.club] [--out apps/addon/dist] [--version 0.4.0-...] [--allow-empty]
//
// A bundle without guilds is refused unless --allow-empty: a site outage
// shouldn't ship a release that empties everyone's bundled data.
//
// Output in --out: Guildie/ (the release folder), Guildie-<version>.zip, and
// release.json ({ version, zip, hash, guilds }). `hash` covers the addon's
// code and the data without timestamps, so the release workflow can skip a
// day when nothing changed. Under GitHub Actions the same values go to
// $GITHUB_OUTPUT. Runs on Node 22.18+ (TypeScript type stripping).

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { bundleFile } from "../../../packages/sync/src/luaData.ts";

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, "../Guildie");

const { values: args } = parseArgs({
	options: {
		url: { type: "string", default: "https://guildie.club" },
		out: { type: "string", default: resolve(here, "../dist") },
		version: { type: "string" },
		"allow-empty": { type: "boolean", default: false },
	},
});

type Entry = { name: string; region: string; slug: string; generatedAt: number; reagents: Record<string, unknown> };
type Bundle = { version: 2; generatedAt: number; guilds: Record<string, Entry> };

async function download(base: string): Promise<Bundle> {
	const url = new URL("/api/addon/bundle", base);
	// Local dev (Portless) serves *.localhost with a self-signed certificate.
	if (url.hostname.endsWith(".localhost") || url.hostname === "localhost") process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
	const res = await fetch(url, { headers: { Accept: "application/json" } });
	if (!res.ok) throw new Error(`${url} answered ${res.status}`);
	const data = (await res.json()) as Bundle;
	if (data?.version !== 2 || typeof data.guilds !== "object" || data.guilds === null) throw new Error(`${url} didn't return a v2 bundle`);
	for (const [key, g] of Object.entries(data.guilds)) {
		const ok =
			typeof g?.name === "string" &&
			typeof g.region === "string" &&
			typeof g.slug === "string" &&
			key === `${g.region}/${g.slug}` &&
			typeof g.generatedAt === "number" &&
			typeof g.reagents === "object";
		if (!ok) throw new Error(`Malformed guild ${key} in the bundle`);
	}
	return data;
}

/** JSON with sorted keys and no generatedAt anywhere: the same data hashes the same on any day. */
function canonical(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonical);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.keys(value)
				.filter((k) => k !== "generatedAt")
				.sort()
				.map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
		);
	}
	return value;
}

function stamp(date: Date) {
	const p = (n: number) => String(n).padStart(2, "0");
	return `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}.${p(date.getUTCHours())}${p(date.getUTCMinutes())}`;
}

const tocPath = join(source, "Guildie.toc");
const toc = readFileSync(tocPath, "utf8");
const baseVersion = toc.match(/^## Version:\s*(\S+)/m)?.[1];
if (!baseVersion) throw new Error("No ## Version in Guildie.toc");
const version = args.version ?? `${baseVersion}-${stamp(new Date())}`;

const data = await download(args.url);
if (!Object.keys(data.guilds).length && !args["allow-empty"]) throw new Error("The bundle has no guilds (--allow-empty to build anyway)");
const out = resolve(args.out);
const folder = join(out, "Guildie");
const zipName = `Guildie-${version}.zip`;
rmSync(folder, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
// Only this build's zip in the output, so "the zip" is never ambiguous.
for (const file of readdirSync(out)) if (/^Guildie-.*\.zip$/.test(file)) rmSync(join(out, file));
cpSync(source, folder, { recursive: true });
// Lua strings come out as UTF-8 bytes, one char each: latin1 writes each byte as-is.
writeFileSync(join(folder, "GuildieBundle.lua"), Buffer.from(bundleFile(data), "latin1"));
writeFileSync(join(folder, "Guildie.toc"), toc.replace(/^## Version:.*$/m, `## Version: ${version}`));
execFileSync("zip", ["-rqX", zipName, "Guildie"], { cwd: out });

// The hash: each source file (but the empty bundle) and the data.
const hash = createHash("sha256");
for (const file of readdirSync(source, { recursive: true, encoding: "utf8" }).sort()) {
	const path = join(source, file);
	if (file === "GuildieBundle.lua" || !existsSync(path) || !path.match(/\.(lua|toc|tga)$/)) continue;
	hash.update(`${file}\n`).update(readFileSync(path));
}
hash.update(JSON.stringify(canonical(data.guilds)));
const release = {
	version,
	zip: relative(process.cwd(), join(out, zipName)),
	hash: hash.digest("hex").slice(0, 32),
	guilds: Object.keys(data.guilds).length,
};
writeFileSync(join(out, "release.json"), `${JSON.stringify(release, null, "\t")}\n`);
if (process.env.GITHUB_OUTPUT) {
	appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(release).map(([k, v]) => `${k}=${v}\n`).join(""));
}
console.log(`Guildie ${version}: ${release.guilds} public guilds, ${release.zip} (data hash ${release.hash})`);
