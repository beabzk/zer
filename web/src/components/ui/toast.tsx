import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";

export interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant?: "neutral" | "success" | "destructive";
}

interface ToastContextValue {
  toasts: ToastItem[];
  push: (toast: Omit<ToastItem, "id">) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

export function ToastProvider({ children, dismissLabel = "Dismiss notification" }: { children: ReactNode; dismissLabel?: string }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<ToastItem, "id">) => {
      const id = nextId++;
      setToasts((current) => [...current.slice(-3), { ...toast, id }]);
      window.setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex w-[min(92vw,380px)] -translate-x-1/2 flex-col gap-2">
        {toasts.map((item) => (
          <div
            key={item.id}
            role={item.variant === "destructive" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto rounded-md border px-4 py-3 text-sm shadow-panel",
              item.variant === "success" && "border-success bg-success-soft text-success",
              item.variant === "destructive" && "border-destructive/30 bg-destructive/10 text-destructive",
              (!item.variant || item.variant === "neutral") && "border-border bg-panel text-foreground",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{item.title}</p>
                {item.description && <p className="mt-1 text-xs leading-5 opacity-80">{item.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label={dismissLabel}
                title={dismissLabel}
                className="rounded px-1 text-xs opacity-60 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return ctx;
}
