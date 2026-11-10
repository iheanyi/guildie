import { type ErrorComponentProps, Link } from "@tanstack/react-router";
import { Page, PageHeader } from "@/components/page-header";

export function NotFoundPage() {
	return (
		<Page width="narrow">
			<PageHeader
				title="Nothing here"
				description={
					<>
						That page doesn't exist.{" "}
						<Link to="/" className="text-foreground underline underline-offset-4">
							Back to guilds
						</Link>
						.
					</>
				}
			/>
		</Page>
	);
}

export function ErrorPage({ error }: ErrorComponentProps) {
	return (
		<Page width="narrow">
			<PageHeader title="Something broke" description={error instanceof Error ? error.message : String(error)} />
		</Page>
	);
}
