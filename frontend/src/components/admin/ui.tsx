"use client";
import Link from "next/link";
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { swatchStyle } from "@/lib/colours";

/**
 * The console's parts, in one place.
 *
 * The founder runs the shop from her phone. Every page here was first built
 * for a laptop and then squeezed, which is how a product's title ended up
 * under its own buttons and a SKU wrapped into four lines. These primitives
 * are phone-first: headers stack, actions wrap, tables scroll sideways in a
 * frame or give way to stacked rows, and every tap target is at least 40px.
 *
 * The console is a tool, so it is quiet: ink for the primary action, grey
 * for everything else, red only for destruction. The brand colour stays on
 * the storefront.
 */

// ── Page ─────────────────────────────────────────────────────────────────

export function Page({ title, description, actions, children, width = "default" }: {
  title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode; width?: "default" | "wide" | "narrow";
}) {
  const max = width === "wide" ? "max-w-7xl" : width === "narrow" ? "max-w-2xl" : "max-w-5xl";
  return (
    <div className={`px-4 py-5 sm:px-6 lg:px-8 lg:py-8 ${max}`}>
      <header className="mb-5 sm:mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-[22px] sm:text-2xl font-semibold text-gray-900 leading-tight">{title}</h1>
            {description && <p className="mt-1 text-sm text-gray-500 leading-snug max-w-prose">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2 sm:shrink-0">{actions}</div>}
        </div>
      </header>
      {children}
    </div>
  );
}

// ── Surfaces ─────────────────────────────────────────────────────────────

export function Card({ children, className = "", padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <div className={`bg-white rounded-xl border border-gray-200 ${padded ? "p-4 sm:p-5" : ""} ${className}`}>{children}</div>;
}

/**
 * A card's top strip: title and meta on the left, actions on the right on
 * a laptop and underneath on a phone. Nothing overlaps because nothing is
 * absolutely positioned.
 */
export function CardHeader({ title, meta, actions, href }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode; href?: string }) {
  const heading = <span className="font-semibold text-gray-900 leading-snug">{title}</span>;
  return (
    <div className="px-4 py-3 sm:px-5 border-b border-gray-100 bg-gray-50/60 rounded-t-xl">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {href ? <Link href={href} className="hover:underline underline-offset-2">{heading}</Link> : heading}
          {meta && <div className="text-xs text-gray-500 mt-0.5">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
      </div>
    </div>
  );
}

/**
 * A table that never pushes the page sideways. On a phone it scrolls inside
 * its own frame; the page behind it stays put. Give the table a min-width
 * so columns do not crush.
 */
export function TableScroll({ children, minWidth = 640 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="overflow-x-auto overscroll-x-contain">
      <div style={{ minWidth }}>{children}</div>
    </div>
  );
}

export const th = "px-3 sm:px-4 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap";
export const td = "px-3 sm:px-4 py-3 text-sm text-gray-800 align-middle";

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm font-medium text-gray-800">{title}</p>
      {body && <p className="mt-1 text-sm text-gray-500 max-w-sm mx-auto">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

// ── Controls ─────────────────────────────────────────────────────────────

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";
const VARIANT: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-ink/90 disabled:bg-ink/40",
  secondary: "bg-white text-gray-800 border border-gray-300 hover:bg-gray-50 disabled:text-gray-400",
  danger: "bg-white text-red-700 border border-red-200 hover:bg-red-50",
  ghost: "bg-transparent text-gray-700 hover:bg-gray-100",
};
const SIZE: Record<Size, string> = { sm: "h-9 px-3 text-xs", md: "h-10 px-4 text-sm" };
const base = "inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export function Button({ variant = "secondary", size = "md", className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type="button" className={`${base} ${VARIANT[variant]} ${SIZE[size]} ${className}`} {...rest} />;
}
export function LinkButton({ href, variant = "secondary", size = "md", className = "", children }: { href: string; variant?: Variant; size?: Size; className?: string; children: ReactNode }) {
  return <Link href={href} className={`${base} ${VARIANT[variant]} ${SIZE[size]} ${className}`}>{children}</Link>;
}

export const inputClass = "w-full h-10 rounded-lg border border-gray-300 bg-white px-3 text-[15px] sm:text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-ink/25 focus:border-ink disabled:bg-gray-50 disabled:text-gray-500";

export function Field({ label, hint, children, className = "" }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-sm font-medium text-gray-700 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-gray-500 mt-1">{hint}</span>}
    </label>
  );
}
export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputClass} ${className}`} {...rest} />;
}
export function Select({ className = "", ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${inputClass} ${className}`} {...rest} />;
}
export function Textarea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${inputClass} h-auto py-2 leading-relaxed resize-none ${className}`} {...rest} />;
}

// ── Small marks ──────────────────────────────────────────────────────────

/** Stock, coloured by how worried to be: none, a few, plenty. */
export function StockBadge({ n }: { n: number }) {
  const tone = n === 0 ? "bg-red-50 text-red-700" : n <= 5 ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700";
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ${tone}`}>{n}</span>;
}

export function Swatch({ colour, className = "" }: { colour: string | null | undefined; className?: string }) {
  if (!colour) return <span className="text-gray-400">—</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="inline-block h-3 w-3 rounded-full border border-black/10 shrink-0" style={swatchStyle(colour)} />
      <span className="truncate">{colour}</span>
    </span>
  );
}

/** A SKU: monospaced and never wrapped. Four-line SKUs are how this started. */
export function Sku({ children }: { children: ReactNode }) {
  return <span className="font-mono text-xs text-gray-700 whitespace-nowrap">{children}</span>;
}

export function Pill({ tone = "neutral", children }: { tone?: "neutral" | "good" | "warn" | "bad"; children: ReactNode }) {
  const t = { neutral: "bg-gray-100 text-gray-700", good: "bg-green-50 text-green-700", warn: "bg-amber-50 text-amber-700", bad: "bg-red-50 text-red-700" }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${t}`}>{children}</span>;
}
