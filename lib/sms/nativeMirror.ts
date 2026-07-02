/**
 * Shared builder for the native closed-app SMS mirror: current merchant
 * rules (resolved to THIS month's budget item), quick-allocate targets, and
 * notification config, pushed to the native `SmsReader` plugin so the
 * closed-app receiver can label + route notifications without a network call.
 *
 * Replaces two near-identical builders that used to live in
 * components/pwa/SmsBridge.tsx (`pushRules`) and
 * lib/hooks/useSmsTransactions.ts (`pushRulesToNative`). Both had the same
 * cross-month bug (Bug A): a rule that couldn't durably resolve to THIS
 * month's item fell back to `itemsById.get(rule.budget_item_id)` with no
 * month guard, mirroring LAST month's item numbers (and native then computed
 * "budget overflown" off a stale budget). Fixed by routing every rule through
 * `resolveRuleItemId` — the single source of truth already used by the ingest
 * paths — and omitting any rule that doesn't resolve this month (Bug D: quick
 * targets are now also scoped to the current month only).
 */
import { Capacitor } from "@capacitor/core";
import { getDB } from "@/lib/db";
import type {
  MerchantRuleRow,
  CategoryRow,
  BudgetItemRow,
  BudgetRow,
} from "@/lib/db";
import { resolveRuleItemId } from "./resolveRuleItem";
import { SmsReader } from "@/lib/native/SmsReader";
import { confirmAutoAllocate, notifSound } from "./notifPrefs";
import { nativeSoundKey } from "@/lib/native/notifSounds";

/**
 * Payload shape SmsReader.setRules expects — native Java parses these field
 * names verbatim, so don't rename without updating SmsParser/SmsNotifier.
 */
export interface NativeRulePayload {
  match_type: string;
  pattern: string;
  category: string;
  allocated: number;
  spent: number;
  itemName: string;
  itemPlanned: number;
  itemActual: number;
  itemOverspendCount: number;
}

export interface NativeMirrorResult {
  /** Only rules resolvable to a CURRENT-month budget item. */
  rules: NativeRulePayload[];
  /** Top-3 current-month items by actual_amount, for quick-allocate buttons. */
  targets: Array<{ id: string; name: string }>;
  /** Zero-padded "YYYY-MM" of `now`. */
  period: string;
}

function periodOf(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

/**
 * Build the native mirror payload from a snapshot of the 4 mirrored tables.
 * PURE — no IDB/native access — so it's unit-testable with plain objects. See
 * lib/sms/nativeMirror.test.ts.
 */
export function buildNativeSmsMirror(
  data: {
    rules: MerchantRuleRow[];
    cats: CategoryRow[];
    items: BudgetItemRow[];
    budgets: BudgetRow[];
  },
  now: Date,
): NativeMirrorResult {
  const { rules, cats, items, budgets } = data;
  const period = periodOf(now);

  const curBudget = budgets.find(
    (b) => b.month === now.getMonth() + 1 && b.year === now.getFullYear(),
  );
  const curCatIds = new Set(
    cats.filter((c) => c.budget_id === curBudget?.id).map((c) => c.id),
  );
  // Scope everything to THIS month's items only — the Bug A/D month guard.
  const curItems = items.filter((it) => curCatIds.has(it.category_id));
  const curItemsById = new Map(curItems.map((it) => [it.id, it]));

  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const catAlloc = new Map(cats.map((c) => [c.id, Number(c.allocated_amount)]));
  const catSpent = new Map<string, number>();
  for (const it of curItems) {
    catSpent.set(
      it.category_id,
      (catSpent.get(it.category_id) ?? 0) + Number(it.actual_amount),
    );
  }

  const rulePayloads: NativeRulePayload[] = [];
  for (const r of rules) {
    const itemId = resolveRuleItemId(r, {
      budget: curBudget
        ? { id: curBudget.id, template_id: curBudget.template_id }
        : null,
      items: curItems,
    });
    // Unresolved this month → OMIT entirely. Native's `mr == null` path posts
    // a generic "wild spend" notification instead of wrongly labeling one
    // with a stale (last month's) item.
    if (!itemId) continue;
    const it = curItemsById.get(itemId);
    if (!it) continue; // defensive — resolveRuleItemId only returns ids drawn from curItems
    const catId = it.category_id;
    rulePayloads.push({
      match_type: r.match_type,
      pattern: r.pattern,
      category: catName.get(catId) ?? "",
      allocated: catAlloc.get(catId) ?? 0,
      spent: catSpent.get(catId) ?? 0,
      itemName: it.name,
      itemPlanned: Number(it.planned_amount),
      itemActual: Number(it.actual_amount),
      itemOverspendCount: Number(it.overspend_count ?? 0),
    });
  }

  // Top budget items (most-used) for the notification quick-allocate buttons —
  // current month only (Bug D: previously top-3 across ALL months).
  const targets = [...curItems]
    .sort((a, b) => Number(b.actual_amount) - Number(a.actual_amount))
    .slice(0, 3)
    .map((it) => ({ id: it.id, name: it.name }));

  return { rules: rulePayloads, targets, period };
}

/** Signature of the last payload pushed, so an unchanged foreground/mutation skips the native IPC. */
let lastSig: string | null = null;

/**
 * Impure wrapper: reads the 4 mirrored tables from IDB, builds the payload via
 * `buildNativeSmsMirror`, and pushes it to the native SmsReader plugin. No-op
 * on web. Every SMS mutation (via `invalidateSmsCaches`) and budget setup
 * (`BudgetSetupSheet.handleCreate`) calls this — the module-level signature
 * guard makes the redundant calls free.
 */
export async function pushSmsMirrorToNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const db = getDB();
    const [rules, cats, items, budgets] = await Promise.all([
      db.merchant_rules.toArray(),
      db.categories.toArray(),
      db.budget_items.toArray(),
      db.budgets.toArray(),
    ]);
    const {
      rules: rulePayloads,
      targets,
      period,
    } = buildNativeSmsMirror({ rules, cats, items, budgets }, new Date());

    const rulesStr = JSON.stringify(rulePayloads);
    const targetsStr = JSON.stringify(targets);
    const config = {
      confirmAutoAllocate: confirmAutoAllocate(),
      sound: nativeSoundKey(notifSound()),
    };

    // Skip the native IPC when nothing the receiver cares about changed —
    // avoids re-serializing + re-crossing the bridge on every foreground.
    // `period` is included so a month rollover with an otherwise
    // byte-identical payload still pushes (native's period stamp must move).
    const sig = `${rulesStr}|${targetsStr}|${JSON.stringify(config)}|${period}`;
    if (sig === lastSig) return;
    lastSig = sig;

    await SmsReader.setRules({ rules: rulesStr, period });
    await SmsReader.setQuickTargets({ targets: targetsStr });
    await SmsReader.setConfig(config);
  } catch {
    /* native unavailable — ignore */
  }
}
