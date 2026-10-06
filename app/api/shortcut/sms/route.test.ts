import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const resolveShortcutKey = vi.fn();
const markShortcutCapture = vi.fn();
vi.mock("@/lib/server/shortcut-keys", () => ({
  resolveShortcutKey: (...a: unknown[]) => resolveShortcutKey(...a),
  markShortcutCapture: (...a: unknown[]) => markShortcutCapture(...a),
}));

const ingestShortcutTxn = vi.fn();
vi.mock("@/lib/server/shortcut-ingest", () => ({
  ingestShortcutTxn: (...a: unknown[]) => ingestShortcutTxn(...a),
}));

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));

const notifyUser = vi.fn();
vi.mock("@/lib/server/push-notify", () => ({
  notifyUser: (...a: unknown[]) => notifyUser(...a),
}));

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

const flags = { sms_enabled: true };
vi.mock("@/lib/config/serverFlags", () => ({ getServerFlags: async () => flags }));

import { POST } from "./route";
import { generateShortcutKey, SHORTCUT_KEY_PLACEHOLDER } from "@/lib/shortcut/key";

const DEBIT = "Rs.240.00 debited from A/c XX1234 to SWIGGY on 06-10-26. UPI Ref 123456789";

function call(body: unknown, auth?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (auth !== undefined) headers.authorization = auth;
  return POST(
    new Request("https://allocat.xyz/api/shortcut/sms", {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  ).then(async (r) => ({ http: r.status, json: await r.json() }));
}

let key: string;
beforeEach(() => {
  vi.clearAllMocks();
  flags.sms_enabled = true;
  // Fresh key per test so the in-memory rate limiter never carries over.
  key = generateShortcutKey();
  resolveShortcutKey.mockResolvedValue({ keyId: "k1", userId: "user-1" });
  notifyUser.mockResolvedValue({ subscriptions: 0, sent: 0, failed: 0, skipped: "no_subscriptions" });
  ingestShortcutTxn.mockResolvedValue({
    status: "pending",
    txnId: "t1",
    amount: 240,
    currency: "INR",
    merchant: "SWIGGY",
    suggestedItem: null,
  });
});

describe("POST /api/shortcut/sms", () => {
  it("asks for the key when it is missing or still the placeholder", async () => {
    for (const auth of [undefined, `Bearer ${SHORTCUT_KEY_PLACEHOLDER}`]) {
      const r = await call({ text: DEBIT }, auth);
      expect(r.http).toBe(200);
      expect(r.json.status).toBe("needs-key");
      expect(r.json.notify).toMatch(/paste your AlloCat key/i);
    }
    expect(resolveShortcutKey).not.toHaveBeenCalled();
    expect(ingestShortcutTxn).not.toHaveBeenCalled();
  });

  it("rejects an unknown or revoked key without ingesting", async () => {
    resolveShortcutKey.mockResolvedValue(null);
    const r = await call({ text: DEBIT }, `Bearer ${key}`);
    expect(r.json.status).toBe("invalid-key");
    expect(ingestShortcutTxn).not.toHaveBeenCalled();
  });

  it("rejects a malformed key without a DB lookup", async () => {
    const r = await call({ text: DEBIT }, "Bearer not-a-key");
    expect(r.json.status).toBe("invalid-key");
    expect(resolveShortcutKey).not.toHaveBeenCalled();
  });

  it("ingests for the key's owner and ignores any user id in the body", async () => {
    const r = await call({ text: DEBIT, user_id: "attacker", userId: "attacker" }, `Bearer ${key}`);
    expect(r.json.status).toBe("pending");
    expect(r.json.notify).toContain("SWIGGY");
    expect(ingestShortcutTxn).toHaveBeenCalledTimes(1);
    const [, userId, txn] = ingestShortcutTxn.mock.calls[0];
    expect(userId).toBe("user-1");
    expect(txn.amount).toBe(240);
    // Only extracted fields reach storage — never the message text.
    expect(JSON.stringify(txn)).not.toContain("UPI Ref");
    expect(markShortcutCapture).toHaveBeenCalledWith("k1");
  });

  it("sends a web push that opens the transaction, and keeps the shortcut quiet when it reached the iPhone", async () => {
    notifyUser.mockResolvedValue({ subscriptions: 1, sent: 1, failed: 0, deliveredUserAgents: [IPHONE_UA] });
    const r = await call({ text: DEBIT }, `Bearer ${key}`);
    expect(r.json).toEqual({ status: "pending" });
    const [userId, payload] = notifyUser.mock.calls[0];
    expect(userId).toBe("user-1");
    expect(payload.url).toBe("/sms?txn=t1");
    expect(payload.body).toContain("SWIGGY");
  });

  it("falls back to the shortcut notification when the push reached no iPhone", async () => {
    notifyUser.mockResolvedValue({
      subscriptions: 1,
      sent: 1,
      failed: 0,
      deliveredUserAgents: ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130"],
    });
    const r = await call({ text: DEBIT }, `Bearer ${key}`);
    expect(r.json.notify).toContain("SWIGGY");
  });

  it("names the budget item when a learned rule will allocate it", async () => {
    ingestShortcutTxn.mockResolvedValue({
      status: "pending",
      txnId: "t1",
      amount: 240,
      currency: "INR",
      merchant: "SWIGGY",
      suggestedItem: "Food",
    });
    const r = await call({ text: DEBIT }, `Bearer ${key}`);
    expect(r.json.notify).toContain("→ Food");
  });

  it("a manual test run (no message) reports connected", async () => {
    const r = await call({ text: "" }, `Bearer ${key}`);
    expect(r.json.status).toBe("connected");
    expect(r.json.notify).toMatch(/connected/i);
    expect(ingestShortcutTxn).not.toHaveBeenCalled();
  });

  it("stays silent for OTP / credit / non-transaction messages", async () => {
    for (const text of [
      "123456 is your OTP for a debit of Rs.500",
      "Rs.5000 credited to your A/c XX1234 from SALARY",
      "lunch at 1?",
    ]) {
      const r = await call({ text }, `Bearer ${key}`);
      expect(r.json.status).toBe("skipped");
      expect(r.json.notify).toBeUndefined();
    }
    expect(ingestShortcutTxn).not.toHaveBeenCalled();
  });

  it("stays silent for a duplicate", async () => {
    ingestShortcutTxn.mockResolvedValue({ status: "duplicate" });
    const r = await call({ text: DEBIT }, `Bearer ${key}`);
    expect(r.json.status).toBe("duplicate");
    expect(r.json.notify).toBeUndefined();
    expect(markShortcutCapture).not.toHaveBeenCalled();
  });

  it("accepts a plain-text body", async () => {
    const r = await call(DEBIT, `Bearer ${key}`);
    expect(r.json.status).toBe("pending");
  });

  it("honours the sms_enabled kill switch", async () => {
    flags.sms_enabled = false;
    const r = await call({ text: DEBIT }, `Bearer ${key}`);
    expect(r.json.status).toBe("disabled");
    expect(ingestShortcutTxn).not.toHaveBeenCalled();
  });

  it("rate-limits a flood from one key", async () => {
    let last = "";
    for (let i = 0; i < 31; i++) {
      last = (await call({ text: "" }, `Bearer ${key}`)).json.status;
    }
    expect(last).toBe("rate-limited");
  });

  it("does not leak errors to the shortcut", async () => {
    ingestShortcutTxn.mockRejectedValue(new Error("db down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await call({ text: DEBIT }, `Bearer ${key}`);
    expect(r.json).toEqual({ status: "error" });
    expect(String(warn.mock.calls[0])).not.toContain("UPI Ref");
    warn.mockRestore();
  });
});
