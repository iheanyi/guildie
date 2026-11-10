import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Button } from "@/components/ui/button";
import { ago } from "@/lib/format";

/** Account page: desktop helpers connected to this account, which upload the Guildie addon's data. */
export function HelperTokens() {
	const tokens = useQuery(api.helper.listTokens);
	const revoke = useMutation(api.helper.revokeToken);
	return (
		<div>
			<p className="mt-1 text-muted-foreground">
				With the Guildie addon and the desktop app (or the older helper), your talents update when you
				log out of the game, or sooner with <code>/reload</code>. Without them, Guildie uses Blizzard's
				data, which can take up to an hour longer.
			</p>
			{tokens && tokens.length === 0 && <p className="mt-2 text-muted-foreground">None yet. Sign in inside the app to connect it.</p>}
			{tokens && tokens.length > 0 && (
				<ul className="mt-3 divide-y divide-border border-y border-border">
					{tokens.map((t) => (
						<li key={t._id} className="flex h-9 items-center justify-between gap-4">
							<span>{t.label}</span>
							<span className="num flex items-center gap-4 text-muted-foreground">
								{t.lastUsedAt ? `used ${ago(t.lastUsedAt)}` : `connected ${ago(t.createdAt)}`}
								<Button variant="ghost" size="xs" className="hover:text-destructive" onClick={() => revoke({ tokenId: t._id })}>
									Disconnect
								</Button>
							</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
