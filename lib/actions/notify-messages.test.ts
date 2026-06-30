import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pickOverspendMessage, type OverspendCtx } from "@/lib/notify/messages";

vi.mock("@/lib/server/openrouter", () => ({
  openRouterChat: vi.fn(async () => {
    throw new Error("simulated AI failure");
  }),
}));
// auth + supabase server client must not break the import graph; stub minimally.
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  }),
}));

const ORIGINAL_KEY = process.env.OPENROUTER_API_KEY;
beforeEach(() => {
  vi.clearAllMocks();
  process.env.OPENROUTER_API_KEY = "test-key";
});
afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = ORIGINAL_KEY;
});

const ctx: OverspendCtx = {
  itemName: "Groceries",
  tier: 2,
  count: 2,
  over: 250,
  currency: "INR",
  firstOverspend: false,
  seed: "g:2",
};

describe("resolveOverspendMessage", () => {
  it("falls back to the exact static message on AI failure", async () => {
    const { resolveOverspendMessage } = await import("./notify-messages");
    const msg = await resolveOverspendMessage(ctx);
    expect(msg).toEqual(pickOverspendMessage(ctx));
  });
});

describe("generateOverspendMessage", () => {
  it("returns null on AI failure (never throws)", async () => {
    const { generateOverspendMessage, toDerived } = await import("./notify-messages");
    const { openRouterChat } = await import("@/lib/server/openrouter");
    await expect(generateOverspendMessage(toDerived(ctx))).resolves.toBeNull();
    expect(openRouterChat).toHaveBeenCalled();
  });
});
