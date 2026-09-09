import { createContext, useContext, useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "../../lib/cn";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  closeLabel?: string;
  children: ReactNode;
}

interface SheetContextValue {
  titleId: string;
}

const SheetContext = createContext<SheetContextValue | null>(null);

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

// Contextual drawer on large screens, bottom sheet on small screens.
export function Sheet({ open, onClose, closeLabel = "Close", children }: SheetProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !sheetRef.current) return;
      const focusable = focusableElements(sheetRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      restoreRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div aria-hidden="true" className="absolute inset-0 bg-foreground/30" onClick={onClose} />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
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
          aria-label={closeLabel}
          title={closeLabel}
          className="absolute right-3 top-3 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <span aria-hidden="true">×</span>
        </button>
        <div className="overflow-y-auto">
          <SheetContext.Provider value={{ titleId }}>{children}</SheetContext.Provider>
        </div>
      </div>
    </div>
  );
}

export function SheetHeader({ className, ...props }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex flex-col gap-1.5 p-5 pr-16", className)} {...props} />;
}

export function SheetTitle({ className, id, ...props }: { className?: string; children: ReactNode; id?: string }) {
  const fallback = useId();
  const context = useContext(SheetContext);
  return <h2 id={id ?? context?.titleId ?? fallback} className={cn("font-display text-lg font-semibold", className)} {...props} />;
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
