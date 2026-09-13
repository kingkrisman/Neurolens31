import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

const tapScale = "active:not-disabled:scale-[0.97]";

const buttonVariants = cva(
  // `icon-group` is the trigger for the .icon-motion utilities. It is a
  // dedicated class rather than Tailwind's `group` so it cannot capture
  // `group-hover:` bindings that already point at an outer card.
  "icon-group inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium outline-none select-none disabled:pointer-events-none disabled:opacity-40 transition-[transform,background-color,box-shadow,color,opacity] duration-[140ms] ease-[var(--ease-out)] focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-fg)_18%,transparent)]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-fg shadow-border hover:opacity-90",
        outline: "bg-surface text-fg shadow-border hover:shadow-border-hover",
        ghost: "bg-transparent text-fg hover:bg-fg/5",
        destructive: "bg-danger-soft text-danger hover:bg-danger/15",
      },
      size: {
        default: "h-11 min-h-11 px-4 rounded-md text-sm",
        sm: "h-9 min-h-9 px-3 rounded-sm text-sm",
        lg: "h-12 min-h-12 px-5 rounded-lg text-sm",
        icon: "size-11 min-h-11 rounded-md",
        "icon-sm": "size-9 min-h-9 rounded-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  static?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, static: isStatic, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), !isStatic && tapScale, className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
