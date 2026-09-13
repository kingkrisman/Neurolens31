import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { type ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-80 min-w-44 rounded-md bg-surface p-1 shadow-float",
          "origin-[var(--radix-dropdown-menu-content-transform-origin)]",
          "data-[state=open]:animate-[menu-in_180ms_var(--ease-out)]",
          "data-[state=closed]:animate-[menu-out_120ms_var(--ease-out)]",
          "motion-reduce:data-[state=open]:animate-[overlay-in_140ms_ease]",
          "motion-reduce:data-[state=closed]:animate-[overlay-out_100ms_ease]",
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        "icon-group flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm leading-snug whitespace-normal outline-none",
        "data-[highlighted]:bg-fg/6",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
        className,
      )}
      {...props}
    />
  );
}
