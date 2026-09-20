/**
 * Centimetres and inches, converted for display only.
 *
 * A chart is stored in the unit the founder typed it in. Converting at entry
 * is how a 91 cm chest gets saved as 91 inches; converting at display is a
 * pure function of a number, and the customer can flip the toggle as often as
 * they like without anything being written.
 */
import type { SizeChart, SizeChartRow, SizeUnit } from "@/lib/queries/catalog";

const CM_PER_IN = 2.54;

export function convert(value: number, from: SizeUnit, to: SizeUnit): number {
  if (from === to) return value;
  return from === "cm" ? value / CM_PER_IN : value * CM_PER_IN;
}

/** Half-inch precision in inches, whole cm in centimetres — what a tape reads. */
export function formatMeasure(value: number, unit: SizeUnit): string {
  if (unit === "in") return (Math.round(value * 2) / 2).toString();
  return Math.round(value).toString();
}

export function chartInUnit(chart: SizeChart, unit: SizeUnit): SizeChart {
  if (chart.unit === unit) return chart;
  const rows: SizeChartRow[] = chart.rows.map((r) => ({
    ...r,
    chest: convert(r.chest, chart.unit, unit),
    waist: convert(r.waist, chart.unit, unit),
    hip: convert(r.hip, chart.unit, unit),
    top_length: convert(r.top_length, chart.unit, unit),
    bottom_length: r.bottom_length == null ? r.bottom_length : convert(r.bottom_length, chart.unit, unit),
  }));
  return { unit, rows };
}

/** The customer's last choice, remembered per device. Never trusted for anything else. */
const KEY = "zisun.sizeUnit";
export function readPreferredUnit(): SizeUnit {
  try {
    const v = localStorage.getItem(KEY);
    return v === "in" ? "in" : "cm";
  } catch {
    return "cm";
  }
}
export function writePreferredUnit(unit: SizeUnit): void {
  try { localStorage.setItem(KEY, unit); } catch { /* private mode */ }
}
