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
};

declare global {
	interface Window {
		guildieDesktop?: GuildieDesktop;
	}
}

/** The desktop app's bridge, when this page is running inside it. */
export function desktop(): GuildieDesktop | undefined {
	if (typeof window === "undefined") return undefined;
	const bridge = window.guildieDesktop;
	return bridge?.isDesktop === true ? bridge : undefined;
}
