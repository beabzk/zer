import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "../../lib/cn";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

// Contextual drawer on large screens, bottom sheet on small screens.
export function Sheet({ open, onClose, children }: SheetProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div aria-hidden="true" className="absolute inset-0 bg-foreground/30" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "absolute flex max-h-[92vh] flex-col border-border bg-panel shadow-panel",
          "inset-x-0 bottom-0 rounded-t-lg border-t",
          "sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[min(92vw,420px)] sm:rounded-l-lg sm:rounded-tr-none sm:border-l sm:border-t-0",
        )}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="absolute right-3 top-3 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Close
        </button>
        <div className="overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function SheetHeader({ className, ...props }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex flex-col gap-1.5 p-5 pr-16", className)} {...props} />;
}

export function SheetTitle({ className, ...props }: { className?: string; children: ReactNode }) {
  return <h2 className={cn("font-display text-lg font-semibold", className)} {...props} />;
}

export function SheetDescription({ className, ...props }: { className?: string; children: ReactNode }) {
  return <p className={cn("text-sm leading-6 text-muted-foreground", className)} {...props} />;
}

export function SheetContent({ className, ...props }: { className?: string; children: ReactNode }) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}

export function SheetFooter({ className, ...props }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex items-center justify-end gap-2 border-t border-border px-5 py-4", className)} {...props} />;
}
