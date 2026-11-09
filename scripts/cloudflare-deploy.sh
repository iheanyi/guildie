#!/usr/bin/env sh
# Workers Builds deploy command for `main` (the "Deploy default branch"
# trigger): prod Convex, then the Worker on guildie.club. Every other branch
# runs scripts/preview-deploy.sh. See docs/deploy.md.
set -eu

branch="${WORKERS_CI_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
# A plain deploy from any other branch would replace production.
[ "$branch" = main ] || { echo "cloudflare-deploy: refusing to deploy production from '$branch'" >&2; exit 1; }

: "${CONVEX_DEPLOY_KEY:?CONVEX_DEPLOY_KEY (the prod deploy key) is not set}"
case "$CONVEX_DEPLOY_KEY" in
preview:*) echo "cloudflare-deploy: CONVEX_DEPLOY_KEY is a preview key; refusing to deploy production" >&2; exit 1 ;;
esac

site=https://guildie.club

# Bake the app's origin into the Convex functions (convex/buildSite.ts), so
# the deployment needs no SITE_URL setting. Restored afterwards for hand runs.
trap 'git checkout -- convex/buildSite.ts 2>/dev/null || true' EXIT
printf 'export const BUILD_SITE_URL: string = "%s";\n' "$site" > convex/buildSite.ts

# --cmd also gets VITE_CONVEX_SITE_URL.
VITE_SITE_URL="$site" npx convex deploy --cmd "pnpm run build" --cmd-url-env-var-name VITE_CONVEX_URL
# The Cloudflare Vite plugin writes the built Worker's config here.
npx wrangler deploy --config dist/server/wrangler.json
