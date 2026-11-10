// The notification-area icon and its menu. Left-click opens the window.

import { join } from "node:path";
import { displayName } from "@guildie/sync";
import { Menu, nativeImage, Tray } from "electron";
import type { Status } from "./connection.ts";

export type TrayActions = {
	open: () => void;
	connect: () => void;
	uploadNow: () => void;
	chooseWow: () => void;
	startWithSystem: { get: () => boolean; set: (on: boolean) => void } | undefined;
	about: () => void;
	signOut: () => void;
	quit: () => void;
};

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function createTray(actions: TrayActions) {
	const icon =
		process.platform === "win32"
			? nativeImage.createFromPath(join(__dirname, "assets", "guildie.ico"))
			: nativeImage.createFromPath(join(__dirname, "assets", "guildie-256.png")).resize({ width: 18, height: 18 });
	const tray = new Tray(icon);
	tray.setToolTip("Guildie");
	tray.on("click", actions.open);

	const update = (status: Status) => {
		const statusLine = status.pairingCode
			? `Approve ${status.pairingCode} in the window`
			: status.connected
				? `Connected as ${status.account}`
				: "Not connected";
		const lastLine = status.lastUpload
			? `Last upload: ${status.lastUpload.characters.map(displayName).join(", ")} at ${time(status.lastUpload.at)}`
			: "No uploads yet";
		tray.setToolTip(`Guildie: ${statusLine}`);
		tray.setContextMenu(
			Menu.buildFromTemplate([
				{ label: statusLine, enabled: false },
				{ label: lastLine, enabled: false },
				{ label: status.wowFolder ? `WoW: ${status.wowFolder}` : "WoW folder not found", enabled: false },
				{ type: "separator" },
				{ label: "Open Guildie", click: actions.open },
				{ label: "Connect...", visible: !status.connected && !status.pairingCode, click: actions.connect },
				{ label: "Upload now", enabled: status.connected, click: actions.uploadNow },
				{ label: "Choose World of Warcraft folder...", click: actions.chooseWow },
				...(actions.startWithSystem
					? [
							{
								label: process.platform === "win32" ? "Start with Windows" : "Start at login",
								type: "checkbox" as const,
								checked: actions.startWithSystem.get(),
								click: (item: Electron.MenuItem) => actions.startWithSystem?.set(item.checked),
							},
						]
					: []),
				{ type: "separator" },
				{ label: "About Guildie", click: actions.about },
				{ label: "Sign out", visible: status.connected, click: actions.signOut },
				{ label: "Quit", click: actions.quit },
			]),
		);
	};
	return { tray, update };
}
