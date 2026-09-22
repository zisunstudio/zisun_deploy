#!/usr/bin/env node
/**
 * Render a console page at phone width, with a faked admin session.
 *
 * CLAUDE.md: "the founder runs the shop from her phone", and a console change
 * is not done until it has been seen at 412px. This harness fakes the session
 * by answering /auth/refresh itself, and answers the admin API from fixtures
 * so the page can be rendered without a real token.
 *
 * It proves the PAGE, never the endpoint - the analytics board 500'd for a
 * day while every screenshot looked perfect. Verify endpoints separately,
 * against the real API.
 *
 * Usage: node scripts/review/console.js /admin/journal [...more paths]
 *   BASE=http://127.0.0.1:3600   the running Next build
 *   OUT=/tmp/shots               where screenshots land
 */
const path = require("path");
const TOOLS = process.env.ZISUN_TOOLS || `${process.env.HOME}/.cache/zisun-tools`;
const { chromium, devices } = require(path.join(TOOLS, "pw/node_modules/playwright-core"));

const BASE = process.env.BASE || "http://127.0.0.1:3600";
const OUT = process.env.OUT || "/tmp";
const PAGES = process.argv.slice(2).length ? process.argv.slice(2) : ["/admin/journal"];

const ADMIN = { id: "00000000-0000-0000-0000-000000000001", phone: "+910000000000", name: "Sushmita", role: "admin" };

/** Fixtures, by path fragment. First match wins. */
const FIXTURES = [
  [/\/auth\/refresh/, { user: ADMIN, access_token: "fake.fake.fake", token_type: "bearer" }],
  [/\/journal\/ideas/, {
    searches: [{ query: "cotton kurti", times: 7, found_nothing: false }, { query: "size 3xl", times: 3, found_nothing: true }],
    suggestions: [{ kind: "fabric", title: "What is dabu cotton, and how does it wear?", why: "Dhabu cotton is in the shop" },
                  { kind: "fit", title: "Kurta length for a 5-foot frame: what falls where", why: "the founder is 153 cm" }],
  }],
  [/\/journal(\?|$)/, [
    { id: "a1", slug: "washing-dabu-cotton", title: "How to wash dabu cotton so the print stays", dek: "The first wash bleeds. That is the indigo, not a fault.", kind: "care", body_md: "## First wash\n\nCold water, alone.", status: "published", product_ids: [], cover_url: null, meta_title: null, meta_description: null, brief: null, search_intent: "how to wash dabu cotton", published_at: "2026-09-22T00:00:00Z", updated_at: "2026-09-22T00:00:00Z" },
    { id: "a2", slug: "draft-one", title: "Kurta length for a 5-foot frame", dek: null, kind: "fit", body_md: "", status: "draft", product_ids: [], cover_url: null, meta_title: null, meta_description: null, brief: "what falls where at 153 cm", search_intent: null, published_at: null, updated_at: "2026-09-22T00:00:00Z" },
  ]],
  [/\/catalog\/products/, { items: [
    { id: "p1", name: "Rich Wine Dabu Cotton Bandhani-Inspired Kurta Set with Dupatta & Palazzo", base_price: 112400, variants: [], media: [], created_at: "2026-09-20T00:00:00Z", is_active: true },
    { id: "p2", name: "Purple Rose Embroidered Co-ord Set", base_price: 103900, variants: [], media: [], created_at: "2026-09-19T00:00:00Z", is_active: true },
  ], total: 2, page: 1, limit: 60 }],
  [/\/catalog\/truth/, { pieces: 2, fabrics: [], crafts: [], origins: [], all_cotton: false, any_handloom: false, all_handloom: false, all_never_rerun: false, max_batch: null, claims: [], missing: ["origin on every piece"], unsupported: [{ where: "Category “Everyday Kurtis”", says: "handloom", needs: "a piece whose craft records 'handloom'" }] }],
  [/\/health/, { status: "ok", launch_mode: "browse", checkout_enabled: false, components: { database: "ok", redis: "ok", celery: "ok" } }],
  // The inventory page reads a bare ARRAY from /products/?…; a {items:[]}
  // object here produced "filter is not a function" behind the boundary.
  [/\/admin\/v1\/products\/?(\?|$)/, [{
    id: "p1", name: "Rich Wine Dabu Cotton Bandhani-Inspired Kurta Set with Dupatta & Palazzo", base_price: 112400,
    variants: [
      { id: "v1", sku: "ZS-WIN-M", stock: 1, size: "M", color: "Wine", price_delta: 0, is_active: true },
      { id: "v2", sku: "ZS-M", stock: 5, size: "M", color: "Wine", price_delta: 0, is_active: true },
      { id: "v3", sku: "RICH-WINE-WIN-M", stock: 1, size: "M", color: "Wine", price_delta: 0, is_active: true },
      { id: "v4", sku: "ZS-WIN-L", stock: 1, size: "L", color: "Wine", price_delta: 0, is_active: true },
    ],
  }]],
  [/\/dashboard\/brief/, {
    brief: { headline: "Two pieces live, no orders yet.", bullets: ["40 people saw a piece; 12 opened one."], critical: [], source: "rules" },
    facts: { as_of: "2026-09-22T18:30:00Z", system: { ai_note: null } },
  }],
  // Shaped from the real contract in backend dashboard.py's return dict.
  // A fixture that guesses the shape renders an error boundary that looks
  // like a tidy page - which is the whole reason this harness checks for one.
  [/\/dashboard(\?|$)/, {
    meta: { window_days: 30, generated_at: "2026-09-22T18:30:00+05:30", checkout_enabled: false, launch_mode: "browse", events_recorded: 53, errors: [] },
    week: { sessions: 41, sessions_previous: 22, opens: 12, opens_previous: 7, bag_adds: 1, bag_adds_previous: 0, enquiries: 0, enquiries_previous: 0, ordered: 0, revenue_paise: 0 },
    whatsapp: { enquiries_window: 0, ordered_window: 0, revenue_window_paise: 0, conversion: null, unanswered: 0 },
    attention_items: [],
    insight: null,
    commerce: { orders_all_time: 0, orders_window: 0, revenue_window_paise: 0, by_payment_method: [], by_status: [], customers: {}, contribution_margin: null, contribution_margin_blocked_on: [] },
    attention: {
      sessions: 41, sessions_previous: 22,
      funnel: [
        { key: "impressions", event: "product_impression", label: "Products shown", count: 40 },
        { key: "views", event: "product_viewed", label: "Product opened", count: 12 },
        { key: "add_to_cart", event: "add_to_cart", label: "Added to bag", count: 1 },
        { key: "enquiry", event: null, label: "WhatsApp enquiry", count: 0 },
        { key: "orders", event: null, label: "Ordered", count: 0 },
      ],
      size_guide_opens: 3,
      products_by_views: [{ id: "p1", name: "Rich Wine Dabu Cotton Kurta Set", views: 12 }],
      never_viewed: [],
      products: [{
        id: "p1", name: "Rich Wine Dabu Cotton Bandhani-Inspired Kurta Set with Dupatta & Palazzo", shelf_rank: null,
        impressions: 40, views: 12, views_from_cards: 9, add_to_cart: 1, buy_now: 0, checkout_initiated: 0, intent: 1,
        enquiries: 0, ordered: 0, ctr: 22.5, cart_rate: 8.3, attention: 3.4, stock_left: 28, lowest_variant: null,
        journey: [
          { key: "impressions", label: "Shown", count: 40 }, { key: "views", label: "Opened", count: 12 },
          { key: "intent", label: "Bag or buy now", count: 1 }, { key: "checkout", label: "Checkout started", count: 0 },
          { key: "enquiries", label: "Asked on WhatsApp", count: 0 }, { key: "ordered", label: "Ordered", count: 0 },
        ],
        gap: { from: "Shown", to: "Opened", from_count: 40, to_count: 12, lost: 28, rate: 70, step: "views" },
      }],
      ranking: { window_days: 30, half_life_days: 5, weights: {} },
    },
    inventory: { units: 28, variants: 13, by_size: [{ size: "M", variants: 3, units: 7 }], low_stock: [], low_stock_threshold: 5 },
  }],
];

(async () => {
  // --disable-web-security: the fixtures answer a cross-origin API, and an
  // un-intercepted call would otherwise fail CORS instead of being mocked.
  const browser = await chromium.launch({ args: ["--disable-web-security", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({ ...devices["Pixel 7"] });
  await ctx.route("**/api/**", async (route) => {
    const url = route.request().url();
    const hit = FIXTURES.find(([re]) => re.test(url));
    if (!hit) {
      // Loud on purpose: a silent {} renders an empty page that looks fine.
      console.log(`    (no fixture) ${url.replace(/^https?:\/\/[^/]+/, "")}`);
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(hit[1]) });
  });

  let bad = 0;
  for (const p of PAGES) {
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
    // A React error boundary catches the throw, so `pageerror` stays empty
    // while the page shows "Something went wrong". Screenshots of that look
    // like a tidy page. Console errors are the only signal left.
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon/.test(m.text())) errs.push(m.text().slice(0, 200)); });
    await page.goto(BASE + p, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(2500);
    const name = p.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "root";
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

    // The failure this harness exists to catch: anything wider than the phone.
    const over = await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      return [...document.querySelectorAll("body *")]
        .filter((el) => el.getBoundingClientRect().right > w + 1)
        .slice(0, 6)
        .map((el) => `${el.tagName}.${(el.className || "").toString().split(" ").slice(0, 2).join(".")} → ${Math.round(el.getBoundingClientRect().right)}px`);
    });
    const scrolls = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    // The error boundary renders a tidy page; it must still count as broken.
    const crashed = await page.evaluate(() => /Something went wrong|Application error|^500\b/m.test(document.body.innerText));
    console.log(`${p}: ${crashed ? "CRASHED (error boundary)" : scrolls ? "HORIZONTAL SCROLL" : "fits"}${over.length ? ` | overflow: ${over.join(", ")}` : ""}${errs.length ? `\n    ${errs.slice(0, 3).join("\n    ")}` : ""}`);
    if (crashed || scrolls || over.length || errs.length) bad++;
    await page.close();
  }
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error("FATAL", String(e).slice(0, 300)); process.exit(1); });
