// Gives a fresh local Convex backend the settings it needs to start:
// auth signing keys, dev guest sign-in, SITE_URL, and placeholder Battle.net
// credentials (replace them: docs/blizzard-setup.md). Idempotent.
//   usage: node scripts/dev-env.mjs <site url>
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, randomUUID } from "node:crypto";

const siteUrl = process.argv[2] ?? "http://localhost:3000";
const convex = (...args) => execFileSync("npx", ["convex", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const get = (name) => {
	try {
		return convex("env", "get", name);
	} catch {
		return "";
	}
};
const set = (name, value) => {
	convex("env", "set", name, "--", value);
	console.log(`dev-env: set ${name}`);
};

if (!get("AUTH_PRIVATE_KEY") || !get("AUTH_JWKS")) {
	const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
	const pem = privateKey.export({ type: "pkcs8", format: "pem" });
	const jwk = publicKey.export({ format: "jwk" });
	set("AUTH_PRIVATE_KEY", Buffer.from(pem).toString("base64"));
	set("AUTH_JWKS", JSON.stringify({ keys: [{ ...jwk, kid: randomUUID(), alg: "RS256", use: "sig" }] }));
}
for (const name of ["BATTLENET_CLIENT_ID", "BATTLENET_CLIENT_SECRET"]) {
	if (!get(name)) set(name, "unset");
}
if (get("AUTH_DEV_GUEST") !== "true") set("AUTH_DEV_GUEST", "true");
if (get("SITE_URL") !== siteUrl) set("SITE_URL", siteUrl);
