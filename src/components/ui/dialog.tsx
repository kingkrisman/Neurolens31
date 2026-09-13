import * as DialogPrimitive from "@radix-ui/react-dialog";
import { type ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

export function DialogOverlay({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-70 bg-fg/30",
        "data-[state=open]:animate-[overlay-in_250ms_var(--ease-out)]",
        "data-[state=closed]:animate-[overlay-out_150ms_var(--ease-out)]",
        "motion-reduce:data-[state=open]:animate-[overlay-in_160ms_ease]",
        "motion-reduce:data-[state=closed]:animate-[overlay-out_120ms_ease]",
        className,
      )}
      {...props}
    />
  );
}

export function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-70 w-[min(100%-2rem,42rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-surface p-5 shadow-float origin-center",
          "data-[state=open]:animate-[modal-in_250ms_var(--ease-out)]",
          "data-[state=closed]:animate-[modal-out_150ms_var(--ease-out)]",
          "motion-reduce:data-[state=open]:animate-[overlay-in_160ms_ease]",
          "motion-reduce:data-[state=closed]:animate-[overlay-out_120ms_ease]",
          className,
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
