import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { ago } from "@/lib/format";

/** Account page: desktop helpers connected to this account, which upload the Guildie addon's data. */
export function HelperTokens() {
	const tokens = useQuery(api.helper.listTokens);
	const revoke = useMutation(api.helper.revokeToken);
	return (
		<div>
			<p className="mt-1 text-muted-foreground">
				With the Guildie addon and the desktop helper, your talents update when you log out of the
				game, or sooner with <code>/reload</code>. Without them, Guildie uses Blizzard's data, which can
				take up to an hour longer. Connect a helper from its tray icon.
			</p>
			{tokens && tokens.length > 0 && (
				<ul className="mt-4 divide-y border-y text-sm">
					{tokens.map((t) => (
						<li key={t._id} className="flex items-baseline justify-between gap-4 py-2">
							<span>{t.label}</span>
							<span className="num flex items-baseline gap-4 text-muted-foreground">
								{t.lastUsedAt ? `used ${ago(t.lastUsedAt)}` : `connected ${ago(t.createdAt)}`}
								<button type="button" className="hover:text-destructive" onClick={() => revoke({ tokenId: t._id })}>
									Disconnect
								</button>
							</span>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
