import { beforeEach, describe, expect, it } from "vitest";
import { MAX_AGE_DAYS, VERSION, clearDraft, draftTime, readDraft, sameData, writeDraft } from "@/lib/formDraft";

describe("form drafts", () => {
  beforeEach(() => localStorage.clear());

  it("gives back what was kept", () => {
    writeDraft("product:new", { name: "Teal", sizes: ["M", "L"] }, null, 1000);
    expect(readDraft("product:new", 2000)).toEqual({ v: VERSION, at: 1000, base: null, data: { name: "Teal", sizes: ["M", "L"] } });
  });

  it("keeps drafts apart by key", () => {
    writeDraft("product:a", { name: "A" });
    writeDraft("product:b", { name: "B" });
    expect(readDraft<{ name: string }>("product:a")?.data.name).toBe("A");
    clearDraft("product:a");
    expect(readDraft("product:a")).toBeNull();
    expect(readDraft<{ name: string }>("product:b")?.data.name).toBe("B");
  });

  it("remembers what it was a draft of", () => {
    writeDraft("product:a", { name: "A" }, "2026-10-04T05:00:00Z");
    expect(readDraft("product:a")?.base).toBe("2026-10-04T05:00:00Z");
  });

  it("forgets a draft that is too old", () => {
    writeDraft("product:new", { name: "Old" }, null, 0);
    expect(readDraft("product:new", MAX_AGE_DAYS * 86_400_000 + 1)).toBeNull();
    expect(localStorage.getItem("zisun.draft.product:new")).toBeNull();
  });

  it("drops a draft from another version of the form rather than half-applying it", () => {
    localStorage.setItem("zisun.draft.product:new", JSON.stringify({ v: VERSION + 1, at: Date.now(), base: null, data: { name: "X" } }));
    expect(readDraft("product:new")).toBeNull();
  });

  it("survives rubbish in storage", () => {
    localStorage.setItem("zisun.draft.product:new", "{not json");
    expect(readDraft("product:new")).toBeNull();
  });

  it("compares forms by content, not by the order the fields were written", () => {
    expect(sameData({ a: 1, b: { c: [1, 2], d: "x" } }, { b: { d: "x", c: [1, 2] }, a: 1 })).toBe(true);
    expect(sameData({ a: 1 }, { a: "1" })).toBe(false);
    expect(sameData({ sizes: ["M", "L"] }, { sizes: ["L", "M"] })).toBe(false);
  });

  it("says the time today, and the day as well when it was not today", () => {
    const now = new Date("2026-10-04T12:00:00").getTime();
    expect(draftTime(new Date("2026-10-04T09:05:00").getTime(), now)).toMatch(/9:05/);
    expect(draftTime(new Date("2026-10-03T09:05:00").getTime(), now)).toMatch(/3 Oct.*9:05/);
  });
});
