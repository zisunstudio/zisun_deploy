"use client";

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  useRef,
} from "react";
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

  // `typeof window !== "undefined"` looks like the right guard for a portal
  // and is not. It is false on the server and true on the client's *first*
  // render, which is the hydration pass — so React found an extra portal child
  // the server never emitted and failed to hydrate, on every page, because
  // this provider sits in the root layout.
  //
  // A mounted flag is the guard that actually works: false during hydration on
  // both sides, flipped by an effect afterwards, so the portal appears on the
  // second render when there is no longer anything to match.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
      {mounted &&
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
