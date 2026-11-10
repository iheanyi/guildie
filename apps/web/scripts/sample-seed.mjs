// Loads the sample guild (fixtures/sample, made by scripts/sample-export.mjs)
// into this checkout's local backend, replacing its app data. Run by
// scripts/dev-seed.sh on a new backend that can't copy cloud dev's data.
// Times in the sample are moved forward to look recent.
//   usage: node scripts/sample-seed.mjs   (from apps/web, with the backend up)
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = join(app, "fixtures/sample");
const read = (file) => readFileSync(join(fixture, file), "utf8");
const rows = (table) => read(`${table}.jsonl`).split("\n").filter(Boolean).map((line) => JSON.parse(line));

const { exportedAt } = JSON.parse(read("meta.json"));
const shift = Date.now() - exportedAt;
const later = (row, fields) => {
	for (const field of fields) if (typeof row[field] === "number") row[field] += shift;
	return row;
};
const times = {
	guilds: ["rosterSyncedAt"],
	characters: ["lastLoginAt", "profileSyncedAt", "talentsChangedAt"],
	items: ["syncedAt"],
	recipes: ["syncedAt"],
	talentLayouts: ["syncedAt"],
	talentTreeInfo: [],
};

// A snapshot like `convex export` makes: every app table with its number
// (the ids encode it), only the sample's tables with rows.
const tables = rows("_tables");
const files = [["_tables/documents.jsonl", read("_tables.jsonl")]];
for (const { name } of tables) {
	const data = name in times ? rows(name).map((row) => later(row, times[name])) : [];
	files.push([`${name}/documents.jsonl`, data.map((row) => JSON.stringify(row)).join("\n") + (data.length ? "\n" : "")]);
}

const dir = mkdtempSync(join(tmpdir(), "guildie-sample-"));
try {
	const zip = join(dir, "sample.zip");
	writeFileSync(zip, storedZip(files));
	try {
		execFileSync("npx", ["convex", "import", "--replace-all", "-y", zip], {
			cwd: app,
			env: { ...process.env, CONVEX_AGENT_MODE: "anonymous" },
			stdio: ["ignore", "pipe", "pipe"],
		});
	} catch (error) {
		process.stderr.write(`${error.stdout ?? ""}${error.stderr ?? ""}`);
		throw new Error("sample-seed: convex import failed");
	}
} finally {
	rmSync(dir, { recursive: true, force: true });
}

/** A zip of uncompressed entries: enough for `convex import`, no zip tool needed. */
function storedZip(entries) {
	const crcTable = Array.from({ length: 256 }, (_, n) => {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		return c >>> 0;
	});
	const crc32 = (buf) => {
		let c = 0xffffffff;
		for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
		return (c ^ 0xffffffff) >>> 0;
	};
	const parts = [];
	const central = [];
	let offset = 0;
	for (const [name, text] of entries) {
		const nameBuf = Buffer.from(name);
		const data = Buffer.from(text);
		const crc = crc32(data);
		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0);
		local.writeUInt16LE(20, 4);
		local.writeUInt32LE(crc, 14);
		local.writeUInt32LE(data.length, 18);
		local.writeUInt32LE(data.length, 22);
		local.writeUInt16LE(nameBuf.length, 26);
		const header = Buffer.alloc(46);
		header.writeUInt32LE(0x02014b50, 0);
		header.writeUInt16LE(20, 4);
		header.writeUInt16LE(20, 6);
		header.writeUInt32LE(crc, 16);
		header.writeUInt32LE(data.length, 20);
		header.writeUInt32LE(data.length, 24);
		header.writeUInt16LE(nameBuf.length, 28);
		header.writeUInt32LE(offset, 42);
		parts.push(local, nameBuf, data);
		central.push(header, nameBuf);
		offset += local.length + nameBuf.length + data.length;
	}
	const centralBuf = Buffer.concat(central);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(centralBuf.length, 12);
	end.writeUInt32LE(offset, 16);
	return Buffer.concat([...parts, centralBuf, end]);
}
