"use client";
/**
 * The console's charts, drawn by hand in SVG.
 *
 * Built to the dataviz method rather than to taste: every colour is a token
 * from tailwind.config.ts `viz`, validated with the six-checks script against
 * the white chart surface; marks are thin (2px lines, bars <= 24px with a 4px
 * rounded data end, square at the baseline); gridlines are solid hairlines;
 * text wears ink and muted tokens, never the series colour; every chart has
 * a hover/focus readout and a "Show as table" twin, so no value is reachable
 * only by hovering. Values are inserted as React text, never as HTML.
 *
 * No chart library: the console runs on the founder's phone, and four small
 * components cost less than any library that draws them.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

// ── Formatting ───────────────────────────────────────────────────────────────

export const fmtInt = (n: number) => Math.round(n).toLocaleString("en-IN");
export const fmtRupees = (paise: number) => "₹" + Math.round(paise / 100).toLocaleString("en-IN");
/** Auto-compact for axis ticks and tile values: 1,284 / 12.9K / 4.2L. */
export const compact = (n: number) =>
  n >= 1e7 ? `${+(n / 1e7).toFixed(1)}Cr` : n >= 1e5 ? `${+(n / 1e5).toFixed(1)}L` : n >= 1e4 ? `${+(n / 1e3).toFixed(1)}K` : fmtInt(n);
export const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/** A clean axis maximum and 3-4 ticks: 0 / 50 / 100 / 150, never 0 / 47 / 94. */
function niceScale(max: number, target = 3): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 1, ticks: [0, 1] };
  const raw = max / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);
  return { top, ticks };
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    setW(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// ── Table twin ───────────────────────────────────────────────────────────────

export function TableView({ caption, columns, rows }: { caption: string; columns: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-3 group">
      <summary className="cursor-pointer select-none text-[11px] text-gray-500 hover:text-gray-900 underline underline-offset-2 w-fit">
        Show as table
      </summary>
      <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-gray-100">
        <table className="w-full text-xs">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-white"><tr>{columns.map((c, i) => <th key={c} className={`px-3 py-2 font-semibold text-gray-500 ${i ? "text-right" : "text-left"}`}>{c}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r, i) => (
              <tr key={i}>{r.map((v, j) => <td key={j} className={`px-3 py-1.5 text-gray-800 ${j ? "text-right tabular-nums" : ""}`}>{v}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

// ── Sparkline ────────────────────────────────────────────────────────────────

/** Trend in the de-emphasis grey; today's point in the accent. */
export function Sparkline({ values }: { values: number[] }) {
  const n = values.length;
  if (n < 2) return <div className="h-7" />;
  const max = Math.max(1, ...values);
  const W = 100, H = 28, pad = 3;
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join("");
  return (
    <div className="relative h-7 w-full" aria-hidden>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
        <path d={d} fill="none" className="stroke-viz-prev" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* The end dot sits in HTML, placed in percentages: inside the stretched
          SVG it would be squashed into an oval. */}
      <span
        className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-viz-accent ring-2 ring-white"
        style={{ left: "100%", top: `${(y(values[n - 1]) / H) * 100}%` }}
      />
    </div>
  );
}

// ── Stat tile ────────────────────────────────────────────────────────────────

/**
 * label · value · delta vs the previous period · sparkline. Selectable: the
 * trend chart below plots whichever tile is pressed. Up is good for every
 * figure on this board; the delta carries an arrow and a sign, never colour
 * alone.
 */
export function StatTile({ label, value, current, previous, series, note, selected, onSelect }: {
  label: string; value: string; current: number; previous: number; series: number[];
  note?: string; selected?: boolean; onSelect?: () => void;
}) {
  const change = previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;
  const Icon = change == null ? null : change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;
  const tone = change == null || change === 0 ? "text-gray-500" : change > 0 ? "text-green-800" : "text-red-700";
  const Tag = onSelect ? "button" : "div";
  return (
    <Tag
      {...(onSelect ? { type: "button" as const, onClick: onSelect, "aria-pressed": !!selected } : {})}
      className={`text-left rounded-xl border bg-white p-3.5 sm:p-4 flex flex-col gap-1 transition-colors ${
        selected ? "border-ink ring-1 ring-ink" : "border-gray-200 hover:border-gray-400"
      }`}
    >
      <span className="text-xs text-gray-600">{label}</span>
      <span className={`text-[24px] sm:text-[26px] leading-none font-semibold ${current === 0 ? "text-gray-400" : "text-gray-900"}`}>{value}</span>
      <span className="flex items-center justify-between gap-2 min-h-[16px]">
        {change == null
          ? <span className="text-[11px] text-gray-500">{previous === 0 && current > 0 ? "new this period" : "no earlier data"}</span>
          : <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${tone}`}>
              {Icon && <Icon className="w-3.5 h-3.5" aria-hidden />}{change > 0 ? "+" : ""}{change}%
              <span className="font-normal text-gray-500 ml-1">vs before</span>
            </span>}
      </span>
      <Sparkline values={series} />
      {note && <span className="text-[11px] text-gray-500 leading-snug">{note}</span>}
    </Tag>
  );
}

// ── Trend chart ──────────────────────────────────────────────────────────────

type Point = { date: string; value: number };

/**
 * One metric over the window (accent line + 10% wash) against the same
 * number of days before it (grey line) - emphasis, not two competing
 * series, and one axis only. A crosshair snaps to the nearest day and reads
 * out both; arrow keys do the same from the keyboard.
 */
export function TrendChart({ label, points, previous, format, currentName, previousName, height = 190 }: {
  label: string; points: Point[]; previous?: Point[]; format: (n: number) => string;
  currentName: string; previousName: string; height?: number;
}) {
  const [wrap, width] = useWidth<HTMLDivElement>();
  const [idx, setIdx] = useState<number | null>(null);
  const titleId = useId();
  const n = points.length;
  const M = { top: 14, right: 12, bottom: 24, left: 40 };
  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = height - M.top - M.bottom;
  const max = Math.max(0, ...points.map((p) => p.value), ...(previous ?? []).map((p) => p.value));
  const { top, ticks } = niceScale(max);
  const x = (i: number) => M.left + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2);
  const y = (v: number) => M.top + plotH - (v / top) * plotH;
  const path = (ps: Point[]) => ps.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const area = n > 1 ? `${path(points)}L${x(n - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z` : "";
  const xTicks = n > 1 ? Array.from(new Set([0, Math.floor((n - 1) / 2), n - 1])) : [0];
  const total = points.reduce((s, p) => s + p.value, 0);
  const prevTotal = (previous ?? []).reduce((s, p) => s + p.value, 0);
  const active = idx != null && idx >= 0 && idx < n ? idx : null;

  const onMove = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const px = e.clientX - r.left - M.left;
    if (n < 1 || plotW <= 0) return;
    setIdx(Math.max(0, Math.min(n - 1, Math.round((px / plotW) * (n - 1)))));
  };
  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (!["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(k)) return;
    e.preventDefault();
    if (k === "Escape") return setIdx(null);
    setIdx((cur) => {
      const c = cur ?? n - 1;
      return k === "Home" ? 0 : k === "End" ? n - 1 : Math.max(0, Math.min(n - 1, c + (k === "ArrowLeft" ? -1 : 1)));
    });
  };

  return (
    <figure className="m-0" aria-labelledby={titleId}>
      <figcaption id={titleId} className="sr-only">{`${label}: ${format(total)} over ${n} days, against ${format(prevTotal)} the ${n} days before.`}</figcaption>
      {/* Legend: two series, so it is always present; line keys mirror the marks. */}
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-600">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-viz-accent" aria-hidden />{currentName}</span>
        {previous && <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-viz-prev" aria-hidden />{previousName}</span>}
      </div>
      <div
        ref={wrap}
        className="relative w-full outline-none focus-visible:ring-2 focus-visible:ring-ink/30 rounded-md touch-pan-y"
        style={{ height }}
        tabIndex={0}
        role="group"
        aria-label={`${label} by day. Use the arrow keys to read each day.`}
        onPointerMove={onMove}
        onPointerDown={onMove}
        // A finger lifting fires "leave" too; on touch the readout stays on
        // the tapped day until she taps elsewhere (blur). Only a mouse
        // leaving the chart clears it.
        onPointerLeave={(e) => { if (e.pointerType === "mouse") setIdx(null); }}
        onFocus={() => setIdx((c) => c ?? n - 1)}
        onBlur={() => setIdx(null)}
        onKeyDown={onKey}
      >
        {width > 0 && (
          <svg width={width} height={height} className="block" aria-hidden>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} className={t === 0 ? "stroke-viz-axis" : "stroke-viz-grid"} strokeWidth={1} shapeRendering="crispEdges" />
                <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-gray-500 text-[10px] tabular-nums">{compact(t)}</text>
              </g>
            ))}
            {xTicks.map((i) => (
              <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="fill-gray-500 text-[10px]">{fmtDay(points[i].date)}</text>
            ))}
            {previous && previous.length === n && n > 1 && (
              <path d={path(previous)} fill="none" className="stroke-viz-prev" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            )}
            {n > 1 && <path d={area} className="fill-viz-accent/10" />}
            {n > 1 && <path d={path(points)} fill="none" className="stroke-viz-accent" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
            {/* The one direct label: today's value at the line's end. */}
            {n > 0 && active == null && (
              <>
                <circle cx={x(n - 1)} cy={y(points[n - 1].value)} r={4} className="fill-viz-accent stroke-white" strokeWidth={2} />
                <text x={x(n - 1) - 8} y={y(points[n - 1].value) - 9} textAnchor="end" className="fill-gray-900 text-[11px] font-semibold">{format(points[n - 1].value)}</text>
              </>
            )}
            {active != null && (
              <>
                <line x1={x(active)} x2={x(active)} y1={M.top} y2={M.top + plotH} className="stroke-gray-400" strokeWidth={1} shapeRendering="crispEdges" />
                {previous && previous[active] && <circle cx={x(active)} cy={y(previous[active].value)} r={4} className="fill-viz-prev stroke-white" strokeWidth={2} />}
                <circle cx={x(active)} cy={y(points[active].value)} r={4} className="fill-viz-accent stroke-white" strokeWidth={2} />
              </>
            )}
          </svg>
        )}
        {active != null && width > 0 && (
          <div
            className="pointer-events-none absolute top-0 z-10 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm text-xs min-w-[140px]"
            // Beside the crosshair, on the side with room - never over the
            // point being read. 150 is the tooltip's width budget.
            style={x(active) > width / 2
              ? { left: Math.max(0, x(active) - 160) }
              : { left: Math.min(x(active) + 10, Math.max(0, width - 150)) }}
            role="status"
          >
            <p className="flex items-center gap-2"><span className="h-0.5 w-3 rounded bg-viz-accent" aria-hidden /><span className="font-semibold text-gray-900">{format(points[active].value)}</span><span className="text-gray-500">{fmtDay(points[active].date)}</span></p>
            {previous && previous[active] && (
              <p className="mt-1 flex items-center gap-2"><span className="h-0.5 w-3 rounded bg-viz-prev" aria-hidden /><span className="font-semibold text-gray-900">{format(previous[active].value)}</span><span className="text-gray-500">{fmtDay(previous[active].date)}</span></p>
            )}
          </div>
        )}
      </div>
      <TableView
        caption={`${label} by day`}
        columns={["Day", currentName, ...(previous ? [previousName] : [])]}
        rows={points.map((p, i) => [fmtDay(p.date), format(p.value), ...(previous ? [previous[i] ? `${format(previous[i].value)} (${fmtDay(previous[i].date)})` : "—"] : [])])}
      />
    </figure>
  );
}

// ── Bar list ─────────────────────────────────────────────────────────────────

export type BarRow = { key: string; label: string; value: number; detail?: string };

/**
 * Horizontal bars for nominal categories: one colour for every bar (the
 * title names the series), value at the tip, detail on hover or focus.
 * Colouring bars by their size would spend the identity channel re-saying
 * what length already shows.
 */
export function BarList({ rows, format = fmtInt, caption, valueName = "Value", empty = "Nothing yet." }: {
  rows: BarRow[]; format?: (n: number) => string; caption: string; valueName?: string; empty?: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(0, ...rows.map((r) => r.value));
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (rows.length === 0) return <p className="text-sm text-gray-500">{empty}</p>;
  return (
    <div>
      <ul className="space-y-2.5">
        {rows.map((r) => {
          const w = max > 0 ? (r.value / max) * 100 : 0;
          const on = hover === r.key;
          return (
            <li
              key={r.key}
              tabIndex={0}
              className="group outline-none rounded-md focus-visible:ring-2 focus-visible:ring-ink/25"
              onPointerEnter={() => setHover(r.key)} onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(r.key)} onBlur={() => setHover(null)}
            >
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-gray-800 min-w-0 truncate">{r.label}</span>
                <span className="shrink-0 text-gray-900 font-semibold">
                  {format(r.value)}
                  {on && total > 0 && <span className="ml-1.5 font-normal text-xs text-gray-500">{Math.round((r.value / total) * 100)}% of all</span>}
                </span>
              </div>
              <div className="mt-1 h-2.5 w-full">
                <div
                  className={`h-full rounded-r-[4px] bg-viz-accent transition-opacity ${hover && !on ? "opacity-40" : ""}`}
                  style={{ width: `${r.value > 0 ? Math.max(1.5, w) : 0}%` }}
                />
              </div>
              {on && r.detail && <p className="mt-1 text-[11px] text-gray-500">{r.detail}</p>}
            </li>
          );
        })}
      </ul>
      <TableView caption={caption} columns={["", valueName, "Share"]} rows={rows.map((r) => [r.label, format(r.value), total ? `${Math.round((r.value / total) * 100)}%` : "—"])} />
    </div>
  );
}

// ── Funnel ───────────────────────────────────────────────────────────────────

const RAMP = ["bg-viz-1", "bg-viz-2", "bg-viz-3", "bg-viz-4", "bg-viz-5"];

/**
 * Ordered stages take the ordinal ramp - one hue, light to dark - so the
 * order reads in the colour; each stage says what share of the one before
 * it made it through, which is where the leak shows.
 */
export function Funnel({ stages, caption }: { stages: { key: string; label: string; count: number; baseLabel?: string; base?: number }[]; caption: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...stages.map((s) => s.count));
  const ramp = useMemo(() => {
    // Spread the stages across the ramp so three stages still span light -> dark.
    const k = stages.length;
    return stages.map((_, i) => RAMP[k <= 1 ? RAMP.length - 1 : Math.round((i * (RAMP.length - 1)) / (k - 1))]);
  }, [stages]);
  return (
    <div>
      <ol className="space-y-3">
        {stages.map((s, i) => {
          const share = s.base != null && s.base > 0 ? Math.round((s.count / s.base) * 100) : null;
          const on = hover === s.key;
          return (
            <li key={s.key} tabIndex={0} className="outline-none rounded-md focus-visible:ring-2 focus-visible:ring-ink/25"
              onPointerEnter={() => setHover(s.key)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(s.key)} onBlur={() => setHover(null)}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-gray-800">
                  {s.label}
                  {share != null && <span className="ml-2 text-xs text-gray-500">{share}% of {s.baseLabel}</span>}
                </span>
                <span className="text-sm font-semibold text-gray-900">{fmtInt(s.count)}</span>
              </div>
              <div className="mt-1.5 h-3 w-full">
                <div className={`h-full rounded-r-[4px] ${ramp[i]} transition-opacity ${hover && !on ? "opacity-40" : ""}`}
                  style={{ width: `${s.count > 0 ? Math.max(1.5, (s.count / max) * 100) : 0}%` }} />
              </div>
              {on && s.base != null && s.base > s.count && (
                <p className="mt-1 text-[11px] text-gray-500">{fmtInt(s.base - s.count)} did not go on from {s.baseLabel}.</p>
              )}
            </li>
          );
        })}
      </ol>
      <TableView caption={caption} columns={["Stage", "Count", "Carried on"]}
        rows={stages.map((s) => [s.label, fmtInt(s.count), s.base != null && s.base > 0 ? `${Math.round((s.count / s.base) * 100)}% of ${s.baseLabel}` : "—"])} />
    </div>
  );
}
