#!/usr/bin/env sh
# Workers Builds deploy command for every branch except `main` (the "Deploy
# non-production branches" trigger), and `pnpm release:preview` by hand. See
# docs/deploy.md.
#
# Deploys a Convex preview named after the branch, builds the app against it,
# and uploads it as a Worker Preview at https://<name>.preview.guildie.club.
# A new Convex preview starts with the project's preview defaults
# (scripts/preview-defaults.sh); its origin is baked in below. Previews start
# with no guilds; add one in the app and it syncs from Blizzard.
set -eu
# Run from apps/web (the Convex project and Worker), wherever this was started.
cd "$(dirname "$0")/.."

name="$(sh scripts/preview-name.sh)"
[ "$name" != main ] || { echo "preview-deploy: main deploys production, not a preview" >&2; exit 1; }
site="https://$name.preview.guildie.club"

: "${CONVEX_DEPLOY_KEY:?CONVEX_DEPLOY_KEY (the preview deploy key) is not set}"
# With any other key, `convex deploy` ignores --preview-name and deploys to
# that key's deployment, which would put this branch on prod.
case "$CONVEX_DEPLOY_KEY" in
preview:*) ;;
*) echo "preview-deploy: CONVEX_DEPLOY_KEY is not a preview deploy key; refusing to deploy" >&2; exit 1 ;;
esac

# Bake the app's origin into the Convex functions (convex/buildSite.ts), so
# the preview needs no SITE_URL setting. Restored afterwards for hand runs.
trap 'git checkout -- convex/buildSite.ts 2>/dev/null || true' EXIT
printf 'export const BUILD_SITE_URL: string = "%s";\n' "$site" > convex/buildSite.ts

# --cmd also gets VITE_CONVEX_SITE_URL.
# A new preview's database is empty: fill the recipe catalog (reagent tooltips
# need it) on its first deploy. Guilds sync once someone signs in.
VITE_SITE_URL="$site" npx convex deploy --preview-name "$name" --preview-run recipes:syncCatalog \
	--cmd "pnpm run build" --cmd-url-env-var-name VITE_CONVEX_URL
# The Cloudflare Vite plugin writes the built Worker's config here.
npx wrangler preview --config dist/server/wrangler.json --name "$name"
echo "Preview: $site"
