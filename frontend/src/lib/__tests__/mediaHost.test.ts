import { describe, expect, it } from "vitest";
import { imageUrlProblem, isOptimizableImageUrl, MEDIA_HOST } from "@/lib/mediaHost";

describe("image URLs that next/image can actually serve", () => {
  it("accepts the media host", () => {
    expect(isOptimizableImageUrl(`https://${MEDIA_HOST}/products/a/b.jpeg`)).toBe(true);
    expect(imageUrlProblem(`https://${MEDIA_HOST}/x.jpg`)).toBeNull();
  });
  it("accepts our own public assets and an empty value", () => {
    expect(isOptimizableImageUrl("/placeholder-hero.svg")).toBe(true);
    expect(imageUrlProblem("")).toBeNull();
  });
  it("rejects any other host, which the optimizer answers with 400", () => {
    expect(isOptimizableImageUrl("https://images.unsplash.com/photo-1.jpg")).toBe(false);
    expect(imageUrlProblem("https://images.unsplash.com/photo-1.jpg")).toContain(MEDIA_HOST);
  });
  it("rejects a look-alike host", () => {
    expect(isOptimizableImageUrl("https://evil.com/zisun-media.fly.storage.tigris.dev/x.jpg")).toBe(false);
  });
  it("explains plainly when it is not a URL at all", () => {
    expect(imageUrlProblem("my photo.jpg")).toBe("That does not look like a web address.");
  });
});
