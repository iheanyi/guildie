"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "@/lib/utils"

function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center justify-center rounded-[2px] border border-bronze bg-well shadow-[inset_0_1px_3px_rgb(0_0_0/0.9),0_0_0_1px_#000] transition-colors outline-none after:absolute after:-inset-x-3 after:-inset-y-2 hover:border-[var(--bronze-light)] focus-visible:ring-2 focus-visible:ring-ring/60 aria-invalid:border-destructive data-[size=default]:size-[18px] data-[size=sm]:size-[15px] data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block h-[0.55em] w-[0.3em] -translate-y-px rotate-45 border-r-[2.5px] border-b-[2.5px] border-gold opacity-0 drop-shadow-[0_1px_0_#000] transition-opacity group-data-[size=default]/switch:text-[18px] group-data-[size=sm]/switch:text-[15px] data-checked:opacity-100"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
