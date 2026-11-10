// The app origin this deployment serves, written by the deploy scripts
// (scripts/cloudflare-deploy.sh, scripts/preview-deploy.sh) just before
// `convex deploy`, so prod and branch previews need no SITE_URL setting.
// Empty in the repo: local backends use SITE_URL (set by scripts/dev-seed.sh).
export const BUILD_SITE_URL: string = "";
