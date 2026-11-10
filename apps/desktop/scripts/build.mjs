// Bundles the main process and the preload into dist/ (one file each, so the
// packaged app ships no node_modules), and copies the icons from apps/helper.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const common = {
	bundle: true,
	platform: "node",
	format: "cjs",
	target: "node22",
	external: ["electron"],
	define: { __VERSION__: JSON.stringify(version) },
	sourcemap: "linked",
	logLevel: "warning",
};
await build({ ...common, entryPoints: [join(root, "src/main.ts")], outfile: join(root, "dist/main.cjs") });
// The preload runs sandboxed: it may only require("electron").
await build({ ...common, entryPoints: [join(root, "src/preload.ts")], outfile: join(root, "dist/preload.cjs") });

mkdirSync(join(root, "dist/assets"), { recursive: true });
for (const icon of ["guildie.ico", "guildie-256.png"]) {
	copyFileSync(join(root, "../helper/assets", icon), join(root, "dist/assets", icon));
}
console.log(`Built Guildie ${version} into dist/`);
