#!/usr/bin/env sh
# `pnpm dev`: a local Convex backend (anonymous, data in .convex/) plus the app
# on http://localhost:3000. Set real Battle.net keys with
# `npx convex env set BATTLENET_CLIENT_ID ...` (docs/blizzard-setup.md).
set -eu
cd "$(dirname "$0")/.."

[ -d node_modules ] || pnpm install --frozen-lockfile

export CONVEX_AGENT_MODE=anonymous
site="http://localhost:3000"

npx convex dev &
convex_pid=$!
trap 'kill "$convex_pid" 2>/dev/null' EXIT
trap 'exit 130' INT TERM

# Wait for the backend, then give it its settings. Convex retries the first
# push by itself once the required env vars exist.
i=0
until npx convex env list >/dev/null 2>&1; do
	i=$((i + 1))
	[ "$i" -lt 60 ] || { echo "dev: Convex backend never came up" >&2; exit 1; }
	sleep 1
done
node scripts/dev-env.mjs "$site"

VITE_SITE_URL="$site" pnpm exec vite dev --port 3000
