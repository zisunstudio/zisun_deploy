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
 *   CHROMIUM=/opt/pw-browsers/...  a browser binary, where none is bundled
 *   CLICK="What to pack"         click every button with this text first, so
 *                                what opens (an order's detail) is measured too
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
  // The courier, for a packed parcel: one booked, one that failed to book.
  [/\/shipment\/refresh/, { tracking: {
    awb: "141123221084922", courier: "Delhivery Surface", status: "PICKUP SCHEDULED", step: "packed",
    expected_at: "2026-10-02", delivered_at: null, track_url: null,
    checkpoints: [{ at: "2026-09-28 18:10:00", status: "Pickup scheduled", location: "Bengaluru_Yelahanka_PC (Karnataka)" }],
  }, status: "PACKED", moved: [] }],
  [/\/orders\/44444444-[0-9a-f-]+$/, {
    id: "44444444-4444-4444-4444-444444444444", status: "PACKED", total_amount: 103900, created_at: "2026-09-24T10:00:00Z",
    payment_method: "RAZORPAY", shipping_amount: 0, cod_amount_due: null, items: [{}],
    customer_name: "Test Shopper", customer_phone: "+919876543210", customer_email: null,
    address: { line1: "4 Park Street", line2: null, city: "Kolkata", state: "West Bengal", pincode: "700016" },
    detailed_items: [{ quantity: 1, unit_price: 103900, product_name: "Purple Rose Embroidered Co-ord Set", sku: "ZS-PUR-L", size: "L", colour: "Purple", image_url: null }],
    invoice_number: "ZS/25-26/0003", awb_number: null, carrier: "shiprocket",
    shipment: { carrier: "shiprocket", courier_name: null, awb_number: null, shipment_id: "222", pickup_scheduled_at: null, pickup_token: null, label_url: null, status: "ORDER_CREATED",
      last_error: "No courier assigned: Selected courier is not serviceable for the pincode 700016 with the given weight and dimensions." },
  }],
  [/\/orders\/[0-9a-f-]{8,}$/, {
    id: "o1", status: "PACKED", total_amount: 112400, created_at: "2026-09-23T10:00:00Z",
    payment_method: "RAZORPAY", shipping_amount: 0, cod_amount_due: null, items: [{}],
    customer_name: "Test Shopper", customer_phone: "+919876543210", customer_email: null,
    address: { line1: "12 MG Road", line2: "Near the park", city: "Bengaluru", state: "Karnataka", pincode: "560001" },
    detailed_items: [{ quantity: 1, unit_price: 112400, product_name: "Rich Wine Dabu Cotton Bandhani-Inspired Kurta Set", sku: "ZS-WIN-M", size: "M", colour: "Wine", image_url: null }],
    invoice_number: "ZS/25-26/0001", awb_number: "141123221084922", carrier: "shiprocket",
    shipment: { carrier: "shiprocket", courier_name: "Delhivery Surface", awb_number: "141123221084922", shipment_id: "221",
      pickup_scheduled_at: "2026-09-29T05:30:00+00:00", pickup_token: "Reference No: 194_BIGFOOT 1966840_29092026",
      label_url: "https://example.invalid/label.pdf", status: "PICKUP_SCHEDULED", last_error: null },
  }],
  [/\/orders\/?(\?|$)/, [
    { id: "11111111-1111-1111-1111-111111111111", status: "PAID", total_amount: 112400, created_at: "2026-09-23T10:00:00Z", items: [{}], payment_method: "RAZORPAY", cod_confirmation: null },
    { id: "22222222-2222-2222-2222-222222222222", status: "PAYMENT_PENDING", total_amount: 122300, created_at: "2026-09-23T09:00:00Z", items: [{}], payment_method: "COD", cod_confirmation: "PENDING" },
    { id: "33333333-3333-3333-3333-333333333333", status: "PACKED", total_amount: 112400, created_at: "2026-09-24T09:00:00Z", items: [{}], payment_method: "RAZORPAY", cod_confirmation: null, pickup_scheduled_at: "2026-09-29T05:30:00+00:00", courier_name: "Delhivery Surface", shipment_problem: false },
    { id: "44444444-4444-4444-4444-444444444444", status: "PACKED", total_amount: 103900, created_at: "2026-09-24T10:00:00Z", items: [{}], payment_method: "RAZORPAY", cod_confirmation: null, pickup_scheduled_at: null, courier_name: null, shipment_problem: true },
  ]],
  [/\/categories\/?(\?|$)/, [
    { id: "4483deaa-dfc0-47b7-956f-2e6086f6c1ac", name: "Co-ord Sets", slug: "co-ord-sets", is_active: true, product_count: 1 },
  ]],
  [/\/products\/[0-9a-f-]{20,}$/, {
    id: "774f350f-4fcc-4535-b9ec-c1ffe7d277ab", name: "Purple Rose Embroidered Co-ord Set",
    description: "Rich purple rose-embroidered co-ord set.", base_price: 103900, category_id: null,
    is_active: true, variants: [], media: [],
    commodity_name: "Office wear", net_quantity: "1 set", dimensions: "42, 44",
    country_of_origin: "India", manufacturer_name: "ZISUN", manufacturer_address: "Bengaluru",
    fabric_composition: "Vartican silk", fabric_gsm: 300, weave: "", has_pockets: true,
    colourfastness: "", wash_care: "Gentle hand wash.",
    colour: null, print_type: null, pattern: null, neck_type: null, sleeve_type: null,
    sleeve_attached: null, dupatta_included: null, fit: null, garment_length: null,
    embroidery: null, bottom_type: null, occasion: null, set_pieces: null,
    craft: null, origin: null, lining: null, transparency: null, batch_size: null, will_rerun: null,
    hsn_code: null, price_includes_tax: true, price_entered: 103900,
    compare_at_price: null, offer_ends_at: null, size_chart: null, styling_notes: [],
    model_size: "", model_height: "", worn_by_founder: false, named_for: "", shelf_rank: null,
  }],
  [/\/dashboard\/brief/, {
    brief: { headline: "Two pieces live, no orders yet.", bullets: ["40 people saw a piece; 12 opened one."], critical: [], source: "rules" },
    facts: { as_of: "2026-09-22T18:30:00Z", system: { ai_note: null } },
  }],
  // Shaped from the real contract in backend dashboard.py's return dict.
  // A fixture that guesses the shape renders an error boundary that looks
  // like a tidy page - which is the whole reason this harness checks for one.
  [/\/dashboard(\?|$)/, {
    meta: { window_days: 30, generated_at: "2026-09-22T18:30:00+05:30", checkout_enabled: false, launch_mode: "browse", events_recorded: 53, errors: [] },
    week: { sessions: 41, sessions_previous: 22, opens: 12, opens_previous: 7, bag_adds: 1, bag_adds_previous: 0, enquiries: 2, enquiries_previous: 0, orders: 2, revenue_paise: 112400, committed_paise: 122300, whatsapp_marked_ordered: 0, whatsapp_marked_revenue_paise: 0 },
    whatsapp: { enquiries_window: 0, ordered_window: 0, revenue_window_paise: 0, conversion: null, unanswered: 0 },
    attention_items: [],
    insight: null,
    commerce: {
      orders_all_time: 3, orders_window: 3, revenue_window_paise: 112400,
      by_payment_method: {}, by_status: { PAID: 1, PAYMENT_PENDING: 2 }, customers: 2,
      contribution_margin: null, contribution_margin_blocked_on: [],
      money: { collected_paise: 112400, committed_paise: 122300, lost_paise: 216300, refunded_paise: 0, orders: 3, by_kind: { paid: 1, cod_placed: 1, payment_abandoned: 1 } },
      payment: { attempted: 4, succeeded: 1, failed: 1, abandoned: 1, in_flight: 1, success_rate: 33.3, abandon_rate: 33.3, mismatched: 1 },
    },
    acquisition: { partial: true, by_source: [
      { source: "instagram", orders: 2, collected_paise: 112400, committed_paise: 122300, sessions: 31, visitors: 27, conversion: 6.5 },
      { source: "direct", orders: 0, collected_paise: 0, committed_paise: 0, sessions: 8, visitors: 7, conversion: 0 },
      { source: "not recorded", orders: 1, collected_paise: 103900, committed_paise: 0, sessions: 0, visitors: 0, conversion: null },
    ] },
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
        whatsapp_clicks: 0, whatsapp_marked_ordered: 0, orders: 1, units_sold: 1, revenue_paise: 112400, buy_rate: 8.3, ctr: 22.5, cart_rate: 8.3, attention: 3.4, stock_left: 28, lowest_variant: null,
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
  const browser = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}), args: ["--disable-web-security", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
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
    if (process.env.CLICK) {
      for (const b of await page.getByRole("button", { name: process.env.CLICK }).all()) {
        if (await b.isVisible()) await b.click();
      }
      await page.waitForTimeout(1500);
    }
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
