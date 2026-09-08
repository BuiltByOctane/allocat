import { describe, it, expect } from "vitest";
import { pick } from "./pick";

describe("pick", () => {
  it("keeps only whitelisted keys", () => {
    const input = { name: "a", value: 1, user_id: "evil", achieved_at: "x" } as Record<string, unknown>;
    expect(pick(input, ["name", "value"])).toEqual({ name: "a", value: 1 });
  });

  it("drops undefined but keeps null", () => {
    const input = { name: undefined, icon: null } as Record<string, unknown>;
    expect(pick(input, ["name", "icon"])).toEqual({ icon: null });
  });

  it("ignores prototype-injected keys", () => {
    const input = JSON.parse('{"__proto__":{"x":1},"name":"ok"}') as Record<string, unknown>;
    expect(pick(input, ["name"])).toEqual({ name: "ok" });
  });
});
