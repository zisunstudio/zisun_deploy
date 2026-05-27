"use client";

import { useEffect, useState } from "react";
import { CheckCircle, XCircle, AlertCircle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastProps {
  id: string;
  message: string;
  type: ToastType;
  onDismiss: (id: string) => void;
}

const ICONS = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertCircle,
  info: Info,
};

const STYLES = {
  success: "bg-green-50 border-green-200 text-green-800",
  error: "bg-red-50 border-red-200 text-red-800",
  warning: "bg-amber-50 border-amber-200 text-amber-800",
  info: "bg-blue-50 border-blue-200 text-blue-800",
};

const ICON_STYLES = {
  success: "text-green-500",
  error: "text-red-500",
  warning: "text-amber-500",
  info: "text-blue-500",
};

const DURATION_MS = 4000;

export function Toast({ id, message, type, onDismiss }: ToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Mount with slight delay so CSS transition fires
    const show = setTimeout(() => setVisible(true), 10);
    const hide = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(id), 300);
    }, DURATION_MS);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, [id, onDismiss]);

  const Icon = ICONS[type];

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-2xl border shadow-lg text-sm font-medium
        transition-all duration-300 ease-in-out
        ${STYLES[type]}
        ${visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"}`}
    >
      <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${ICON_STYLES[type]}`} />
      <p className="flex-1 leading-snug">{message}</p>
      <button
        onClick={() => { setVisible(false); setTimeout(() => onDismiss(id), 300); }}
        className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
