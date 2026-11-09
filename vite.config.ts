import { realpathSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const authDeps = {
	exclude: ["@convex-dev/auth"],
	include: ["@convex-dev/auth > cookie"],
};

export default defineConfig({
	resolve: {
		tsconfigPaths: true,
		alias: {
			// See src/lib/convex-auth-start/README.md. Resolved to the real (pnpm)
			// path so it's the same module instance the package's hooks import.
			"#convex-auth-react-internal": realpathSync(
				"node_modules/@convex-dev/auth/dist/react/client.js",
			),
		},
	},
	// Pre-bundling would give @convex-dev/auth/react its own copy of that module.
	// Its CommonJS dependencies still need pre-bundling.
	optimizeDeps: authDeps,
	environments: { ssr: { optimizeDeps: authDeps } },
	// Bundle it for SSR too, so the provider (via the alias) and the method hooks
	// share one module instance instead of Node loading a second copy.
	ssr: { noExternal: ["@convex-dev/auth"] },
	plugins: [tailwindcss(), tanstackStart(), react()],
});
