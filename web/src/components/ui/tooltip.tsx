import { type ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Tooltip({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <span className={cn("group relative inline-flex", className)}>
      <span aria-label={label}>{children}</span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-foreground px-2 py-1 text-xs text-background group-hover:block group-focus-within:block"
      >
        {label}
      </span>
    </span>
  );
}
