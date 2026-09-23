import { beforeEach, describe, expect, it, vi } from "vitest";
import { attributionFields, captureAttribution, isReturning, visitorId } from "@/lib/attribution";

function visit(url: string, referrer = "") {
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal("location", new URL(url));
  Object.defineProperty(document, "referrer", { value: referrer, configurable: true });
}

describe("first-touch attribution", () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

  it("reads a utm tag", () => {
    visit("https://zisun.in/?utm_source=instagram&utm_medium=bio&utm_campaign=launch&utm_content=reel3");
    expect(captureAttribution()).toMatchObject({ source: "instagram", medium: "bio", campaign: "launch", content: "reel3" });
  });

  it("names the channel from a referring domain when there is no tag", () => {
    visit("https://zisun.in/", "https://l.instagram.com/?u=x");
    expect(captureAttribution()).toMatchObject({ source: "instagram", medium: "referral", referrer_domain: "l.instagram.com" });
  });

  it("calls an AI answer engine its own channel", () => {
    visit("https://zisun.in/", "https://www.perplexity.ai/search");
    expect(captureAttribution()?.source).toBe("ai-search");
  });

  it("is direct with no tag and no referrer", () => {
    visit("https://zisun.in/");
    expect(captureAttribution()).toMatchObject({ source: "direct", medium: null, referrer_domain: null });
  });

  it("ignores our own pages as a referrer", () => {
    visit("https://zisun.in/shop", "https://zisun.in/");
    expect(captureAttribution()?.source).toBe("direct");
  });

  it("keeps the FIRST touch, never the last", () => {
    visit("https://zisun.in/?utm_source=instagram");
    captureAttribution();
    // Same browser, a later direct visit: storage survives, the credit stays.
    vi.stubGlobal("location", new URL("https://zisun.in/"));
    Object.defineProperty(document, "referrer", { value: "", configurable: true });
    expect(captureAttribution()?.source).toBe("instagram");
    expect(attributionFields().source).toBe("instagram");
  });

  it("gives a stable visitor id and reports a return", () => {
    visit("https://zisun.in/");
    const id = visitorId();
    captureAttribution();
    expect(visitorId()).toBe(id);
    expect(isReturning()).toBe(true);
  });

  it("never stores the full referring URL, only its domain", () => {
    visit("https://zisun.in/", "https://www.google.com/search?q=something+private");
    const a = captureAttribution()!;
    expect(JSON.stringify(a)).not.toContain("something+private");
    expect(a.referrer_domain).toBe("www.google.com");
  });
});
