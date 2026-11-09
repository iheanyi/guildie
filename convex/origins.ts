import { BUILD_SITE_URL } from "./buildSite";

/**
 * Exact origins the app runs on; sign-in and claims may only return here.
 * Prod and previews get theirs baked in at deploy (buildSite.ts); local
 * backends get SITE_URL (comma-separated) from scripts/dev-seed.sh.
 */
export const allowedRedirectOrigins = [
	...(process.env.SITE_URL ?? "").split(","),
	BUILD_SITE_URL,
]
	.map((origin) => origin.trim())
	.filter(Boolean);

/**
 * A local backend (`pnpm dev`), whose site URL is loopback. Guest sign-in and
 * the fake-guild seed only work here, so no deployment setting can turn them
 * on in the cloud.
 */
export const isLocalBackend = () => /^http:\/\/(127\.0\.0\.1|localhost):/.test(process.env.CONVEX_SITE_URL ?? "");
