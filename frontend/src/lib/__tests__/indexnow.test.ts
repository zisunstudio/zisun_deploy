import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { INDEXNOW_KEY } from "@/lib/indexnow";

// The storefront serves the key; the backend submits with it. If they drift,
// every IndexNow submission is rejected and nobody notices.
describe("IndexNow key", () => {
  it("is the same in the storefront and the backend", () => {
    const py = readFileSync(path.resolve(__dirname, "../../../../backend/app/services/indexnow.py"), "utf8");
    expect(py).toContain(`INDEXNOW_KEY = "${INDEXNOW_KEY}"`);
    expect(INDEXNOW_KEY).toMatch(/^[a-f0-9]{32}$/);
  });
});
