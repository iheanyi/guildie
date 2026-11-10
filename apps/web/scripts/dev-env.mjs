// Gives a fresh local Convex backend the settings it needs to start:
// auth signing keys, SITE_URL, and placeholder Battle.net
// credentials (`pnpm blizzard-keys` sets real ones: docs/local-dev.md). Idempotent.
//   usage: node scripts/dev-env.mjs <site url>
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const siteUrl = process.argv[2] ?? "https://guildie.localhost:1355";
const convex = (...args) => execFileSync("npx", ["convex", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
// One read and one write: each change to the settings makes Convex retry its push.
const current = new Map(
	convex("env", "list", "--include-values")
		.split("\n")
		.map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
		.filter(Boolean)
		.map(([, name, value]) => [name, value]),
);
const changes = new Map();

if (!current.get("AUTH_PRIVATE_KEY") || !current.get("AUTH_JWKS")) {
	const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
	const pem = privateKey.export({ type: "pkcs8", format: "pem" });
	const jwk = publicKey.export({ format: "jwk" });
	changes.set("AUTH_PRIVATE_KEY", Buffer.from(pem).toString("base64"));
	changes.set("AUTH_JWKS", JSON.stringify({ keys: [{ ...jwk, kid: randomUUID(), alg: "RS256", use: "sig" }] }));
}
for (const name of ["AUTH_BATTLENET_CLIENT_ID", "AUTH_BATTLENET_CLIENT_SECRET"]) {
	if (!current.get(name)) changes.set(name, "unset");
}
if (current.get("SITE_URL") !== siteUrl) changes.set("SITE_URL", siteUrl);

if (changes.size) {
	const dir = mkdtempSync(join(tmpdir(), "guildie-env-"));
	try {
		const file = join(dir, "env");
		writeFileSync(file, [...changes].map(([name, value]) => `${name}='${value}'\n`).join(""), { mode: 0o600 });
		convex("env", "set", "--force", "--from-file", file);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
	console.log(`dev-env: set ${[...changes.keys()].join(", ")}`);
}
