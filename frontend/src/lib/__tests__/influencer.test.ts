import { beforeEach, describe, expect, it, vi } from "vitest";

const sent: { type: string; props: Record<string, unknown> }[] = [];
vi.mock("@/lib/queries/analytics", () => ({ trackEvent: (type: string, props: Record<string, unknown>) => sent.push({ type, props }) }));

import { captureInfluencer, currentInfluencer, influencerForOrder, WINDOW_DAYS } from "@/lib/influencer";

function land(url: string) {
  window.history.replaceState(null, "", url);
}

describe("an influencer's link", () => {
  beforeEach(() => { localStorage.clear(); sent.length = 0; vi.useRealTimers(); });

  it("is kept, counted once, and removed from the address bar", () => {
    land("/collections/edit?inf=riya&utm_source=influencer");
    captureInfluencer();
    expect(currentInfluencer()).toBe("riya");
    expect(window.location.search).toBe("?utm_source=influencer");
    captureInfluencer();                       // a refresh: nothing left to read
    expect(sent.filter((e) => e.type === "influencer_click")).toHaveLength(1);
  });

  it("the latest link wins", () => {
    land("/?inf=riya"); captureInfluencer();
    land("/?inf=sneha"); captureInfluencer();
    expect(currentInfluencer()).toBe("sneha");
  });

  it("expires after the window", () => {
    vi.useFakeTimers({ now: new Date("2026-11-01T00:00:00Z") });
    land("/?inf=riya"); captureInfluencer();
    vi.setSystemTime(new Date(Date.parse("2026-11-01T00:00:00Z") + (WINDOW_DAYS + 1) * 86_400_000));
    expect(currentInfluencer()).toBeNull();
    expect(influencerForOrder()).toEqual({});
  });

  it("refuses junk but still tidies the URL", () => {
    land("/?inf=%3Cscript%3E"); captureInfluencer();
    expect(currentInfluencer()).toBeNull();
    expect(window.location.search).toBe("");
    expect(sent).toHaveLength(0);
  });

  it("sends the code and the tap time with an order", () => {
    land("/?inf=riya"); captureInfluencer();
    const o = influencerForOrder();
    expect(o.influencer).toBe("riya");
    expect(Date.parse(o.influencer_clicked_at!)).toBeGreaterThan(0);
  });
});
