import { useEffect, useState } from "react";

// The Guildie desktop app loads this site in its window and exposes this
// bridge (Electron contextBridge) on our own origins only. The site gives it
// an upload token once the player is signed in (components/desktop-bridge.tsx)
// and signs it out with the site. Contract: docs/addon.md.

export type GuildieDesktop = {
	isDesktop: true;
	version: string;
	getState(): Promise<{ connected: boolean; account?: string }>;
	setToken(token: string, account?: string): Promise<void>;
	signOut(): Promise<void>;
	/**
	 * Sign in through the player's own browser (any Battle.net login works
	 * there, Google included); the app then signs its window in by itself
	 * (/desktop/session). Missing in app builds before 0.2.
	 */
	signIn?(): Promise<void>;
};

declare global {
	interface Window {
		guildieDesktop?: GuildieDesktop;
	}
}

/** True once mounted inside the desktop app (false during SSR, so markup matches). */
export function useInDesktopApp() {
	const [inApp, setInApp] = useState(false);
	useEffect(() => setInApp(!!desktop()), []);
	return inApp;
}

/** The desktop app's bridge, when this page is running inside it. */
export function desktop(): GuildieDesktop | undefined {
	if (typeof window === "undefined") return undefined;
	const bridge = window.guildieDesktop;
	return bridge?.isDesktop === true ? bridge : undefined;
}
