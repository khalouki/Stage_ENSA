"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { useTranslation } from "@/components/i18n";

type ToastType = "success" | "error" | "warning" | "info";

type ToastInput = {
  message: string;
  type: ToastType;
  duration?: number;
};

type ToastItem = ToastInput & {
  id: string;
  leaving?: boolean;
};

type ToastContextValue = {
  showToast: (input: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
  error: <AlertCircle className="h-4 w-4 text-rose-500" />,
  warning: <TriangleAlert className="h-4 w-4 text-amber-500" />,
  info: <Info className="h-4 w-4 text-sky-500" />,
};

const BORDER: Record<ToastType, string> = {
  success: "border-emerald-300/60",
  error: "border-rose-300/60",
  warning: "border-amber-300/60",
  info: "border-sky-300/60",
};

const DEFAULT_DURATION = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Record<string, number>>({});
  const { t } = useTranslation();

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast)));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
      if (timersRef.current[id]) {
        window.clearTimeout(timersRef.current[id]);
        delete timersRef.current[id];
      }
    }, 220);
  }, []);

  const showToast = useCallback(
    ({ message, type, duration = DEFAULT_DURATION }: ToastInput) => {
      const normalized = message.trim();
      if (!normalized) return;

      setToasts((prev) => {
        const existing = prev.find((toast) => toast.message === normalized && toast.type === type && !toast.leaving);
        if (existing) {
          if (timersRef.current[existing.id]) {
            window.clearTimeout(timersRef.current[existing.id]);
          }
          timersRef.current[existing.id] = window.setTimeout(() => removeToast(existing.id), duration);
          return prev;
        }

        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        timersRef.current[id] = window.setTimeout(() => removeToast(id), duration);
        return [{ id, type, message: normalized }, ...prev].slice(0, 5);
      });
    },
    [removeToast]
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 z-[120] flex w-[min(92vw,380px)] flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-xl border bg-card/95 backdrop-blur p-3 shadow-lg transition-all duration-200 ${
              BORDER[toast.type]
            } ${toast.leaving ? "translate-x-4 opacity-0" : "translate-x-0 opacity-100"}`}
          >
            <div className="flex items-start gap-2">
              <div className="mt-0.5">{ICONS[toast.type]}</div>
              <p className="text-sm leading-5 text-foreground flex-1">{toast.message}</p>
              <button
                className="text-muted-foreground hover:text-foreground transition"
                onClick={() => removeToast(toast.id)}
                aria-label={t("commonCancel")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
