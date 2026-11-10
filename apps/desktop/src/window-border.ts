// Windows 11 draws a 1px border around every window, in the accent color
// when "Show accent color on title bars and window borders" is on (a bright
// blue line around our dark window). DwmSetWindowAttribute(DWMWA_BORDER_COLOR,
// DWMWA_COLOR_NONE) turns it off for this window only. Electron has no API for
// it, so this calls dwmapi.dll through koffi (a prebuilt FFI; its Windows
// binary ships in resources/koffi, electron-builder.yml).
//
// Best effort: Windows 10 doesn't have the attribute, and any failure just
// leaves Windows' border as it was.

import type { Log } from "@guildie/sync";
import type { BrowserWindow } from "electron";

const DWMWA_BORDER_COLOR = 34;
const DWMWA_COLOR_NONE = 0xfffffffe;

type SetAttribute = (hwnd: number, attribute: number, value: number[], size: number) => number;
let setAttribute: SetAttribute | null | undefined;

function dwmSetWindowAttribute(log: Log): SetAttribute | null {
	if (setAttribute !== undefined) return setAttribute;
	try {
		// Loaded here, not at start: only Windows needs it.
		const koffi: typeof import("koffi") = require("koffi");
		const dwm = koffi.load("dwmapi.dll");
		setAttribute = dwm.func(
			"int32 __stdcall DwmSetWindowAttribute(intptr hwnd, uint32 attribute, _In_ uint32 *value, uint32 size)",
		) as SetAttribute;
	} catch (e) {
		log(`Window border: couldn't load dwmapi (${(e as Error).message})`);
		setAttribute = null;
	}
	return setAttribute;
}

export function hideWindowBorder(win: BrowserWindow, log: Log) {
	if (process.platform !== "win32") return;
	const set = dwmSetWindowAttribute(log);
	if (!set) return;
	try {
		const handle = win.getNativeWindowHandle();
		const hwnd = Number(handle.length >= 8 ? handle.readBigUInt64LE() : BigInt(handle.readUInt32LE()));
		const result = set(hwnd, DWMWA_BORDER_COLOR, [DWMWA_COLOR_NONE], 4);
		// 0 is S_OK; Windows 10 says E_INVALIDARG, which is fine (no such border there).
		if (result !== 0) log(`Window border: DwmSetWindowAttribute returned 0x${(result >>> 0).toString(16)}`);
	} catch (e) {
		log(`Window border: ${(e as Error).message}`);
	}
}
