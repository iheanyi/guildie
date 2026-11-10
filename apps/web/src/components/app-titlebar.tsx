import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { NavSheet } from "@/components/app-sidebar";
import { usePageTitle } from "@/lib/page-title";

// The desktop app's title bar over the content pane: back, forward, the page
// title. The whole row drags the window (app.css .app-titlebar); Windows
// draws minimize / maximize / close at its right end.

export function AppTitleBar() {
	const title = usePageTitle();
	const { canBack, canForward, back, forward } = useHistoryButtons();
	return (
		<div className="app-titlebar">
			<NavSheet className="md:hidden" />
			<TitleButton label="Back (Alt+Left)" disabled={!canBack} onClick={back} icon={ArrowLeft01Icon} />
			<TitleButton label="Forward (Alt+Right)" disabled={!canForward} onClick={forward} icon={ArrowRight01Icon} />
			<span className="ml-2 truncate text-xs text-muted-foreground">{title}</span>
		</div>
	);
}

function TitleButton({
	label,
	disabled,
	onClick,
	icon,
}: {
	label: string;
	disabled: boolean;
	onClick: () => void;
	icon: typeof ArrowLeft01Icon;
}) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			disabled={disabled}
			onClick={onClick}
			className="grid h-7 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
		>
			<HugeiconsIcon icon={icon} size={16} strokeWidth={1.75} />
		</button>
	);
}

/**
 * Back and forward, enabled only when there's somewhere to go. The browser
 * doesn't say whether forward is possible, so this remembers the furthest
 * history index seen this session (TanStack's history stamps every entry).
 */
function useHistoryButtons() {
	const router = useRouter();
	const [state, setState] = useState({ index: 0, max: 0 });
	useEffect(() => {
		const history = router.history;
		const indexOf = () => history.location.state.__TSR_index ?? 0;
		const start = indexOf();
		setState({ index: start, max: start });
		return history.subscribe(({ action }) => {
			const index = indexOf();
			// A new entry drops everything that was ahead of it.
			setState((s) => ({ index, max: action.type === "PUSH" ? index : Math.max(s.max, index) }));
		});
	}, [router]);
	return {
		canBack: state.index > 0,
		canForward: state.index < state.max,
		back: () => router.history.back(),
		forward: () => router.history.forward(),
	};
}
