import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "../../lib/cn";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function Dialog({ open, onClose, children }: DialogProps) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden="true" className="absolute inset-0 bg-foreground/30" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md rounded-lg border border-border bg-panel p-0 shadow-panel"
      >
        {children}
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute right-3 top-3 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export function DialogHeader({ className, ...props }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex flex-col gap-1.5 p-5 pr-16", className)} {...props} />;
}

export function DialogTitle({ className, ...props }: { className?: string; children: ReactNode; id?: string }) {
  const fallback = useId();
  return <h2 id={props.id ?? fallback} className={cn("font-display text-lg font-semibold", className)} {...props} />;
}

export function DialogDescription({ className, ...props }: { className?: string; children: ReactNode }) {
  return <p className={cn("text-sm leading-6 text-muted-foreground", className)} {...props} />;
}

export function DialogContent({ className, ...props }: { className?: string; children: ReactNode }) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex items-center justify-end gap-2 border-t border-border px-5 py-4", className)} {...props} />;
}
