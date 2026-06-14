import { describe, it, expect } from "vitest";
import { getEntitlement, type EntitlementProfile } from "./entitlement";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-06-14T00:00:00.000Z");

function profile(p: Partial<EntitlementProfile>): EntitlementProfile {
  return {
    subscription_status: null,
    trial_started_at: null,
    trial_ends_at: null,
    subscription_expires_at: null,
    ...p,
  };
}

describe("getEntitlement", () => {
  it("treats a never-subscribed profile as free, trial unused", () => {
    const e = getEntitlement(profile({}), NOW);
    expect(e.tier).toBe("free");
    expect(e.isPaid).toBe(false);
    expect(e.inTrial).toBe(false);
    expect(e.hasUsedTrial).toBe(false);
    expect(e.daysLeft).toBeNull();
  });

  it("is premium while trial is active and reports days left (ceil)", () => {
    const e = getEntitlement(
      profile({
        subscription_status: "trial",
        trial_started_at: new Date(NOW.getTime() - 10 * DAY).toISOString(),
        // 6.5 days remaining → ceil to 7
        trial_ends_at: new Date(NOW.getTime() + 6.5 * DAY).toISOString(),
      }),
      NOW,
    );
    expect(e.tier).toBe("premium");
    expect(e.inTrial).toBe(true);
    expect(e.isPaid).toBe(false);
    expect(e.hasUsedTrial).toBe(true);
    expect(e.daysLeft).toBe(7);
  });

  it("falls back to free the instant the trial expires", () => {
    const e = getEntitlement(
      profile({
        subscription_status: "trial",
        trial_started_at: new Date(NOW.getTime() - 40 * DAY).toISOString(),
        trial_ends_at: new Date(NOW.getTime() - 1000).toISOString(),
      }),
      NOW,
    );
    expect(e.tier).toBe("free");
    expect(e.inTrial).toBe(false);
    expect(e.hasUsedTrial).toBe(true); // can't start another trial
    expect(e.daysLeft).toBeNull();
  });

  it("is premium for an active subscription with no expiry", () => {
    const e = getEntitlement(
      profile({ subscription_status: "active" }),
      NOW,
    );
    expect(e.tier).toBe("premium");
    expect(e.isPaid).toBe(true);
    expect(e.inTrial).toBe(false);
  });

  it("is premium for an active subscription whose expiry is in the future", () => {
    const e = getEntitlement(
      profile({
        subscription_status: "active",
        subscription_expires_at: new Date(NOW.getTime() + 5 * DAY).toISOString(),
      }),
      NOW,
    );
    expect(e.tier).toBe("premium");
    expect(e.isPaid).toBe(true);
  });

  it("is free once an active subscription has lapsed past its expiry", () => {
    const e = getEntitlement(
      profile({
        subscription_status: "active",
        subscription_expires_at: new Date(NOW.getTime() - 1000).toISOString(),
      }),
      NOW,
    );
    expect(e.tier).toBe("free");
    expect(e.isPaid).toBe(false);
  });

  it("handles a null profile (not yet hydrated) as free", () => {
    const e = getEntitlement(null, NOW);
    expect(e.tier).toBe("free");
    expect(e.hasUsedTrial).toBe(false);
  });
});
