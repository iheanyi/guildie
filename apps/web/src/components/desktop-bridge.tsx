import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useRef } from "react";
import { desktop } from "@/lib/desktop";

/**
 * Inside the desktop app: once the player is signed in and the app isn't
 * connected yet, give it an upload token. The only place a token is issued
 * without the helper's pairing code.
 */
export function DesktopBridge() {
	const { isAuthenticated } = useConvexAuth();
	const { data: viewer } = useQuery(convexQuery(api.users.viewer, {}));
	const issue = useMutation(api.helper.issueDesktopToken);
	// One attempt per signed-in user per page load.
	const attempted = useRef<string | null>(null);

	useEffect(() => {
		const bridge = desktop();
		if (!bridge || !isAuthenticated || !viewer || attempted.current === viewer._id) return;
		attempted.current = viewer._id;
		void (async () => {
			try {
				const state = await bridge.getState();
				if (state.connected) return;
				const token = await issue({ label: `Desktop app ${bridge.version}`.trim() });
				await bridge.setToken(token, viewer.battletag ?? viewer.name);
			} catch (error) {
				console.warn("Couldn't connect the desktop app", error);
			}
		})();
	}, [isAuthenticated, viewer, issue]);

	return null;
}
