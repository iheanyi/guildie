// Uploads the release build.ts made to CurseForge and Wago Addons, each only
// when its secrets are set (otherwise it says so and skips it). The addon
// managers (CurseForge app, WowUp, Wago app) pick new files up from there.
//
//   CF_API_KEY + CF_PROJECT_ID           CurseForge (https://authors.curseforge.com/account/api-tokens)
//   WAGO_API_TOKEN + WAGO_PROJECT_ID     Wago Addons (https://addons.wago.io/account/apikeys)
//
//   node apps/addon/scripts/upload.ts [--release apps/addon/dist/release.json]
//
// Same endpoints and game-version lookup as BigWigsMods/packager. Writes
// uploaded=true|false to $GITHUB_OUTPUT.

import { appendFileSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
const { values: args } = parseArgs({
	options: { release: { type: "string", default: resolve(here, "../dist/release.json") } },
});

const release = JSON.parse(readFileSync(args.release, "utf8")) as { version: string; zip: string; guilds: number };
const zipPath = resolve(release.zip);
const zip = new Blob([readFileSync(zipPath)], { type: "application/zip" });
const toc = readFileSync(join(dirname(args.release), "Guildie", "Guildie.toc"), "utf8");
const interfaceVersion = Number(toc.match(/^## Interface:\s*(\d+)/m)?.[1]);
// 16001 -> "1.60.1" (WoW: Forever)
const gameVersion = `${Math.floor(interfaceVersion / 10000)}.${Math.floor(interfaceVersion / 100) % 100}.${interfaceVersion % 100}`;
const changelog = `Guild data for ${release.guilds} public guilds, as of ${new Date().toUTCString()}.`;

/** The exact version, else the newest one below it, else the newest: what packager does too. */
function pickVersion(available: string[], wanted: string) {
	const cmp = (a: string, b: string) => {
		const pa = a.split(".").map(Number);
		const pb = b.split(".").map(Number);
		for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
		return 0;
	};
	if (available.includes(wanted)) return wanted;
	const sorted = [...available].sort(cmp);
	const pick = sorted.filter((v) => cmp(v, wanted) < 0).pop() ?? sorted.pop();
	if (pick) console.warn(`Game version ${wanted} isn't listed; using ${pick}`);
	return pick;
}

async function curseforge(token: string, project: string) {
	const site = "https://wow.curseforge.com";
	// Version type 88568 is WoW: Forever on CurseForge.
	const res = await fetch(`${site}/api/game/wow/versions`, { headers: { "x-api-token": token } });
	if (!res.ok) throw new Error(`CurseForge game versions: ${res.status} ${await res.text()}`);
	const versions = ((await res.json()) as { id: number; name: string; gameVersionTypeID: number }[]).filter(
		(v) => v.gameVersionTypeID === 88568,
	);
	const name = pickVersion(
		versions.map((v) => v.name),
		gameVersion,
	);
	const id = versions.find((v) => v.name === name)?.id;
	if (!id) throw new Error("CurseForge lists no WoW: Forever game versions");
	const form = new FormData();
	form.set(
		"metadata",
		JSON.stringify({ displayName: release.version, gameVersions: [id], releaseType: "release", changelog, changelogType: "text" }),
	);
	form.set("file", zip, basename(zipPath));
	const upload = await fetch(`${site}/api/projects/${project}/upload-file`, { method: "POST", headers: { "x-api-token": token }, body: form });
	if (!upload.ok) throw new Error(`CurseForge upload: ${upload.status} ${await upload.text()}`);
	console.log(`CurseForge: uploaded ${release.version} (game version ${name})`);
}

async function wago(token: string, project: string) {
	const game = (await (await fetch("https://addons.wago.io/api/data/game")).json()) as { patches: Record<string, string[]> };
	const patch = pickVersion(game.patches.forever ?? [], gameVersion);
	if (!patch) throw new Error("Wago lists no WoW: Forever patches");
	const form = new FormData();
	form.set(
		"metadata",
		JSON.stringify({ label: release.version, stability: "stable", changelog, supported_forever_patches: [patch] }),
	);
	form.set("file", zip, basename(zipPath));
	const upload = await fetch(`https://addons.wago.io/api/projects/${project}/version`, {
		method: "POST",
		headers: { authorization: `Bearer ${token}`, accept: "application/json" },
		body: form,
	});
	if (!upload.ok) throw new Error(`Wago upload: ${upload.status} ${await upload.text()}`);
	console.log(`Wago: uploaded ${release.version} (patch ${patch})`);
}

const env = process.env;
let uploaded = false;
let failed = false;
for (const [name, token, project, run] of [
	["CurseForge", env.CF_API_KEY, env.CF_PROJECT_ID, curseforge],
	["Wago", env.WAGO_API_TOKEN, env.WAGO_PROJECT_ID, wago],
] as const) {
	if (!token || !project) {
		console.log(`${name}: skipped (secrets not set)`);
		continue;
	}
	try {
		await run(token, project);
		uploaded = true;
	} catch (e) {
		console.error(`${name}: ${(e as Error).message}`);
		failed = true;
	}
}
if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `uploaded=${uploaded}\n`);
if (failed) process.exit(1);
