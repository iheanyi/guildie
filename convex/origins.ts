/** Exact origins the app runs on (comma-separated SITE_URL). Sign-in and claims may only return here. */
export const allowedRedirectOrigins = (process.env.SITE_URL ?? "http://localhost:3000")
	.split(",")
	.map((origin) => origin.trim());
