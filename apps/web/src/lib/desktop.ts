import { useRouteContext } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
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

/**
 * What the desktop app says about itself in its user agent: the window appends
 * " GuildieDesktop/<version>", plus " (Mica)" when the window has Windows 11's
 * Mica behind it (apps/desktop/src/window.ts). Read on the server too, so the
 * first paint already has the app's layout (html[data-desktop]).
 */
export type DesktopInfo = { version: string; mica: boolean };

export function parseDesktopUserAgent(ua: string | null | undefined): DesktopInfo | null {
	const match = /\bGuildieDesktop\/([\w.+-]+)( \(Mica\))?/.exec(ua ?? "");
	return match ? { version: match[1], mica: !!match[2] } : null;
}

/** The current request's (server) or the window's (client) desktop app, if any. */
export const readDesktopInfo = createIsomorphicFn()
	.server(async () => {
		const { getRequestHeader } = await import("@tanstack/react-start/server");
		return parseDesktopUserAgent(getRequestHeader("user-agent"));
	})
	.client(async () => parseDesktopUserAgent(navigator.userAgent));

/**
 * True inside the desktop app. Known from the user agent during SSR, so markup
 * matches; app builds before 0.2 don't send it and are found once mounted.
 */
export function useInDesktopApp() {
	const fromAgent = useRouteContext({ from: "__root__", select: (c) => !!c.desktop });
	const [bridged, setBridged] = useState(false);
	useEffect(() => setBridged(!!desktop()), []);
	return fromAgent || bridged;
}

/** The desktop app's bridge, when this page is running inside it. */
export function desktop(): GuildieDesktop | undefined {
	if (typeof window === "undefined") return undefined;
	const bridge = window.guildieDesktop;
	return bridge?.isDesktop === true ? bridge : undefined;
}
