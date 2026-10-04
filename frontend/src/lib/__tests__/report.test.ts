import { describe, expect, it } from "vitest";
import { buildReport, change, type ReportInput } from "@/lib/report/build";
import { reportToMarkdown, tableToMarkdown } from "@/lib/report/markdown";
import { forPdf, reportToPdfBytes } from "@/lib/report/pdf";

const row = (date: string, sessions: number, opens: number, bag: number, orders: number, collected: number) =>
  ({ date, sessions, opens, bag_adds: bag, impressions: opens * 3, enquiries: 1, orders, collected_paise: collected, committed_paise: 0 });

const INPUT: ReportInput = {
  meta: { window_start: "2026-09-28", window_days: 7, generated_at: "2026-10-04T07:00:00Z", launch_mode: "live" },
  series: {
    current: [row("2026-09-28", 40, 12, 1, 0, 0), row("2026-09-29", 60, 20, 2, 1, 134900), row("2026-09-30", 30, 8, 0, 0, 0), row("2026-10-01", 25, 6, 1, 0, 0), row("2026-10-02", 35, 9, 0, 1, 111900), row("2026-10-03", 50, 15, 2, 0, 0), row("2026-10-04", 45, 14, 1, 0, 0)],
    previous: [row("2026-09-21", 20, 5, 0, 0, 0), row("2026-09-22", 20, 5, 0, 0, 0), row("2026-09-23", 20, 5, 1, 0, 0), row("2026-09-24", 20, 5, 0, 0, 0), row("2026-09-25", 20, 5, 0, 0, 0), row("2026-09-26", 20, 5, 0, 0, 0), row("2026-09-27", 20, 5, 0, 0, 0)],
  },
  attention_items: [{ severity: "warn", title: "One size is nearly gone.", body: "Teal Blue Co-ord Set has 1 left in M." }],
  insight: "Red Ikkat Co-ord Set is getting the most attention.",
  whatsapp: { enquiries_window: 7, ordered_window: 1, revenue_window_paise: 134900, unanswered: 0 },
  commerce: {
    orders_all_time: 5, customers: 4, by_payment_method: { COD: { orders: 1, revenue: 111900 }, RAZORPAY: { orders: 1, revenue: 134900 } },
    by_status: { PAID: 1, PAYMENT_PENDING: 1, CANCELLED: 3 },
    money: { collected_paise: 134900, committed_paise: 111900, lost_paise: 159900, orders: 2 },
    payment: { attempted: 3, succeeded: 1, failed: 1, abandoned: 1, in_flight: 0, mismatched: 0 },
  },
  behaviour: {
    recording_since: "2026-10-04T05:00:00Z", visits: 45, page_views: 98, one_page_visits: 27, glanced_and_left: 11, home_visits: 36,
    landing: [{ page: "home", visits: 36, share: 0.8 }, { page: "product", visits: 9, share: 0.2 }],
    pages: [{ page: "home", views: 40, visits: 36, median_seconds: 21, read_half: 0.4, read_to_end: 0.1 }, { page: "product", views: 44, visits: 20, median_seconds: 75, read_half: 0.6, read_to_end: 0.2 }],
    home_sections: [{ section: "hero", visits: 36, share: 1 }, { section: "drop", visits: 25, share: 0.6944 }, { section: "fit", visits: 14, share: 0.3889 }],
    clicks: [{ name: "drop_swipe", taps: 20, visits: 20 }, { name: "fit_find_size", taps: 4, visits: 4 }, { name: "something_new", taps: 1, visits: 1 }],
  },
  acquisition: { partial: true, by_source: [
    { source: "ig", sessions: 120, visitors: 100, orders: 1, collected_paise: 134900, committed_paise: 0, conversion: 0.008 },
    { source: "instagram", sessions: 30, visitors: 28, orders: 0, collected_paise: 0, committed_paise: 0, conversion: 0 },
    { source: "direct", sessions: 60, visitors: 20, orders: 1, collected_paise: 0, committed_paise: 111900, conversion: 0.016 },
    { source: "not recorded", sessions: 75, visitors: 70, orders: 0, collected_paise: 0, committed_paise: 0, conversion: 0 },
  ] },
  attention: {
    funnel: [{ key: "shown", label: "Products shown", count: 252 }, { key: "opened", label: "Product opened", count: 84 }, { key: "bag", label: "Added to bag", count: 7 }, { key: "ordered", label: "Ordered", count: 2 }],
    products: [
      { name: "Red Ikkat Co-ord Set", impressions: 120, views: 40, add_to_cart: 4, whatsapp_clicks: 3, orders: 1, units_sold: 1, revenue_paise: 111900, stock_left: 3, gap: { from: "Opened", to: "Bag or buy now", from_count: 40, lost: 36 } },
      { name: "Teal Blue Co-ord Set", impressions: 90, views: 30, add_to_cart: 3, whatsapp_clicks: 2, orders: 1, units_sold: 1, revenue_paise: 134900, stock_left: 4, gap: null },
    ],
  },
  inventory: { units: 24, variants: 21, by_size: [{ size: "M", variants: 5, units: 5 }, { size: "L", variants: 5, units: 6 }], low_stock: [{ product: "Teal Blue Co-ord Set", size: "M", colour: "Teal", sku: "ZS-TEL-M", stock: 1 }], low_stock_threshold: 5 },
};
const NOW = new Date("2026-10-04T07:00:00Z");

describe("the downloadable report", () => {
  const r = buildReport(INPUT, NOW);
  const find = (title: string) => r.sections.find((s) => s.title.startsWith(title))!;

  it("names its period from the board's own window", () => {
    expect(r.period).toBe("28 Sept to 4 Oct 2026 (7 days)".replace("Sept", new Date("2026-09-28T00:00:00").toLocaleDateString("en-IN", { month: "short" })));
    expect(r.stamp).toBe("2026-10-04");
  });

  it("adds up the headline from the daily series, never from a second source", () => {
    const head = find("The headline numbers").table!;
    expect(head.rows[0]).toEqual(["Visits", "285", "140", "+104%"]);
    expect(head.rows[5][1]).toBe("₹2,468");
  });

  it("keeps collected and owed apart", () => {
    const money = find("Orders and money").table!.rows.map((x) => x.join(" "));
    expect(money).toContain("Collected (money that has arrived) ₹1,349");
    expect(money).toContain("Owed (cash on delivery, not yet handed over) ₹1,119");
  });

  it("merges ig and instagram, and names sources in plain words", () => {
    const rows = find("Where visitors came from").table!.rows;
    expect(rows[0]).toEqual(["Instagram", "150", "128", "1", "₹1,349"]);
    expect(rows.map((x) => x[0])).toEqual(["Instagram", "Before tracking started", "Typed in or saved link"]);
  });

  it("never shows a developer's key: unknown ones are at least put in words", () => {
    const taps = find("What they tapped").table!.rows.map((x) => x[0]);
    expect(taps).toEqual(["Swiped the drop row", "\"Find your size\"", "something new"]);
    expect(find("Orders by status").table!.rows.map((x) => x[0])).toEqual(["Paid", "Payment pending", "Cancelled"]);
  });

  it("says when behaviour covers fewer days than the rest", () => {
    expect(r.caveats.some((c) => c.includes("only been recorded since"))).toBe(true);
    expect(r.caveats.at(-1)).toBe("This report contains no customer names, phone numbers or addresses.");
  });

  it("survives a board with panels missing", () => {
    const bare = buildReport({ meta: { window_days: 30 } }, NOW);
    expect(bare.sections).toEqual([]);
    expect(reportToMarkdown(bare)).toContain("## My question");
  });

  it("change() does not divide by nothing", () => {
    expect(change(5, 0)).toBe("new");
    expect(change(0, 0)).toBe("-");
    expect(change(10, 10)).toBe("same");
    expect(change(5, 10)).toBe("-50%");
  });

  it("writes Markdown an assistant can read: instructions first, question last", () => {
    const md = reportToMarkdown(r);
    expect(md.indexOf("## What I need from you")).toBeLessThan(md.indexOf("## The numbers"));
    expect(md.trimEnd().endsWith("give me the summary described above.)")).toBe(true);
    expect(md).toContain("Use only the numbers in this file");
    expect(md).toContain("| Instagram | 150 | 128 | 1 | ₹1,349 |");
    expect(md).not.toMatch(/undefined|NaN|\[object/);
  });

  it("escapes a pipe so a piece's name cannot break a table", () => {
    expect(tableToMarkdown({ columns: ["Piece", "n"], rows: [["Kurta | Palazzo", 2]] })).toContain("| Kurta / Palazzo | 2 |");
  });

  it("writes rupees a PDF's built-in font can draw", () => {
    expect(forPdf("₹1,349")).toBe("Rs 1,349");
    expect(forPdf("shown → opened")).toBe("shown to opened");
    expect(forPdf("“Failed” – it’s…")).toBe("\"Failed\" - it's...");
  });

  it("makes a real PDF", async () => {
    const bytes = new Uint8Array(await reportToPdfBytes(r));
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(5000);
    if (process.env.REPORT_OUT) {
      const fs = await import("fs");
      fs.writeFileSync(`${process.env.REPORT_OUT}/sample.pdf`, bytes);
      fs.writeFileSync(`${process.env.REPORT_OUT}/sample.md`, reportToMarkdown(r));
    }
  });
});
