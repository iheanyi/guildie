#!/usr/bin/env sh
# `pnpm blizzard-keys`: puts your own Blizzard API client (free at
# https://develop.battle.net, API Access → Create Client) on this checkout's
# local backend, so roster, profile and recipe syncs work for real. Run it
# with `pnpm dev` running. The values go to the backend only, never a file.
# See docs/local-dev.md.
set -eu
cd "$(dirname "$0")/.."
export CONVEX_AGENT_MODE=anonymous

printf "Blizzard client ID: "
read -r id
printf "Blizzard client secret (hidden): "
stty -echo 2>/dev/null || true
read -r secret
stty echo 2>/dev/null || true
echo
[ -n "$id" ] && [ -n "$secret" ] || { echo "blizzard-keys: both are needed" >&2; exit 1; }

printf '%s' "$id" | npx convex env set AUTH_BATTLENET_CLIENT_ID > /dev/null
printf '%s' "$secret" | npx convex env set AUTH_BATTLENET_CLIENT_SECRET > /dev/null
echo "blizzard-keys: set. Check them with:"
echo "  (cd apps/web && CONVEX_AGENT_MODE=anonymous npx convex run dev:probe '{\"guild\": \"Your Guild\", \"region\": \"us\"}')"
