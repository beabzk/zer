import { cn } from "../../lib/cn";

export function Separator({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("h-px w-full bg-border", className)} />;
}
