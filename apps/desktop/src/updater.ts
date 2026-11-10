// The app updates itself from GitHub Releases (electron-updater; the feed is
// the `publish` block in electron-builder.yml, baked into the installed app as
// resources/app-update.yml). It downloads in the background and installs when
// the app quits, or right away from the tray's "Restart to update".

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Log } from "@guildie/sync";
import { app } from "electron";
import { autoUpdater } from "electron-updater";

const CHECK_EVERY_MS = 6 * 60 * 60_000;

/**
 * Only the NSIS install can update itself: it's what the downloaded installer
 * replaces. An unzipped copy would get a second, installed Guildie instead.
 */
export function canSelfUpdate() {
	if (!app.isPackaged || process.platform !== "win32") return false;
	return existsSync(join(dirname(process.execPath), `Uninstall ${app.getName()}.exe`));
}

export type Updater = {
	/** The version downloaded and waiting for a restart, if any. */
	readonly ready: string | undefined;
	check: () => void;
	restart: () => void;
};

export function startUpdater(log: Log, notify: (title: string, body: string) => void, onChange: () => void): Updater {
	autoUpdater.logger = {
		info: (m: unknown) => log(`Update: ${String(m)}`),
		warn: (m: unknown) => log(`Update: ${String(m)}`),
		error: (m: unknown) => log(`Update error: ${String(m)}`),
	};
	autoUpdater.autoDownload = true;
	autoUpdater.autoInstallOnAppQuit = true;

	let ready: string | undefined;
	autoUpdater.on("update-available", (info) => log(`Update: ${info.version} available, downloading`));
	autoUpdater.on("update-not-available", () => log("Update: up to date"));
	autoUpdater.on("update-downloaded", (info) => {
		if (ready === info.version) return;
		ready = info.version;
		onChange();
		notify(`Guildie ${info.version} is ready`, "Choose Restart to update in the tray, or it installs when you quit Guildie.");
	});
	// Offline or GitHub down: try again at the next check, quietly.
	autoUpdater.on("error", (e) => log(`Update failed: ${e.message}`));

	const check = () => {
		if (ready) return;
		autoUpdater.checkForUpdates().catch((e: Error) => log(`Update check failed: ${e.message}`));
	};
	check();
	setInterval(check, CHECK_EVERY_MS).unref();

	return {
		get ready() {
			return ready;
		},
		check,
		// Silent install, then start the new version.
		restart: () => autoUpdater.quitAndInstall(true, true),
	};
}
