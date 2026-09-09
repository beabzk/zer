import { createContext, useContext, useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "../../lib/cn";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  closeLabel?: string;
  children: ReactNode;
}

interface DialogContextValue {
  titleId: string;
  descriptionId: string;
}

const DialogContext = createContext<DialogContextValue | null>(null);

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

export function Dialog({ open, onClose, closeLabel = "Close", children }: DialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = focusableElements(dialogRef.current);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden="true" className="absolute inset-0 bg-foreground/30" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="relative w-full max-w-md rounded-lg border border-border bg-panel p-0 shadow-panel"
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
        <DialogContext.Provider value={{ titleId, descriptionId }}>{children}</DialogContext.Provider>
      </div>
    </div>
  );
}

export function DialogHeader({ className, ...props }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex flex-col gap-1.5 p-5 pr-16", className)} {...props} />;
}

export function DialogTitle({ className, id, ...props }: { className?: string; children: ReactNode; id?: string }) {
  const fallback = useId();
  const context = useContext(DialogContext);
  return <h2 id={id ?? context?.titleId ?? fallback} className={cn("font-display text-lg font-semibold", className)} {...props} />;
}

export function DialogDescription({ className, id, ...props }: { className?: string; children: ReactNode; id?: string }) {
  const fallback = useId();
  const context = useContext(DialogContext);
  return <p id={id ?? context?.descriptionId ?? fallback} className={cn("text-sm leading-6 text-muted-foreground", className)} {...props} />;
}

export function DialogContent({ className, ...props }: { className?: string; children: ReactNode }) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex items-center justify-end gap-2 border-t border-border px-5 py-4", className)} {...props} />;
}
