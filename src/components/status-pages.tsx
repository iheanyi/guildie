import { type ErrorComponentProps, Link } from "@tanstack/react-router";

export function NotFoundPage() {
	return (
		<div className="py-16">
			<h1 className="text-3xl">Nothing here</h1>
			<p className="mt-2 text-muted-foreground">
				That page doesn't exist. <Link to="/" className="underline underline-offset-4">Back to guilds</Link>.
			</p>
		</div>
	);
}

export function ErrorPage({ error }: ErrorComponentProps) {
	return (
		<div className="py-16">
			<h1 className="text-3xl">Something broke</h1>
			<p className="mt-2 text-muted-foreground">{error instanceof Error ? error.message : String(error)}</p>
		</div>
	);
}
