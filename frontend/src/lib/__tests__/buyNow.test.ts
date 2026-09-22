import { describe, expect, it } from "vitest";
import { arrivalDate } from "@/lib/buyNow";

describe("arrivalDate", () => {
  const monday = new Date(2026, 8, 21); // Mon 21 Sep 2026

  it("quotes the late end: three days of dispatch plus the courier's days", () => {
    expect(arrivalDate(3, monday)).toBe(new Date(2026, 8, 27).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }));
  });

  it("says nothing rather than guess when the courier gave no estimate", () => {
    expect(arrivalDate(null, monday)).toBeNull();
    expect(arrivalDate(0, monday)).toBeNull();
  });
});
