// `import x from "./file.ico" with { type: "file" }` gives the file's path
// (inside the .exe when compiled).
declare module "*.ico" {
	const path: string;
	export default path;
}
