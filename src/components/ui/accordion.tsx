import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronRight } from "lucide-react";
import { type ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Accordion = AccordionPrimitive.Root;

export function AccordionItem({
  className,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      className={cn("border-b border-border", className)}
      {...props}
    />
  );
}

export function AccordionTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        className={cn(
          "group flex flex-1 items-center justify-between gap-4 py-5 text-left font-serif text-lg outline-none",
          className,
        )}
        {...props}
      >
        {children}
        <ChevronRight
          size={16}
          className="shrink-0 text-muted transition-transform duration-[200ms] ease-[var(--ease-in-out)] group-data-[state=open]:rotate-90 icon-motion icon-shift"
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

export function AccordionContent({
  className,
  children,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      className="overflow-hidden data-[state=closed]:animate-[accordion-close_250ms_var(--ease-out)] data-[state=open]:animate-[accordion-open_250ms_var(--ease-out)] motion-reduce:data-[state=closed]:animate-[overlay-out_120ms_ease] motion-reduce:data-[state=open]:animate-[overlay-in_160ms_ease]"
      {...props}
    >
      <div className={cn("max-w-2xl pb-5 text-sm leading-relaxed text-muted", className)}>
        {children}
      </div>
    </AccordionPrimitive.Content>
  );
}
