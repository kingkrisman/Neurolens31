import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { type ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function TooltipProvider({
  children,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider delayDuration={280} skipDelayDuration={420} {...props}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  className,
  sideOffset = 8,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-80 rounded-sm bg-fg px-2 py-1 text-xs text-primary-fg shadow-float",
          "origin-[var(--radix-tooltip-content-transform-origin)]",
          "data-[state=delayed-open]:animate-[menu-in_125ms_var(--ease-out)]",
          "data-[state=instant-open]:animate-none",
          "data-[state=closed]:animate-[menu-out_80ms_var(--ease-out)]",
          "motion-reduce:data-[state=delayed-open]:animate-[overlay-in_120ms_ease]",
          "motion-reduce:data-[state=closed]:animate-[overlay-out_80ms_ease]",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}
