import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-foreground text-background hover:bg-foreground/90",
  secondary: "bg-accent text-white hover:bg-accent-strong",
  outline: "border border-border bg-panel text-foreground hover:bg-panel-muted",
  ghost: "text-muted-foreground hover:bg-panel-muted hover:text-foreground",
  danger: "bg-destructive text-white hover:bg-destructive/90",
};

const sizes: Record<ButtonSize, string> = {
  sm: "min-h-8 px-3 text-xs",
  md: "min-h-10 px-4 text-sm",
  lg: "min-h-12 px-5 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}>(({ className, variant = "primary", size = "md", type = "button", ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    className={cn(
      "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-45",
      variants[variant],
      sizes[size],
      className,
    )}
    {...props}
  />
));

Button.displayName = "Button";
