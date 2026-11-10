import { useState } from "react";
import { desktop, useDesktopStatus } from "@/lib/desktop";

// Bottom of the sidebar, in the desktop app: once an app update has
// downloaded (in the background, by itself), offer to restart into it. It
// also installs on its own the next time the app quits.

export function UpdateReady() {
	const status = useDesktopStatus();
	const [restarting, setRestarting] = useState(false);
	const app = desktop();
	if (!status?.updateReady || !app?.restartToUpdate) return null;
	return (
		<div className="mx-0.5 mb-2 rounded-md border border-border bg-[var(--selected)] px-3 py-2.5 text-[0.8125rem]">
			<p className="font-medium">Update ready</p>
			<p className="mt-0.5 text-xs text-muted-foreground">Guildie {status.updateReady} is downloaded. Restart to use it.</p>
			<button
				type="button"
				disabled={restarting}
				onClick={() => {
					setRestarting(true);
					void app.restartToUpdate?.();
				}}
				className="mt-2 h-7 w-full rounded-md bg-primary text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
			>
				{restarting ? "Restarting…" : "Restart Guildie"}
			</button>
		</div>
	);
}
