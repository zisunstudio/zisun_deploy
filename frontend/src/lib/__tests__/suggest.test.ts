import { describe, expect, it } from "vitest";
import { parseWords, setSizeFrom, similar, suggest, toPiece, tokens, type Piece, type SuggestInput } from "@/lib/suggest";

// Her catalogue as it stood on 2026-10-04, spellings included.
const OCC = "occ", CO = "co", EV = "ev";
const piece = (name: string, price: number, cat: string, catName: string, fabric: string, wash: string, set: string[], print = ""): Piece =>
  ({ id: name, name, pricePaise: price, categoryId: cat, categoryName: catName, fabric, washCare: wash, setPieces: set, printType: print });
const CATALOGUE: Piece[] = [
  piece("Purple Rose Embroidered Co-ord Set", 103900, CO, "Co-ord Sets", "Vartican silk", "Gentle hand wash separately with mild detergent; dry in shade and iron on low heat.", ["Palazzo", "Kurta"], "Solid purple"),
  piece("Rich Wine Dabu Cotton Bandhani-Inspired Kurta Set with Dupatta & Palazzo", 112400, OCC, "Occasion & Festive", "Dhabu cotton", "Gentle hand wash separately in cold water.", ["Kurta", "Palazzo", "Dupatta"], "Bhandini print"),
  piece("Wine Maroon Textured Chikankari Kurta", 36900, EV, "Everyday Kurtis", "Georgette-type textured fabric", "Mild Hand wash", ["Kurta"], "Solid"),
  piece("Teal Blue Co-ord Set", 134900, CO, "Co-ord Sets", "Dabu cotton", "Hand wash only.", ["Top", "Bottom"], "Printed border"),
  piece("Coffee Brown Ajrakh 3-Piece Set", 159900, OCC, "Occasion & Festive", "Dabu cotton", "Hand wash only.", ["Kurta", "Palazzo", "Dupatta"], "Ajrakh print (dupatta)"),
  piece("Red Bandhani 3-Piece Set", 134900, OCC, "Occasion & Festive", "Mulmul cotton", "Hand wash only.", ["Kurta", "Bottom", "Dupatta"], "Bandhani pattern"),
  piece("Red Ikkat Co-ord Set", 111900, CO, "Co-ord Sets", "Ikat handloom cotton", "Hand wash only.", ["Top", "Bottom"], "Ikat"),
  piece("Pink Bandhani 3-Piece Set", 134900, OCC, "Occasion & Festive", "Mulmul cotton", "Hand wash only.", ["Kurta", "Palazzo", "Dupatta"], "Bandhani pattern"),
];
const blank: SuggestInput = { name: "", words: "", category_id: "", fabric_composition: "", set_pieces: [] };
const by = (s: ReturnType<typeof suggest>) => Object.fromEntries(s.map((x) => [x.field, x]));

describe("reading her words", () => {
  it("treats her different spellings as one word", () => {
    expect(tokens("Pink Bhandini 3-Piece Set")).toEqual(tokens("pink bandhani three piece set"));
    expect(tokens("Dhabu")).toEqual(tokens("dabu"));
    expect(tokens("Red Ikkat Co-ord")).toEqual(["ikat", "coord"]);
  });
  it("ignores colours: a red set and a blue set of the same make are the same make", () => {
    expect(tokens("Teal Blue Co-ord Set")).toEqual(["coord"]);
  });
  it("knows how many pieces from the words, and trusts the form over the words", () => {
    expect(setSizeFrom(tokens("green 3 piece set"), [])).toBe(3);
    expect(setSizeFrom(tokens("green co-ord"), [])).toBe(2);
    expect(setSizeFrom(tokens("green kurta"), [])).toBeNull();
    expect(setSizeFrom(tokens("green 3 piece set"), ["Kurta"])).toBe(1);
  });
});

describe("suggestions from her catalogue", () => {
  it("says nothing until she has said something, or with no catalogue", () => {
    expect(suggest(blank, CATALOGUE)).toEqual([]);
    expect(suggest({ ...blank, name: "Green Bandhani 3-Piece Set" }, [])).toEqual([]);
  });

  it("prices a new bandhani three-piece like her other bandhani three-pieces, and says which", () => {
    const s = by(suggest({ ...blank, name: "Green Bandhani 3-Piece Set" }, CATALOGUE));
    expect(s.base_price_rupees.value).toBe("1349");
    expect(s.base_price_rupees.reason).toContain("Red Bandhani 3-Piece Set (₹1,349)");
    expect(s.base_price_rupees.reason).toContain("Pink Bandhani 3-Piece Set (₹1,349)");
    expect(s.category_id.value).toBe(OCC);
    expect(s.category_id.show).toBe("Occasion & Festive");
    expect(s.set_pieces.value).toEqual(["Kurta", "Palazzo", "Dupatta"]);
    expect(s.dupatta_included.value).toBe("yes");
  });

  it("prices a co-ord set like her co-ord sets, without a dupatta", () => {
    const s = by(suggest({ ...blank, name: "Mustard Ikkat Co-ord Set" }, CATALOGUE));
    expect(s.base_price_rupees.value).toBe("1119");          // the ikat co-ord, her closest
    expect(s.category_id.value).toBe(CO);
    expect(s.set_pieces.value).toEqual(["Top", "Bottom"]);
    expect(s.dupatta_included.value).toBe("no");
  });

  it("fills the fabric only when she says the word, in her own spelling of it", () => {
    const s = by(suggest({ ...blank, name: "Green Mulmul 3-Piece Set" }, CATALOGUE));
    expect(s.fabric_composition.value).toBe("Mulmul cotton");
    expect(s.fabric_composition.reason).toContain("\"mulmul\"");
    expect(s.wash_care.value).toBe("Hand wash only.");
    // No fabric word said: nothing about the cloth is inferred from resemblance.
    expect(by(suggest({ ...blank, name: "Green 3-Piece Set" }, CATALOGUE)).fabric_composition).toBeUndefined();
  });

  it("recognises a print she names, and never invents one", () => {
    expect(by(suggest({ ...blank, name: "Green Bhandini 3-Piece Set" }, CATALOGUE)).print_type.value).toBe("Bandhani pattern");
    expect(by(suggest({ ...blank, name: "Green 3-Piece Set" }, CATALOGUE)).print_type).toBeUndefined();
  });

  it("uses what she says aloud as well as the name", () => {
    const s = by(suggest({ ...blank, name: "Indigo Set", words: "a dabu cotton three piece with dupatta" }, CATALOGUE));
    expect(s.fabric_composition.value).toBe("Dabu cotton");
    expect(s.set_pieces.value).toEqual(["Kurta", "Palazzo", "Dupatta"]);
    expect(s.base_price_rupees).toBeDefined();
  });

  it("leaves alone what she has already filled", () => {
    const s = by(suggest({ ...blank, name: "Green Bandhani 3-Piece Set", category_id: CO, fabric_composition: "Linen", set_pieces: ["Kurta", "Pant"] }, CATALOGUE));
    expect(s.category_id).toBeUndefined();
    expect(s.fabric_composition).toBeUndefined();
    expect(s.set_pieces).toBeUndefined();
    expect(s.dupatta_included.value).toBe("no");
  });

  it("offers no price for something unlike anything she sells", () => {
    const s = by(suggest({ ...blank, name: "Leather Handbag" }, CATALOGUE));
    expect(s.base_price_rupees).toBeUndefined();
    expect(s.category_id).toBeUndefined();
  });

  it("ranks the closest piece first", () => {
    const r = similar({ ...blank, name: "Blue Ajrakh 3-Piece Set" }, CATALOGUE);
    expect(r[0].piece.name).toBe("Coffee Brown Ajrakh 3-Piece Set");
  });

  it("reads a row of the console's product list", () => {
    const p = toPiece({ id: "1", name: "X", base_price: 134900, category: { id: OCC, name: "Occasion & Festive" },
      fabric_specs: { fabric_composition: " Mulmul cotton ", wash_care: "Hand wash only." }, garment_attributes: { set_pieces: ["Kurta"], print_type: "Solid" } });
    expect(p).toEqual({ id: "1", name: "X", pricePaise: 134900, categoryId: OCC, categoryName: "Occasion & Festive", fabric: "Mulmul cotton", washCare: "Hand wash only.", setPieces: ["Kurta"], printType: "Solid" });
    expect(toPiece({ id: "2", name: "Free", base_price: 0 })).toBeNull();
  });
});

describe("her words without the language model", () => {
  it("reads price, sizes, colours and stock", () => {
    const r = parseWords("Mustard and indigo mulmul kurta set, sizes M to 3XL, 1,499 rupees, five of each");
    expect(r).toEqual({ base_price_rupees: 1499, sizes: ["M", "L", "XL", "2XL", "3XL"], colours: ["Mustard", "Indigo"], stock_per_variant: 5 });
  });
  it("reads a price said the other way round, and a list of sizes", () => {
    const r = parseWords("price is 1349, sizes S, M and L, one each");
    expect(r.base_price_rupees).toBe(1349);
    expect(r.sizes).toEqual(["S", "M", "L"]);
    expect(r.stock_per_variant).toBe(1);
  });
  it("does not take a height or a count for a price, or a stray letter for a size", () => {
    const r = parseWords("I am 153 cm and this is a lovely set in M");
    expect(r.base_price_rupees).toBeNull();
    expect(r.sizes).toEqual([]);
  });
  it("counts Rani Pink once, not also as Pink", () => {
    expect(parseWords("in rani pink").colours).toEqual(["Rani Pink"]);
  });
});
