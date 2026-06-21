import { describe, expect, it } from "vitest";
import {
  resolveRuleItemId,
  selectRuleForPeriod,
  type RuleResolutionContext,
} from "./resolveRuleItem";
import type { MerchantRule } from "./match";

const TPL = "tpl-groceries";
const ITEM = "ti-dining";

/** A budget built from template TPL with one stamped item. */
function ctx(
  template_id: string | null,
  items: RuleResolutionContext["items"],
): RuleResolutionContext {
  return { budget: { id: "budget-x", template_id }, items };
}

describe("resolveRuleItemId", () => {
  it("maps a durable rule to the current month's item with the same template identity", () => {
    const id = resolveRuleItemId(
      { template_id: TPL, template_item_id: ITEM, budget_item_id: "old-jan-item" },
      ctx(TPL, [
        { id: "feb-item", template_id: TPL, template_item_id: ITEM },
        { id: "feb-other", template_id: TPL, template_item_id: "ti-rent" },
      ]),
    );
    expect(id).toBe("feb-item");
  });

  it("returns null when the current budget came from a different template", () => {
    const id = resolveRuleItemId(
      { template_id: TPL, template_item_id: ITEM, budget_item_id: "old-jan-item" },
      ctx("some-other-template", [
        { id: "feb-item", template_id: "some-other-template", template_item_id: ITEM },
      ]),
    );
    expect(id).toBeNull();
  });

  it("returns null when the template item was removed from this month's budget", () => {
    const id = resolveRuleItemId(
      { template_id: TPL, template_item_id: ITEM, budget_item_id: "old-jan-item" },
      ctx(TPL, [{ id: "feb-other", template_id: TPL, template_item_id: "ti-rent" }]),
    );
    expect(id).toBeNull();
  });

  it("returns null when no budget exists yet for the period", () => {
    const id = resolveRuleItemId(
      { template_id: TPL, template_item_id: ITEM, budget_item_id: "old-jan-item" },
      { budget: null, items: [] },
    );
    expect(id).toBeNull();
  });

  it("is ambiguity-safe: duplicate template_item_id in a budget resolves to null", () => {
    const id = resolveRuleItemId(
      { template_id: TPL, template_item_id: ITEM, budget_item_id: null },
      ctx(TPL, [
        { id: "dup-a", template_id: TPL, template_item_id: ITEM },
        { id: "dup-b", template_id: TPL, template_item_id: ITEM },
      ]),
    );
    expect(id).toBeNull();
  });

  describe("legacy rules (no durable key)", () => {
    it("returns the cached budget_item_id when it belongs to the current budget (same month)", () => {
      const id = resolveRuleItemId(
        { template_id: null, template_item_id: null, budget_item_id: "jan-item" },
        ctx(TPL, [{ id: "jan-item", template_id: null, template_item_id: null }]),
      );
      expect(id).toBe("jan-item");
    });

    it("returns null when the cached item is from another month's budget", () => {
      const id = resolveRuleItemId(
        { template_id: null, template_item_id: null, budget_item_id: "jan-item" },
        ctx(TPL, [{ id: "feb-item", template_id: TPL, template_item_id: ITEM }]),
      );
      expect(id).toBeNull();
    });

    it("returns null when a legacy rule has no cached item at all", () => {
      const id = resolveRuleItemId(
        { template_id: null, template_item_id: null, budget_item_id: null },
        ctx(TPL, [{ id: "feb-item", template_id: TPL, template_item_id: ITEM }]),
      );
      expect(id).toBeNull();
    });
  });
});

describe("selectRuleForPeriod", () => {
  function rule(over: Partial<MerchantRule>): MerchantRule {
    return {
      id: "r",
      match_type: "contains",
      pattern: "zomato",
      auto_apply: true,
      template_id: TPL,
      template_item_id: ITEM,
      budget_item_id: null,
      category_id: null,
      ...over,
    };
  }

  it("skips a stale rule and picks the next matching rule that resolves", () => {
    const stale = rule({ id: "stale", template_item_id: "ti-removed" });
    const good = rule({ id: "good", template_item_id: ITEM });
    const sel = selectRuleForPeriod(
      [stale, good], // stale first — must not shadow `good`
      ctx(TPL, [{ id: "feb-item", template_id: TPL, template_item_id: ITEM }]),
    );
    expect(sel?.rule.id).toBe("good");
    expect(sel?.itemId).toBe("feb-item");
  });

  it("returns null when no matching rule resolves", () => {
    const stale = rule({ id: "stale", template_item_id: "ti-removed" });
    const sel = selectRuleForPeriod(
      [stale],
      ctx(TPL, [{ id: "feb-item", template_id: TPL, template_item_id: ITEM }]),
    );
    expect(sel).toBeNull();
  });

  it("skips rules with auto_apply disabled", () => {
    const manual = rule({ id: "manual", auto_apply: false });
    const sel = selectRuleForPeriod(
      [manual],
      ctx(TPL, [{ id: "feb-item", template_id: TPL, template_item_id: ITEM }]),
    );
    expect(sel).toBeNull();
  });

  it("returns the first rule when several resolve (precedence preserved)", () => {
    const first = rule({ id: "first" });
    const second = rule({ id: "second" });
    const sel = selectRuleForPeriod(
      [first, second],
      ctx(TPL, [{ id: "feb-item", template_id: TPL, template_item_id: ITEM }]),
    );
    expect(sel?.rule.id).toBe("first");
  });
});
