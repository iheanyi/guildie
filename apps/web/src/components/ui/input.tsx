import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-sm border border-input bg-well px-2.5 py-0.5 text-sm text-foreground shadow-[inset_0_1px_3px_rgb(0_0_0/0.8)] transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs/relaxed file:font-medium file:text-foreground placeholder:text-muted-foreground/80 focus-visible:border-gold/80 focus-visible:shadow-[inset_0_1px_3px_rgb(0_0_0/0.8),0_0_6px_rgb(255_209_0/0.25)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
