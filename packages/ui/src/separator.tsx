"use client";

import { Separator as SeparatorPrimitive } from "radix-ui";

import { cn } from "@acme/ui";

export function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "bg-primary/30 shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px shadow-[0_0_4px_rgba(0,255,0,0.3)]",
        className,
      )}
      {...props}
    />
  );
}
