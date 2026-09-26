import { describe, expect, it } from "vitest";
import { pickupDay, pickupTime, pickupWhen } from "../pickup";

// 11:00 in India is 05:30 UTC; the van comes at the Indian time whatever
// clock the phone reading the console is set to.
const ELEVEN_IST = "2026-09-29T05:30:00+00:00";

describe("pickup", () => {
  it("names the day and time in Indian time", () => {
    expect(pickupDay(ELEVEN_IST)).toMatch(/29 Sept?/);
    expect(pickupTime(ELEVEN_IST)).toBe("11:00");
  });

  it("drops a midnight time, which means only a day was entered", () => {
    expect(pickupTime("2026-09-29T00:00:00+05:30")).toBeNull();
  });

  it("says today and tomorrow by the Indian calendar", () => {
    const now = new Date("2026-09-28T20:00:00+05:30");
    expect(pickupWhen("2026-09-28T23:30:00+05:30", now)).toBe("today");
    expect(pickupWhen(ELEVEN_IST, now)).toBe("tomorrow");
    expect(pickupWhen("2026-10-02T11:00:00+05:30", now)).not.toMatch(/today|tomorrow/);
  });
});
