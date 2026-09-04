import { describe, expect, it } from "vitest";
import { chartForCategory, HOW_TO_MEASURE, SIZE_CHART_NOTES } from "@/lib/sizeGuide";

/**
 * The size guide is content, so what is worth testing is not that it renders
 * but that it stays internally consistent. A chart with a gap in it, or one
 * that disagrees with itself between sizes, sends someone the wrong garment —
 * and the whole point of this file is preventing that return.
 */

const LIVE_CATEGORIES = ["Everyday Kurtis", "Occasion & Festive", "Co-ord Sets"];

describe("chartForCategory", () => {
  it("has a chart for every category in the catalogue", () => {
    for (const name of LIVE_CATEGORIES) {
      const chart = chartForCategory(name);
      expect(chart.categories, `${name} fell through to the wrong chart`).toContain(name);
    }
  });

  it("falls back rather than returning nothing for an unknown category", () => {
    // A new category should show *a* chart, not crash the product page.
    const chart = chartForCategory("Something We Added Later");
    expect(chart.rows.length).toBeGreaterThan(0);
    expect(chart.fabric).toBeTruthy();
  });

  it("survives a product with no category", () => {
    expect(chartForCategory(null).rows.length).toBeGreaterThan(0);
    expect(chartForCategory(undefined).rows.length).toBeGreaterThan(0);
  });
});

describe("chart integrity", () => {
  const charts = LIVE_CATEGORIES.map((c) => [c, chartForCategory(c)] as const);

  it("covers every size the catalogue actually sells", () => {
    // The live catalogue lists S, M, L and XL across the eight products.
    for (const [name, chart] of charts) {
      const sizes = chart.rows.map((r) => r.size);
      expect(sizes, `${name} is missing a size`).toEqual(["S", "M", "L", "XL"]);
    }
  });

  it("increases monotonically — a larger size is never cut smaller", () => {
    for (const [name, chart] of charts) {
      for (let i = 1; i < chart.rows.length; i++) {
        const prev = chart.rows[i - 1];
        const row = chart.rows[i];
        for (const key of ["bust", "waist", "hip", "length"] as const) {
          expect(
            row[key],
            `${name}: ${key} went down from ${prev.size} to ${row.size}`
          ).toBeGreaterThan(prev[key]);
        }
      }
    }
  });

  it("states measurements in centimetres, not inches", () => {
    // An inch-sized number in a cm column is the single most damaging typo
    // available here: 36 reads as plausible and is half the garment.
    for (const [name, chart] of charts) {
      for (const row of chart.rows) {
        expect(row.bust, `${name} ${row.size} bust looks like inches`).toBeGreaterThan(60);
        expect(row.length, `${name} ${row.size} length looks like inches`).toBeGreaterThan(80);
      }
    }
  });

  it("gives fit guidance and a fabric note on every chart", () => {
    for (const [name, chart] of charts) {
      expect(chart.fit.length, `${name} has no fit notes`).toBeGreaterThan(0);
      expect(chart.fabric, `${name} has no fabric note`).toMatch(/cotton/i);
      expect(chart.intro.length).toBeGreaterThan(20);
    }
  });

  it("tells a shopper what to do when they fall between two sizes", () => {
    // Cotton has no stretch, so this is the one instruction that matters most.
    for (const [name, chart] of charts) {
      const joined = chart.fit.join(" ").toLowerCase();
      expect(joined, `${name} does not answer the between-sizes question`).toContain("between");
    }
  });
});

describe("how to measure", () => {
  it("explains all three body measurements the chart asks for", () => {
    const labels = HOW_TO_MEASURE.map((m) => m.label);
    expect(labels).toEqual(["Bust", "Waist", "Hip"]);
    for (const m of HOW_TO_MEASURE) expect(m.text.length).toBeGreaterThan(20);
  });
});

describe("size chart disclaimer", () => {
  const joined = SIZE_CHART_NOTES.join(" ").toLowerCase();

  it("states the manual-measurement tolerance", () => {
    // Size is the only reason an exchange is accepted, so a 1cm difference
    // between two pieces of the same size has to be disclosed before the sale
    // rather than argued about after it.
    expect(joined).toMatch(/vari/);
    expect(joined).toMatch(/cm|inch/);
  });

  it("tells a shopper to check the chart before ordering", () => {
    expect(joined).toContain("before ordering");
  });

  it("repeats the between-sizes rule", () => {
    expect(joined).toContain("between two sizes");
    expect(joined).toContain("larger");
  });

  it("distinguishes body measurements from the garment", () => {
    // The chart mixes both. Calling all of it "garment measurements" would
    // make the bust/waist/hip columns mean something they do not.
    expect(joined).toContain("body measurement");
    expect(joined).toContain("finished garment");
  });
});
