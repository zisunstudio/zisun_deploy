import { describe, expect, it } from "vitest";
import { POLICY_TERMS } from "@/lib/legal";

/**
 * ZISUN sells with no returns and a three-day, size-only exchange. That is an
 * unusually tight policy, which makes consistency across surfaces a legal
 * exposure rather than a tidiness concern: the Consumer Protection
 * (E-Commerce) Rules and the 2023 dark-pattern rules both turn on whether the
 * buyer was told the real terms before paying. A home-page badge that still
 * says "7-day returns" while the policy page says otherwise is the exact
 * mismatch those rules penalise.
 *
 * These tests pin the numbers so the terms cannot drift back by accident.
 */
describe("policy terms", () => {
  it("offers a 3-day exchange window", () => {
    expect(POLICY_TERMS.exchangeWindowDays).toBe(3);
  });

  it("has no return window, because there is no returns programme", () => {
    // If someone reintroduces this key, every surface that reads it will start
    // promising returns again — which is the failure this test exists to catch.
    expect(POLICY_TERMS).not.toHaveProperty("returnWindowDays");
  });

  it("still states a refund processing time", () => {
    // Refunds have not disappeared: cancellation before dispatch, an
    // out-of-stock exchange size, and the statutory damaged/defective case all
    // produce one, so the customer is owed a timeframe.
    expect(POLICY_TERMS.refundProcessingDays).toMatch(/day/i);
  });

  it("keeps dispatch and delivery timeframes", () => {
    expect(POLICY_TERMS.dispatchTimeframe).toMatch(/day/i);
    expect(POLICY_TERMS.deliveryTimeframe).toMatch(/day/i);
  });
});
