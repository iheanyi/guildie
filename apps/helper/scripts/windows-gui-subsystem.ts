// Marks a Windows .exe as a GUI program, so it opens no console window: what
// Bun's --windows-hide-console does, which Bun only allows when building on
// Windows. Used by `build:win-cross` (building the .exe from macOS/Linux).
//   bun scripts/windows-gui-subsystem.ts dist/guildie-helper.exe
const path = process.argv[2];
if (!path) throw new Error("usage: windows-gui-subsystem.ts <file.exe>");
const exe = new Uint8Array(await Bun.file(path).arrayBuffer());
const view = new DataView(exe.buffer);
const pe = view.getUint32(0x3c, true);
if (view.getUint32(pe, true) !== 0x00004550) throw new Error("Not a PE file");
const optionalHeader = pe + 4 + 20;
const magic = view.getUint16(optionalHeader, true);
if (magic !== 0x20b && magic !== 0x10b) throw new Error("Unknown optional header");
// Subsystem is at offset 68 in both PE32 and PE32+ optional headers.
const subsystem = optionalHeader + 68;
const before = view.getUint16(subsystem, true);
view.setUint16(subsystem, 2, true); // IMAGE_SUBSYSTEM_WINDOWS_GUI (3 is console)
await Bun.write(path, exe);
console.log(`${path}: subsystem ${before} -> 2 (no console window)`);
