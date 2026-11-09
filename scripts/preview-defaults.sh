#!/usr/bin/env sh
# Writes the project's Convex preview defaults, which every new preview
# deployment starts with: cloud dev's settings (Battle.net dev client, dev
# gateway) plus a signing key pair of the previews' own. Each preview's origin is
# baked in by scripts/preview-deploy.sh. Re-run after changing a dev
# setting; only new previews pick it up. See docs/deploy.md.
set -eu
. "$(dirname "$0")/deployments.sh"
[ -n "$cloud_dev" ] || { echo "preview-defaults: set cloud_dev in scripts/deployments.sh first" >&2; exit 1; }
export CONVEX_DEPLOYMENT="dev:$cloud_dev"

umask 077
dir="$(mktemp -d)"
trap '/bin/rm -rf "$dir"' EXIT

# Not copied: cloud dev's own keys and URLs, and any SITE_URL.
npx convex env list --include-values --deployment "$cloud_dev" |
	grep -vE '^(SITE_URL|AUTH_PRIVATE_KEY|AUTH_JWKS|VITE_CONVEX_URL|VITE_CONVEX_SITE_URL)=' > "$dir/env"
grep -q '^AUTH_GATEWAY_SECRET=' "$dir/env" || {
	echo "preview-defaults: set AUTH_GATEWAY_SECRET on $cloud_dev first (docs/auth-environments.md)" >&2
	exit 1
}

node -e '
const {generateKeyPairSync, randomUUID} = require("crypto");
const {publicKey, privateKey} = generateKeyPairSync("rsa", {modulusLength: 2048});
const jwk = publicKey.export({format: "jwk"});
const key = Buffer.from(privateKey.export({type: "pkcs8", format: "pem"})).toString("base64");
const jwks = JSON.stringify({keys: [{kty: jwk.kty, n: jwk.n, e: jwk.e, kid: randomUUID(), alg: "RS256", use: "sig"}]});
process.stdout.write(`AUTH_PRIVATE_KEY=${key}\nAUTH_JWKS='"'"'${jwks}'"'"'\n`);
' >> "$dir/env"

npx convex env default set --type preview --force --from-file "$dir/env" > /dev/null
echo "preview-defaults: wrote $(wc -l < "$dir/env" | tr -d ' ') preview defaults"
npx convex env default list --type preview | cut -d= -f1
