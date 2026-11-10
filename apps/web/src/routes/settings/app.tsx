import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { markSeen } from "@/lib/release-notes";
import { HelperTokens } from "@/components/helper-tokens";
import { WhatsNew } from "@/components/whats-new";
import { SectionTitle } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { desktop, RELEASES, useDesktopStatus, useInDesktopApp } from "@/lib/desktop";
import { Row, Rows } from "./addon";

// Settings → App: the Guildie app for Windows. In the app, its version and
// updates; on the web, where to get it. Either way, the computers connected
// to your account (each is a token that can upload your addon's data).
export const Route = createFileRoute("/settings/app")({
	head: () => ({ meta: [{ title: "App · Settings · Guildie" }] }),
	component: AppSettings,
});

function AppSettings() {
	const inApp = useInDesktopApp();
	// Opening this page counts as having seen the notes for this version.
	useEffect(() => {
		const version = desktop()?.version;
		if (version) markSeen(version);
	}, []);
	return (
		<div className="max-w-3xl pb-12">
			{inApp ? <ThisApp /> : <GetTheApp />}
			<section id="whats-new" className="mt-10 scroll-mt-4">
				<SectionTitle>What's new</SectionTitle>
				<WhatsNew upTo={inApp ? desktop()?.version : undefined} />
			</section>
			<section className="mt-10">
				<SectionTitle>Connected computers</SectionTitle>
				<HelperTokens />
			</section>
		</div>
	);
}

function ThisApp() {
	const status = useDesktopStatus();
	const app = desktop();
	return (
		<section>
			<SectionTitle>Guildie for Windows</SectionTitle>
			<Rows>
				<Row label="Version">
					<span className="num">{app?.version ?? "Unknown"}</span>
				</Row>
				<Row label="Updates">
					{status?.updateReady ? (
						<span>Version {status.updateReady} is downloaded and ready</span>
					) : (
						<span className="text-muted-foreground">Downloaded automatically in the background, and installed when the app restarts</span>
					)}
				</Row>
			</Rows>
			{status?.updateReady && app?.restartToUpdate && (
				<Button className="mt-3" onClick={() => void app.restartToUpdate?.()}>
					Restart to update
				</Button>
			)}
		</section>
	);
}

function GetTheApp() {
	return (
		<section className="max-w-xl text-[0.8125rem]">
			<SectionTitle>Guildie for Windows</SectionTitle>
			<p className="mt-1 text-muted-foreground">
				Guildie in its own window, plus the Guildie addon: it installs the addon in World of Warcraft, keeps it up to
				date, and keeps your character current on Guildie as you play. It updates itself.
			</p>
			<Button className="mt-4" render={<a href={RELEASES} target="_blank" rel="noreferrer" />}>
				Get Guildie for Windows
			</Button>
			<p className="mt-3 text-muted-foreground">
				Download <span className="text-foreground">Guildie-Setup.exe</span> from the latest release and run it. Windows may
				warn that it's from an unknown publisher: choose More info, then Run anyway.
			</p>
		</section>
	);
}
