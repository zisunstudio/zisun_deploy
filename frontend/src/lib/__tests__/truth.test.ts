import { describe, expect, it } from "vitest";
import { craftFacts, heroEyebrow, heroSub, manifestoBody, shortLine, EMPTY_TRUTH, type Truth } from "@/lib/truth";

const live: Truth = { ...EMPTY_TRUTH, pieces: 2, fabrics: ["Dhabu cotton", "Vartican silk"], claims: [{ key: "fabric", text: "Cotton and silk", pieces: 1, of: 2 }, { key: "origin", text: "Some pieces from Bagru", pieces: 1, of: 2 }], missing: ["x"] };
const full: Truth = { ...EMPTY_TRUTH, pieces: 2, all_cotton: true, all_handloom: true, any_handloom: true, all_never_rerun: true, max_batch: 8,
  claims: [{ key: "fabric", text: "Handloom cotton", pieces: 2, of: 2 }, { key: "craft", text: "Woven by hand", pieces: 2, of: 2 }, { key: "origin", text: "Ilkal · Mangalgiri", pieces: 2, of: 2 }, { key: "batch", text: "Small batches - never more than 8 of a piece - and never re-run", pieces: 2, of: 2 }] };

describe("brand copy from the catalogue", () => {
  it("the live catalogue says nothing about handloom, regions or re-runs", () => {
    expect(heroEyebrow(live)).toBe("Kurtas & co-ord sets · Bengaluru");
    expect(heroSub(live)).toBe("Cut for women who dress for themselves.");
    expect(manifestoBody(live)).toBe("Cut to move, and chosen one piece at a time, kept in small numbers.");
    expect(craftFacts(live)).toEqual([]);
    expect(shortLine(live)).toBe("Kurtas and co-ord sets, chosen by Sushmita in Bengaluru.");
  });
  it("a fully recorded handloom catalogue earns the full story", () => {
    expect(heroEyebrow(full)).toBe("Handloom cotton · Ilkal · Mangalgiri");
    expect(heroSub(full)).toMatch(/^Handwoven cotton/);
    expect(manifestoBody(full)).toBe("Handloom cotton from Ilkal and Mangalgiri, cut to move, made in small batches - never more than 8 of a piece - and never re-run.");
    expect(craftFacts(full).map((f) => f.title)).toEqual(["Ilkal · Mangalgiri", "Small batches", "Cotton, for the heat"]);
  });
  it("a partial claim (some pieces) never reaches the copy", () => {
    const t: Truth = { ...EMPTY_TRUTH, pieces: 2, claims: [{ key: "craft", text: "Some pieces woven by hand", pieces: 1, of: 2 }] };
    expect(craftFacts(t)).toEqual([]);
    expect(heroEyebrow(t)).toBe("Kurtas & co-ord sets · Bengaluru");
  });
  it("nothing recorded is still a complete sentence", () => {
    expect(manifestoBody(EMPTY_TRUTH)).toMatch(/\.$/);
  });
});
