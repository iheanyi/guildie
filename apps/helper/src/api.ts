// The guildie endpoints the helper uses (apps/web/src/routes/api/helper).

export type Me = { battletag: string | null; characters: string[] };
export type UploadResult = { accepted?: string[]; unmatched?: string[]; error?: string };

export class Api {
	constructor(
		readonly base: string,
		public token?: string,
	) {}

	private fetch(path: string, init: RequestInit = {}) {
		const url = new URL(path, this.base);
		return fetch(url, {
			...init,
			headers: {
				...init.headers,
				"Content-Type": "application/json",
				...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
			},
			// Local dev servers (*.localhost) use a self-signed certificate.
			...(url.hostname.endsWith(".localhost") ? { tls: { rejectUnauthorized: false } } : {}),
		});
	}

	/** null when the token is unknown or revoked; throws when the site can't be reached. */
	async me(): Promise<Me | null> {
		const res = await this.fetch("/api/helper/me");
		if (res.status === 401) return null;
		if (!res.ok) throw new Error(`guildie answered ${res.status}`);
		return (await res.json()) as Me;
	}

	async startPairing(label: string) {
		const res = await this.fetch("/api/helper/pair", { method: "POST", body: JSON.stringify({ label }) });
		if (!res.ok) throw new Error(`guildie answered ${res.status}`);
		return (await res.json()) as { code: string; pollSecret: string; expiresInSeconds: number; connectUrl: string };
	}

	async pollPairing(code: string, pollSecret: string) {
		const res = await this.fetch("/api/helper/pair/poll", { method: "POST", body: JSON.stringify({ code, pollSecret }) });
		if (!res.ok) throw new Error(`guildie answered ${res.status}`);
		return (await res.json()) as { status: "pending" | "expired" } | { status: "approved"; token: string };
	}

	async upload(payload: string): Promise<{ ok: boolean; status: number; body: UploadResult }> {
		const res = await this.fetch("/api/helper/snapshot", { method: "POST", body: payload });
		return { ok: res.ok, status: res.status, body: (await res.json().catch(() => ({}))) as UploadResult };
	}

	async signOut() {
		await this.fetch("/api/helper/signout", { method: "POST" }).catch(() => undefined);
	}
}
