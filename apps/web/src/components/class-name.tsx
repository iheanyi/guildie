import type { CSSProperties, ReactNode } from "react";
import { CLASSES } from "@convex/shared/wow";
import { cn } from "@/lib/utils";

/** Text in a WoW class color (or item quality color with `quality`). */
export function ClassText({
	classId,
	quality,
	className,
	children,
}: {
	classId?: number;
	quality?: string;
	className?: string;
	children: ReactNode;
}) {
	const color = classId !== undefined ? CLASSES[classId]?.color : undefined;
	return (
		<span
			className={cn("class-color", quality && `q-${quality}`, className)}
			style={color ? ({ "--class": color } as CSSProperties) : undefined}
		>
			{children}
		</span>
	);
}
