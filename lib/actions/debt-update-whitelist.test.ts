import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regression test for the mass-assignment whitelist in `updateDebt`. Asserts
 * against the actual object handed to `.update()` — not just `pick()` in
 * isolation — so a future edit that narrows/loosens the whitelist without
 * updating both the `DebtUpdate` type and the `pick()` key list is caught here.
 */

type Row = Record<string, unknown>;

const USER = { id: "u1" };
let capturedUpdatePayload: Row | null = null;

class Builder {
  private table: string;
  private op: "select" | "update" = "select";
  private payload: Row | null = null;
  constructor(table: string) {
    this.table = table;
  }
  select() {
    return this;
  }
  update(payload: Row) {
    this.op = "update";
    this.payload = payload;
    if (this.table === "debts") capturedUpdatePayload = payload;
    return this;
  }
  eq() {
    return this;
  }
  async single() {
    if (this.op === "update") {
      return {
        data: {
          id: "d1",
          user_id: "u1",
          name: "Loan",
          principal: 500,
          total_paid: 100,
          total_repayable: 500,
          ...this.payload,
        },
        error: null,
      };
    }
    // The needsRecalc lookup in updateDebt.
    return {
      data: { principal: 500, interest_rate: 10, loan_tenure_months: 12, interest_type: "flat" },
      error: null,
    };
  }
}

const supabaseStub = {
  auth: { getUser: async () => ({ data: { user: USER } }) },
  from: (table: string) => new Builder(table),
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => supabaseStub,
  getAuthedUser: async () => USER,
}));
vi.mock("@/lib/server/activity-logger", () => ({
  logActivity: vi.fn(async () => {}),
  getUserCurrency: vi.fn(async () => "INR"),
  fmt: (n: number) => `₹${n}`,
}));
vi.mock("@/lib/actions/asset-history", () => ({
  addAssetEntry: vi.fn(async () => {}),
  upsertTodaySnapshot: vi.fn(async () => {}),
}));

import { updateDebt } from "@/lib/actions/debt";

beforeEach(() => {
  capturedUpdatePayload = null;
});

describe("updateDebt whitelist", () => {
  it("keeps every editable field, including color and type, and drops hostile keys", async () => {
    const hostilePayload: Record<string, unknown> = {
      name: "Car Loan",
      principal: 600,
      interest_rate: 9,
      monthly_minimum: 50,
      expected_payoff_date: "2030-01-01",
      is_closed: false,
      interest_type: "diminishing",
      loan_tenure_months: 24,
      total_paid: 100,
      total_repayable: 550,
      icon: "car",
      color: "#ff0000",
      type: "external",
      // hostile fields not in DebtUpdate
      user_id: "someone-else",
      id: "other",
    };

    await updateDebt("d1", hostilePayload as unknown as Parameters<typeof updateDebt>[1]);

    expect(capturedUpdatePayload).not.toBeNull();
    const payload = capturedUpdatePayload!;

    // Editable fields the UI writes must survive whitelisting.
    expect(payload.color).toBe("#ff0000");
    expect(payload.type).toBe("external");
    expect(payload.name).toBe("Car Loan");
    expect(payload.icon).toBe("car");

    // Hostile / non-whitelisted fields must be dropped.
    expect(payload).not.toHaveProperty("user_id");
    expect(payload).not.toHaveProperty("id");
  });
});
