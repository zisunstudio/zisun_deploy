import { describe, expect, it } from "vitest";
import { chartKind, fitsFor, kurtaRound, normSize, type Chart } from "@/lib/fitMath";

// The live Purple Rose chart, exactly as she entered it: inches, and a
// kurta's measurements (38" waist on a 39" chest), labelled "XXL".
const LIVE: Chart = { unit: "in", rows: [
  { size: "M", chest: 39, waist: 38, hip: 47 },
  { size: "L", chest: 40, waist: 39, hip: 48 },
  { size: "XL", chest: 42, waist: 42, hip: 50 },
  { size: "XXL", chest: 44, waist: 44, hip: 52 },
  { size: "3XL", chest: 45, waist: 47, hip: 54 },
] };
// A conventional "to fit" body chart, in cm.
const BODY: Chart = { unit: "cm", rows: [
  { size: "S", chest: 86, waist: 71, hip: 94 },
  { size: "M", chest: 91, waist: 76, hip: 99 },
  { size: "L", chest: 97, waist: 81, hip: 104 },
  { size: "XL", chest: 102, waist: 86, hip: 109 },
] };
const inch = (n: number) => n * 2.54;

describe("chartKind", () => {
  it("recognises a kurta's measurements", () => expect(chartKind(LIVE)).toBe("garment"));
  it("recognises a body chart", () => expect(chartKind(BODY)).toBe("body"));
  it("believes an explicit label over the guess", () => expect(chartKind({ ...LIVE, measures: "body" })).toBe("body"));
});

describe("normSize", () => {
  it("treats XXL and 2XL as one size", () => { expect(normSize("XXL")).toBe("2XL"); expect(normSize(" xxxl ")).toBe("3XL"); });
});

describe("fitsFor - her measurements against a kurta chart", () => {
  it("a 36-inch bust is comfortable in M, as designed", () => {
    const r = fitsFor(LIVE, { method: "body", bust: inch(36), hip: inch(40) }, "as_designed");
    expect(r.recommended).toBe("M");
    expect(r.fits.find((f) => f.size === "M")?.band).toBe("comfortable");
  });
  it("someone who likes room goes to the first relaxed size", () => {
    expect(fitsFor(LIVE, { method: "body", bust: inch(36), hip: inch(40) }, "relaxed").recommended).toBe("XL");
  });
  it("the hip decides when the hip is the closer fit", () => {
    const r = fitsFor(LIVE, { method: "body", bust: inch(34), hip: inch(46) }, "as_designed");
    expect(r.fits.find((f) => f.size === "M")?.decidedBy).toBe("hip");
  });
  it("when even the largest size sits close, it says so rather than pretend", () => {
    const r = fitsFor(LIVE, { method: "body", bust: inch(44), hip: inch(46) }, "as_designed");
    expect(r.nothingComfortable).toBe(true);
    expect(r.recommended).toBe("3XL");
    expect(r.fits.find((f) => f.size === "3XL")?.band).toBe("close");
  });
  it("only recommends sizes that are in stock", () => {
    const r = fitsFor(LIVE, { method: "body", bust: inch(36), hip: inch(40) }, "as_designed", ["L", "XL", "2XL"]);
    expect(r.fits.map((f) => f.size)).toEqual(["L", "XL", "2XL"]);
    expect(r.recommended).toBe("L");
  });
});

describe("fitsFor - a kurta she loves", () => {
  it("matches the size that measures like her kurta", () => {
    const r = fitsFor(LIVE, { method: "garment", chest: inch(42), hip: inch(50) }, "as_designed");
    expect(r.vsKurta).toBe(true);
    expect(r.recommended).toBe("XL");
    expect(r.fits.find((f) => f.size === "XL")?.band).toBe("comfortable");
  });
  it("against a body chart it still answers, with less confidence", () => {
    // A 107 cm kurta fits a body of about 99 cm: over L's "to fit 97", within XL's 102.
    const r = fitsFor(BODY, { method: "garment", chest: 99 + 8 }, "as_designed");
    expect(r.confidence).toBe("medium");
    expect(r.recommended).toBe("XL");
  });
});

describe("fitsFor - body chart, body measurements", () => {
  it("fits the size cut for her bust", () => {
    expect(fitsFor(BODY, { method: "body", bust: 90, hip: 98 }, "as_designed").recommended).toBe("M");
  });
});

describe("kurtaRound - how she measured", () => {
  it("doubles a flat width", () => {
    expect(kurtaRound(19, "in", "across")).toEqual({ roundCm: 38 * 2.54, readAs: "across", corrected: false });
  });
  it("reads a number too big to be a flat width as all the way round", () => {
    const r = kurtaRound(36, "in", "across");
    expect(r.corrected).toBe(true);
    expect(r.readAs).toBe("round");
    expect(r.roundCm).toBeCloseTo(36 * 2.54);
  });
  it("the founder's own test: a 36/40 kurta, read as round, is M on the live chart", () => {
    const chest = kurtaRound(36, "in", "across").roundCm;
    const hip = kurtaRound(40, "in", "across").roundCm;
    const r = fitsFor(LIVE, { method: "garment", chest, hip }, "as_designed");
    expect(r.recommended).toBe("M");
    expect(r.nothingComfortable).toBe(false);
  });
  it("respects an explicit round measurement in cm", () => {
    expect(kurtaRound(92, "cm", "round").roundCm).toBe(92);
  });
});
