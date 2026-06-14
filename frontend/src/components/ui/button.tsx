import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Pill button. Variants map to the design system; everything is overridable via
 * `className`. Use `buttonVariants(...)` to style a `<Link>` as a button.
 * See docs/design/DESIGN_SYSTEM.md §6.
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // Light-surface defaults
        default: "bg-ink text-paper hover:bg-ink/90",
        accent: "bg-coral text-white hover:bg-coral/90",
        outline: "border border-ink/15 bg-transparent hover:bg-ink/5",
        ghost: "hover:bg-ink/5",
        // For use on dark sections
        paper: "bg-paper text-ink hover:bg-paper/90",
        "outline-dark": "border border-white/15 bg-white/5 text-paper hover:bg-white/10",
        "ghost-dark": "text-paper hover:bg-white/10",
      },
      size: {
        sm: "h-9 px-4 text-[13px]",
        default: "h-11 px-5 text-sm",
        lg: "h-12 px-6 text-sm",
        xl: "h-14 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";
