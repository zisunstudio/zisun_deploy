import { beforeEach, describe, expect, it } from "vitest";
import { forgetSession, markSignedIn, shouldRestore } from "@/lib/sessionHint";

describe("sessionHint", () => {
  beforeEach(() => localStorage.clear());

  it("asks a never-seen device once, then never again", () => {
    expect(shouldRestore()).toBe(true);
    expect(shouldRestore()).toBe(false);
    expect(shouldRestore()).toBe(false);
  });

  it("always asks once a session has been made", () => {
    shouldRestore();
    markSignedIn();
    expect(shouldRestore()).toBe(true);
    expect(shouldRestore()).toBe(true);
  });

  it("stops asking once the server says there is no session", () => {
    markSignedIn();
    forgetSession();
    shouldRestore(); // the probe
    expect(shouldRestore()).toBe(false);
  });

  it("asks a device that signed in with Firebase", () => {
    shouldRestore();
    localStorage.setItem("zisun-signed-in", "1");
    expect(shouldRestore()).toBe(true);
  });
});
