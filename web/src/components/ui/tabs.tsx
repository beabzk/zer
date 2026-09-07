import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/cn";

export function Tabs({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto pb-1">
      {children}
    </div>
  );
}

export function TabTrigger({
  value,
  active,
  onSelect,
  children,
  className,
  ...props
}: {
  value: string;
  active: boolean;
  onSelect: (value: string) => void;
  children: ReactNode;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onSelect" | "value">) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onSelect(value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(value);
        }
      }}
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-panel-muted hover:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function useTabs(initial: string): [string, (value: string) => void] {
  const [value, setValue] = useState(initial);
  return [value, setValue];
}
