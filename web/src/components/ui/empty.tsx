import { type ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Empty({ title, description, action, className }: { title: string; description?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-panel/70 px-6 py-10 text-center", className)}>
      <p className="font-display text-lg font-semibold">{title}</p>
      {description && <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
