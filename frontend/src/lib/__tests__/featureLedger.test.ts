import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "fs";
import path from "path";

/**
 * FEATURES.md is the list of everything that has shipped. This keeps it
 * honest: every repo file it names must still exist. A feature can leave
 * the product only by being moved to "Retired" in the ledger, on purpose -
 * never by a file quietly disappearing in a refactor.
 */
const ROOT = path.resolve(__dirname, "../../../..");
const LEDGER = path.join(ROOT, "FEATURES.md");

function namedFiles(md: string): string[] {
  // Only the live tables - the Retired table names files that are gone.
  const live = md.split("## Retired")[0];
  const paths = Array.from(live.matchAll(/`((?:frontend|backend)\/[^`\s]+)`/g)).map((m) => m[1]);
  return Array.from(new Set(paths));
}

describe("feature ledger", () => {
  const md = readFileSync(LEDGER, "utf8");
  const files = namedFiles(md);

  it("names the files behind the features", () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it.each(files)("%s still exists", (f) => {
    expect(existsSync(path.join(ROOT, f)), `${f} is in FEATURES.md but gone from the repo - retire it in the ledger or restore it`).toBe(true);
  });
});
