#!/usr/bin/env sh
# `pnpm push:cloud-dev`: push this checkout's code to cloud dev
# (scripts/deployments.sh). `convex dev` points .env.local at the deployment
# it pushes to; put this checkout's local settings back afterwards.
set -eu
# Run from apps/web (the Convex project and Worker), wherever this was started.
cd "$(dirname "$0")/.."
. scripts/deployments.sh
[ -n "$cloud_dev" ] || { echo "push-cloud-dev: set cloud_dev in scripts/deployments.sh" >&2; exit 1; }
saved="$(mktemp)"
[ -f .env.local ] && cp .env.local "$saved"
trap '[ -s "$saved" ] && cp "$saved" .env.local; /bin/rm -f "$saved"' EXIT
CONVEX_DEPLOYMENT="dev:$cloud_dev" npx convex dev --once
