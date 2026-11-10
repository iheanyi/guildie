import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ago } from "@/lib/format";

/** Account page: tokens for the desktop helper that uploads the guildie addon's data. */
export function HelperTokens() {
	const tokens = useQuery(api.helper.listTokens);
	const create = useMutation(api.helper.createToken);
	const revoke = useMutation(api.helper.revokeToken);
	const [label, setLabel] = useState("");
	const [created, setCreated] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	return (
		<div>
			<p className="mt-1 text-muted-foreground">
				With the guildie addon and the desktop helper, your talents show up here after a{" "}
				<code>/reload</code> in game, without logging out. Without them, guildie uses Blizzard's data,
				which updates when you log out. Make a token below and give it to the helper.
			</p>
			{tokens && tokens.length > 0 && (
				<ul className="mt-4 divide-y border-y text-sm">
					{tokens.map((t) => (
						<li key={t._id} className="flex items-baseline justify-between gap-4 py-2">
							<span>{t.label}</span>
							<span className="num flex items-baseline gap-4 text-muted-foreground">
								{t.lastUsedAt ? `used ${ago(t.lastUsedAt)}` : "never used"}
								<button type="button" className="hover:text-destructive" onClick={() => revoke({ tokenId: t._id })}>
									Revoke
								</button>
							</span>
						</li>
					))}
				</ul>
			)}
			<form
				className="mt-4 flex max-w-md gap-2"
				onSubmit={async (e) => {
					e.preventDefault();
					setError(null);
					try {
						setCreated(await create({ label: label || "My PC" }));
						setLabel("");
					} catch (err) {
						setError(err instanceof ConvexError ? String(err.data) : "Couldn't make a token.");
					}
				}}
			>
				<Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name it, e.g. My PC" />
				<Button type="submit">Make a token</Button>
			</form>
			{error && <p className="mt-2 text-sm text-destructive">{error}</p>}
			{created && (
				<div className="mt-4 border-l-2 border-foreground pl-3 text-sm">
					<p>Paste this into the helper. It's shown once; make a new one if you lose it.</p>
					<code className="mt-1 block break-all font-mono">{created}</code>
				</div>
			)}
		</div>
	);
}
