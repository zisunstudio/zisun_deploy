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
  [/\/admin\/journal\/ideas/, {
    searches: [{ query: "cotton kurti", times: 7, found_nothing: false }, { query: "size 3xl", times: 3, found_nothing: true }],
    suggestions: [{ kind: "fabric", title: "What is dabu cotton, and how does it wear?", why: "Dhabu cotton is in the shop" },
                  { kind: "fit", title: "Kurta length for a 5-foot frame: what falls where", why: "the founder is 153 cm" }],
  }],
  [/\/admin\/journal/, [
    { id: "a1", slug: "washing-dabu-cotton", title: "How to wash dabu cotton so the print stays", dek: "The first wash bleeds. That is the indigo, not a fault.", kind: "care", body_md: "## First wash\n\nCold water, alone.", status: "published", product_ids: [], cover_url: null, meta_title: null, meta_description: null, brief: null, search_intent: "how to wash dabu cotton", published_at: "2026-09-22T00:00:00Z", updated_at: "2026-09-22T00:00:00Z" },
    { id: "a2", slug: "draft-one", title: "Kurta length for a 5-foot frame", dek: null, kind: "fit", body_md: "", status: "draft", product_ids: [], cover_url: null, meta_title: null, meta_description: null, brief: "what falls where at 153 cm", search_intent: null, published_at: null, updated_at: "2026-09-22T00:00:00Z" },
  ]],
  [/\/catalog\/products/, { items: [
    { id: "p1", name: "Rich Wine Dabu Cotton Bandhani-Inspired Kurta Set with Dupatta & Palazzo", base_price: 112400, variants: [], media: [], created_at: "2026-09-20T00:00:00Z", is_active: true },
    { id: "p2", name: "Purple Rose Embroidered Co-ord Set", base_price: 103900, variants: [], media: [], created_at: "2026-09-19T00:00:00Z", is_active: true },
  ], total: 2, page: 1, limit: 60 }],
  [/\/catalog\/truth/, { pieces: 2, fabrics: [], crafts: [], origins: [], all_cotton: false, any_handloom: false, all_handloom: false, all_never_rerun: false, max_batch: null, claims: [], missing: ["origin on every piece"], unsupported: [{ where: "Category “Everyday Kurtis”", says: "handloom", needs: "a piece whose craft records 'handloom'" }] }],
  [/\/health/, { status: "ok", launch_mode: "browse", checkout_enabled: false, components: { database: "ok", redis: "ok", celery: "ok" } }],
];

(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({ ...devices["Pixel 7"] });
  await ctx.route("**/api/v1/**", async (route) => {
    const url = route.request().url();
    const hit = FIXTURES.find(([re]) => re.test(url));
    if (!hit) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(hit[1]) });
  });

  let bad = 0;
  for (const p of PAGES) {
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
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
    console.log(`${p}: ${scrolls ? "HORIZONTAL SCROLL" : "fits"}${over.length ? ` | overflow: ${over.join(", ")}` : ""}${errs.length ? ` | errors: ${errs.join(" ")}` : ""}`);
    if (scrolls || over.length || errs.length) bad++;
    await page.close();
  }
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error("FATAL", String(e).slice(0, 300)); process.exit(1); });
