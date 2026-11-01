import { describe, expect, it } from "vitest";
import { linkFor, pathFor, pathForTail, redirectTo } from "@/lib/influencerLink";

const ID = "774f350f-4fcc-4535-b9ec-c1ffe7d277ab";

describe("influencer links", () => {
  it("each kind of link opens the page it names", () => {
    expect(pathForTail(["diwali-reel-3"])).toBe("/collections/diwali-reel-3");
    expect(pathForTail(["piece", ID])).toBe(`/product/${ID}`);
    expect(pathForTail(["category", "co-ord-sets"])).toBe("/category/co-ord-sets");
    expect(pathForTail(["home"])).toBe("/");
  });

  it("never opens anything else", () => {
    for (const bad of [["piece", "x"], ["admin", "x"], ["a", "b", "c"], ["..", "admin"], ["https:"], ["category", "a b"]]) {
      expect(pathForTail(bad)).toBeNull();
    }
  });

  it("the link the console copies is the link the redirect reads", () => {
    for (const l of [{ kind: "piece", id: ID }, { kind: "category", slug: "co-ord-sets" }, { kind: "collection", slug: "riya-1" }, { kind: "home" }] as const) {
      const tail = linkFor("riya", l).replace("https://zisun.in/r/riya/", "").split("/");
      expect(pathForTail(tail)).toBe(pathFor(l));
    }
    expect(linkFor("riya", null)).toBe("https://zisun.in/r/riya");
  });

  it("redirects relatively, with the credit and the channel", () => {
    const r = redirectTo("/collections/riya-1", "riya");
    expect(r.status).toBe(307);
    const loc = r.headers.get("Location")!;
    expect(loc.startsWith("/collections/riya-1?")).toBe(true);
    expect(loc).toContain("inf=riya");
    expect(loc).toContain("utm_source=influencer");
  });
});
