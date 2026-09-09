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
  onKeyDown,
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
      tabIndex={active ? 0 : -1}
      data-tab-value={value}
      onClick={() => onSelect(value)}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(value);
          return;
        }
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        const tablist = event.currentTarget.closest('[role="tablist"]');
        const tabs = tablist ? Array.from(tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])')) : [];
        const current = tabs.indexOf(event.currentTarget);
        if (current < 0 || tabs.length === 0) return;
        event.preventDefault();
        const nextIndex = event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        const next = tabs[nextIndex];
        next.focus();
        const nextValue = next.dataset.tabValue;
        if (nextValue) onSelect(nextValue);
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
