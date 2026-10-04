/**
 * The console's numbers as one document: a title, a period, and sections of
 * small tables.
 *
 * Built from the dashboard payload the Analytics page already holds, so the
 * report says exactly what the board says and costs no request. Two
 * renderers read it: `markdown.ts` (a file to hand to ChatGPT, Claude or
 * Gemini) and `pdf.ts` (a file to send to a person). Neither does any
 * arithmetic of its own - a number that differs between the PDF, the
 * Markdown and the screen would be a second source of truth.
 *
 * It contains no customer names, phone numbers or addresses: the dashboard
 * is aggregates only, and that is stated at the foot of both files because
 * the whole point is that she can pass them to someone outside the shop.
 */
import { CLICK, PAGE, SECTION, label, mergeSources, sourceName, type SourceRow } from "./labels";

type SeriesRow = { date: string; sessions: number; opens: number; bag_adds: number; impressions: number; enquiries: number; orders: number; collected_paise: number; committed_paise: number };

/** The parts of the dashboard payload the report reads. Everything is optional-tolerant: a missing panel is a missing section, never a crash. */
export type ReportInput = {
  series?: { current: SeriesRow[]; previous: SeriesRow[] };
  meta: { window_start?: string; window_days: number; generated_at?: string; launch_mode?: string; errors?: string[] };
  attention_items?: Array<{ severity: string; title: string; body: string }>;
  insight?: string | null;
  whatsapp?: { enquiries_window: number; ordered_window: number; revenue_window_paise: number; unanswered: number };
  commerce?: {
    orders_all_time: number;
    by_payment_method?: Record<string, { orders: number; revenue: number }>;
    by_status?: Record<string, number>;
    customers?: number;
    money: { collected_paise: number; committed_paise: number; lost_paise: number; refunded_paise?: number; orders: number };
    payment: { attempted: number; succeeded: number; failed: number; abandoned: number; in_flight: number; mismatched: number };
  };
  behaviour?: {
    recording_since: string | null; visits: number; page_views: number; one_page_visits: number; glanced_and_left: number;
    landing: { page: string; visits: number; share: number | null }[];
    pages: { page: string; views: number; visits: number; median_seconds: number | null; read_half: number | null; read_to_end: number | null }[];
    home_sections: { section: string; visits: number; share: number | null }[];
    home_visits: number;
    clicks: { name: string; taps: number; visits: number }[];
  };
  acquisition?: { by_source: SourceRow[]; partial: boolean };
  attention?: {
    funnel?: { key: string; label: string; count: number }[];
    size_guide_opens?: number;
    products?: Array<{
      name: string; impressions: number; views: number; views_from_cards?: number; add_to_cart: number; whatsapp_clicks: number;
      orders?: number; units_sold?: number; revenue_paise?: number; stock_left?: number;
      gap?: { from: string; to: string; from_count: number; lost: number } | null;
    }>;
  };
  inventory?: { units: number; variants: number; by_size: { size: string; variants: number; units: number }[]; low_stock: { product: string; size: string; colour?: string; sku: string; stock: number }[]; low_stock_threshold: number };
};

export type Table = { columns: string[]; rows: (string | number)[][] };
export type Section = { title: string; note?: string; table?: Table; lines?: string[] };
export type Report = {
  shop: string;
  title: string;
  /** "28 Sep to 4 Oct 2026 (7 days)" */
  period: string;
  days: number;
  generated: string;
  /** For file names: 2026-10-04 */
  stamp: string;
  definitions: [string, string][];
  sections: Section[];
  caveats: string[];
};

const int = (n: number | null | undefined) => Math.round(n ?? 0).toLocaleString("en-IN");
const rs = (paise: number | null | undefined) => "₹" + Math.round((paise ?? 0) / 100).toLocaleString("en-IN");
const pct = (r: number | null | undefined) => (r == null ? "-" : `${Math.round(r * 100)}%`);
const secs = (s: number | null | undefined) => (s == null ? "-" : s < 60 ? `${Math.round(s)} sec` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} sec`);
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const words = (s: string) => { const t = s.replace(/_/g, " ").toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };

/** "+25%", "-10%", "same", or "new" when there was nothing before to compare with. */
export function change(now: number, before: number): string {
  if (before <= 0) return now > 0 ? "new" : "-";
  const c = Math.round(((now - before) / before) * 100);
  return c === 0 ? "same" : `${c > 0 ? "+" : ""}${c}%`;
}

export const DEFINITIONS: [string, string][] = [
  ["Visit", "One sitting by one visitor on the website. The same person coming back later is a new visit."],
  ["Shown", "A piece's card was on a visitor's screen for about half a second or more."],
  ["Opened", "A visitor opened that piece's own page."],
  ["Added to bag", "A visitor put a piece in her bag, or tapped Buy now."],
  ["WhatsApp tap", "A tap on a WhatsApp button. The site cannot see whether a message was actually sent."],
  ["Order", "An order that was placed and not cancelled."],
  ["Collected", "Money that has actually arrived: prepaid orders that were paid, and cash-on-delivery orders that were delivered."],
  ["Owed", "Cash on delivery that has been ordered but not yet handed over by the courier. Not counted as collected."],
  ["Glanced and left", "A visit that saw one page for under 10 seconds and tapped nothing."],
];

export function buildReport(d: ReportInput, now: Date = new Date()): Report {
  const days = d.meta.window_days;
  const cur = d.series?.current ?? [];
  const prev = d.series?.previous ?? [];
  const sum = (rows: SeriesRow[], k: keyof SeriesRow) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const stampDate = new Date(now.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10); // India date
  const from = d.meta.window_start ?? cur[0]?.date ?? stampDate;
  const year = new Date(`${stampDate}T00:00:00`).getFullYear();
  const period = `${day(from)} to ${day(stampDate)} ${year} (${days} days)`;
  const generated = now.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) + " India time";

  const sections: Section[] = [];
  const caveats: string[] = [];

  // 1. Headline
  if (cur.length) {
    const head: [string, keyof SeriesRow, boolean][] = [
      ["Visits", "sessions", false], ["Pieces opened", "opens", false], ["Added to bag", "bag_adds", false],
      ["WhatsApp taps", "enquiries", false], ["Orders", "orders", false], ["Collected", "collected_paise", true],
    ];
    sections.push({
      title: "The headline numbers",
      note: `These ${days} days, against the ${days} days before them.`,
      table: {
        columns: ["", `These ${days} days`, `The ${days} days before`, "Change"],
        rows: [
          ...head.map(([name, k, money]) => [name, money ? rs(sum(cur, k)) : int(sum(cur, k)), money ? rs(sum(prev, k)) : int(sum(prev, k)), change(sum(cur, k), sum(prev, k))]),
          ["Owed (cash on delivery, not yet handed over)", rs(sum(cur, "committed_paise")), rs(sum(prev, "committed_paise")), change(sum(cur, "committed_paise"), sum(prev, "committed_paise"))],
        ],
      },
    });
  }

  // 2. What the console itself flags
  const flags = [...(d.attention_items ?? []).map((a) => `${a.title} ${a.body}`.trim()), ...(d.insight ? [d.insight] : [])];
  if (flags.length) sections.push({ title: "What the console is flagging", lines: flags });

  // 3. Where visitors came from
  const sources = mergeSources(d.acquisition?.by_source ?? []);
  if (sources.length) {
    sections.push({
      title: "Where visitors came from",
      note: "Each visit is counted once, under where that visitor first came from.",
      table: {
        columns: ["Source", "Visits", "People", "Orders", "Collected"],
        rows: sources.map((s) => [sourceName(s.source), int(s.sessions), int(s.visitors), int(s.orders), rs(s.collected_paise)]),
      },
    });
    if (d.acquisition?.partial) caveats.push("\"Before tracking started\" means visits and orders from before 23 Sept 2026, when the site began noting where each visitor came from. They are unknown, not direct.");
  }

  // 4-7. What visitors did
  const b = d.behaviour;
  if (b && b.visits > 0) {
    const stayed = b.visits - b.one_page_visits;
    sections.push({
      title: "Arrivals",
      table: {
        columns: ["", "Visits", "Share"],
        rows: [
          ["All visits", int(b.visits), "100%"],
          ["Opened a second page", int(stayed), pct(stayed / b.visits)],
          ["Saw one page only", int(b.one_page_visits), pct(b.one_page_visits / b.visits)],
          ["Glanced and left (under 10 seconds, nothing tapped)", int(b.glanced_and_left), pct(b.glanced_and_left / b.visits)],
        ],
      },
    });
    if (b.landing.length) sections.push({
      title: "The first page visitors saw",
      table: { columns: ["First page", "Visits", "Share of visits"], rows: b.landing.map((l) => [label(PAGE, l.page), int(l.visits), pct(l.share)]) },
    });
    if (b.home_sections.length) sections.push({
      title: "How far down the home page they got",
      note: `Of ${int(b.home_visits)} visits to the home page, top of the page first. The drop between two rows is where visitors stop.`,
      table: { columns: ["Part of the home page", "Visits that reached it", "Share"], rows: b.home_sections.map((s) => [label(SECTION, s.section), int(s.visits), pct(s.share)]) },
    });
    if (b.pages.length) sections.push({
      title: "Are they reading?",
      note: "Typical time is the middle value, so one very long visit does not distort it.",
      table: {
        columns: ["Page", "Times opened", "Typical time on it", "Scrolled past half", "Scrolled to the end"],
        rows: b.pages.map((p) => [label(PAGE, p.page), int(p.views), secs(p.median_seconds), pct(p.read_half), pct(p.read_to_end)]),
      },
    });
    if (b.clicks.length) sections.push({
      title: "What they tapped",
      table: { columns: ["Button or link", "Visits that used it", "Taps in all"], rows: b.clicks.map((c) => [label(CLICK, c.name), int(c.visits), int(c.taps)]) },
    });
    if (b.recording_since) {
      const since = b.recording_since.slice(0, 10);
      if (since > from) caveats.push(`Arrivals, reading and taps have only been recorded since ${day(since)}, so those tables cover fewer days than the rest.`);
    }
  } else {
    caveats.push("Arrivals, reading depth and taps are recorded from 4 Oct 2026. There is nothing for this period yet.");
  }

  // 8. Funnel
  const funnel = d.attention?.funnel ?? [];
  if (funnel.length) {
    const opened = funnel[1]?.count ?? 0;
    sections.push({
      title: "From seen to sold",
      note: "Each step after \"opened\" is a share of the visitors who opened a piece.",
      table: {
        columns: ["Step", "Count", "Share"],
        rows: funnel.map((f, i) => [f.label, int(f.count), i === 0 ? "-" : i === 1 ? `${pct(funnel[0].count ? f.count / funnel[0].count : null)} of shown` : `${pct(opened ? f.count / opened : null)} of opened`]),
      },
    });
  }

  // 9. Piece by piece
  const pieces = d.attention?.products ?? [];
  if (pieces.length) {
    sections.push({
      title: "Piece by piece",
      table: {
        columns: ["Piece", "Shown", "Opened", "Added to bag", "WhatsApp taps", "Orders", "Sales", "Left in stock"],
        rows: pieces.map((p) => [p.name, int(p.impressions), int(p.views), int(p.add_to_cart), int(p.whatsapp_clicks), int(p.orders), rs(p.revenue_paise), p.stock_left == null ? "-" : int(p.stock_left)]),
      },
    });
    const gaps = pieces.filter((p) => p.gap && p.gap.lost > 0).map((p) => `${p.name}: most are lost between "${p.gap!.from}" and "${p.gap!.to}" (${int(p.gap!.lost)} of ${int(p.gap!.from_count)}).`);
    if (gaps.length) sections.push({ title: "Where each piece loses the most people", lines: gaps });
  }

  // 10. Orders and money
  const c = d.commerce;
  if (c) {
    sections.push({
      title: "Orders and money",
      note: "Collected and owed are never added together.",
      table: {
        columns: ["", "Amount"],
        rows: [
          [`Orders in these ${days} days`, int(c.money.orders)],
          ["Collected (money that has arrived)", rs(c.money.collected_paise)],
          ["Owed (cash on delivery, not yet handed over)", rs(c.money.committed_paise)],
          ["Lost at payment (abandoned or failed)", rs(c.money.lost_paise)],
          ["Orders, all time", int(c.orders_all_time)],
          ...(c.customers != null ? [["Customers, all time", int(c.customers)] as (string | number)[]] : []),
        ],
      },
    });
    if (c.payment.attempted > 0) sections.push({
      title: "Online payments",
      note: "\"Failed\" is the bank or gateway refusing. \"Walked away\" is the payment screen opened and closed.",
      table: {
        columns: ["", "Orders"],
        rows: [["Tried to pay online", int(c.payment.attempted)], ["Paid", int(c.payment.succeeded)], ["Failed", int(c.payment.failed)], ["Walked away", int(c.payment.abandoned)], ["Still trying", int(c.payment.in_flight)],
          ...(c.payment.mismatched > 0 ? [["Paid at the gateway but not marked paid here (needs checking)", int(c.payment.mismatched)] as (string | number)[]] : [])],
      },
    });
    const methods = Object.entries(c.by_payment_method ?? {});
    if (methods.length) sections.push({
      title: "How customers chose to pay",
      table: { columns: ["Method", "Orders", "Order value"], rows: methods.map(([m, v]) => [m === "COD" ? "Cash on delivery" : m === "RAZORPAY" ? "Paid online" : words(m), int(v.orders), rs(v.revenue)]) },
    });
    const statuses = Object.entries(c.by_status ?? {});
    if (statuses.length) sections.push({
      title: "Orders by status, all time",
      table: { columns: ["Status", "Orders"], rows: statuses.map(([s, n]) => [words(s), int(n)]) },
    });
  }

  // 11. WhatsApp
  const w = d.whatsapp;
  if (w && w.enquiries_window > 0) sections.push({
    title: "WhatsApp",
    note: "\"Marked ordered\" is the founder ticking an enquiry by hand. It is not a website order and is not counted in the money above.",
    table: { columns: ["", "Count"], rows: [["WhatsApp taps", int(w.enquiries_window)], ["Marked ordered by hand", int(w.ordered_window)], ["Value marked by hand", rs(w.revenue_window_paise)], ["Waiting more than a day for a reply", int(w.unanswered)]] },
  });

  // 12. Stock
  const inv = d.inventory;
  if (inv) {
    sections.push({
      title: "Stock",
      note: `${int(inv.units)} pieces in stock across ${int(inv.variants)} sizes and colours.`,
      table: { columns: ["Size", "Pieces in stock", "Colours"], rows: inv.by_size.map((s) => [s.size || "One size", int(s.units), int(s.variants)]) },
    });
    if (inv.low_stock.length) sections.push({
      title: `Running low (${inv.low_stock_threshold} or fewer)`,
      table: { columns: ["Piece", "Size", "Colour", "Left"], rows: inv.low_stock.map((v) => [v.product, v.size || "One size", v.colour || "-", int(v.stock)]) },
    });
  }

  // 13. Day by day, last: it is the longest table and the least read
  if (cur.length) sections.push({
    title: "Day by day",
    table: {
      columns: ["Day", "Visits", "Pieces opened", "Added to bag", "WhatsApp taps", "Orders", "Collected"],
      rows: cur.map((r) => [day(r.date), int(r.sessions), int(r.opens), int(r.bag_adds), int(r.enquiries), int(r.orders), rs(r.collected_paise)]),
    },
  });

  if (d.meta.launch_mode === "browse") caveats.push("The shop was in browse-only mode: visitors could look but not order.");
  if (d.meta.errors?.length) caveats.push(`Some parts of the console could not be loaded when this was made, so they are missing here: ${d.meta.errors.join("; ")}.`);
  caveats.push("With few visits, percentages swing a lot. Treat any share based on fewer than about 30 visits as a hint, not a fact.");
  caveats.push("This report contains no customer names, phone numbers or addresses.");

  return { shop: "ZISUN", title: "ZISUN shop report", period, days, generated, stamp: stampDate, definitions: DEFINITIONS, sections, caveats };
}
