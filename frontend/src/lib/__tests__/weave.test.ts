import { describe, expect, it } from "vitest";
import { designWeave } from "@/lib/weave";

describe("designWeave", () => {
  it("weaves the same cloth for the same piece, every time", () => {
    const a = designWeave("piece-1", ["Purple"]);
    const b = designWeave("piece-1", ["Purple"]);
    expect(a).toEqual(b);
    expect(a.code).toMatch(/^[0-9A-F]{4}$/);
  });

  it("gives a different piece a different cloth", () => {
    const a = designWeave("piece-1", ["Purple"]);
    const b = designWeave("piece-2", ["Purple"]);
    expect(a.code).not.toEqual(b.code);
  });

  it("re-weaves in the selected colour", () => {
    const purple = designWeave("piece-1", ["Purple", "Indigo"]);
    const indigo = designWeave("piece-1", ["Indigo", "Purple"]);
    expect(purple.warp[purple.border + 1]).not.toEqual(indigo.warp[indigo.border + 1]);
    // Same piece, same structure: only the dye changes.
    expect(purple.interlace).toEqual(indigo.interlace);
  });

  it("still weaves when the colour is one the palette cannot name", () => {
    const spec = designWeave("piece-3", ["Some old free-text colour", null]);
    expect(spec.warp).toHaveLength(spec.cols);
    expect(spec.weft).toHaveLength(spec.rows);
    expect(spec.warp.every(Boolean)).toBe(true);
  });

  it("keeps a burgundy piece's border readable", () => {
    const spec = designWeave("piece-4", ["Burgundy"]);
    expect(spec.warp[0]).not.toEqual(spec.warp[spec.border + 1]);
  });
});
