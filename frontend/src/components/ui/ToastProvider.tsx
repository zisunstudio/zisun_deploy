"use client";

import { createContext, useContext, useCallback, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Toast, ToastType } from "./Toast";

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = `toast-${++counter.current}`;
    setToasts((prev) => [...prev.slice(-4), { id, message, type }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {typeof window !== "undefined" &&
        createPortal(
          <div
            aria-live="polite"
            aria-atomic="false"
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 w-[min(calc(100vw-2rem),24rem)] pointer-events-none"
          >
            {toasts.map((t) => (
              <div key={t.id} className="pointer-events-auto">
                <Toast id={t.id} message={t.message} type={t.type} onDismiss={dismiss} />
              </div>
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}
