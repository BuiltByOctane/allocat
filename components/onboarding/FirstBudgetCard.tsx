"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { useHaptic } from "@/lib/hooks/useHaptic";
import {
  PREDEFINED_TEMPLATES,
  type BudgetTemplate,
} from "@/lib/budget-templates";
import { getBudgetForPeriod, setupBudgetFromTemplate } from "@/lib/actions/budget";
import { markUserAsOnboarded } from "@/lib/actions/profile";
import { useFormatCurrency } from "@/lib/hooks/useFormatCurrency";
import { useCurrency } from "@/lib/providers/CurrencyProvider";

// Templates worth offering as a starting point (skip the empty "blank" one —
// "Skip for now" already covers starting empty).
const STARTER_TEMPLATES = PREDEFINED_TEMPLATES.filter((t) => t.id !== "blank");

/** Map a predefined template + total into the setupBudgetFromTemplate payload. */
function templateToSetupCategories(template: BudgetTemplate, total: number) {
  return template.categories.map((c) => ({
    tempId: crypto.randomUUID(),
    name: c.name,
    icon: c.icon,
    type: "misc" as const, // mirrors BudgetSetupSheet's category type
    allocated_amount:
      c.allocationPct != null && total > 0
        ? Math.round((c.allocationPct / 100) * total)
        : 0,
    items: c.items.map((i) => ({
      tempId: crypto.randomUUID(),
      name: i.name,
      planned: i.plannedAmount ?? 0,
      templateItemId: i.templateItemId,
    })),
  }));
}

/**
 * Final onboarding slide: optionally seed a first budget (template + total) so
 * the dashboard lands populated, then mark onboarding complete and enter the app.
 *
 * Runs OUTSIDE the app shell (no IDB/SyncProvider), so it calls the budget
 * server actions directly; the dashboard's hydrateAllTables() reconciles IDB on
 * arrival. Currency is hardcoded INR to match the rest of the app.
 */
export function FirstBudgetCard() {
  const router = useRouter();
  const haptic = useHaptic();
  const reduce = useReducedMotion();
  const fmt = useFormatCurrency();
  const sym = useCurrency().def.symbol;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [total, setTotal] = useState("");
  const [busy, setBusy] = useState(false);

  const totalNum = parseFloat(total) || 0;
  const selected = STARTER_TEMPLATES.find((t) => t.id === selectedId) ?? null;
  const canCreate = totalNum > 0;

  async function complete(withBudget: boolean) {
    if (busy) return;
    haptic.success();
    setBusy(true);

    // Seed the budget — best-effort. A network hiccup must never trap the user
    // on onboarding; they can set it up later in Budget.
    if (withBudget && totalNum > 0) {
      try {
        const now = new Date();
        const budget = await getBudgetForPeriod(
          now.getMonth() + 1,
          now.getFullYear()
        );
        const cats = selected
          ? templateToSetupCategories(selected, totalNum)
          : [];
        await setupBudgetFromTemplate(
          budget.id,
          totalNum,
          cats,
          selected?.id ?? null
        );
      } catch {
        /* proceed without blocking entry */
      }
    }

    try {
      await markUserAsOnboarded();
    } catch {
      /* flag is best-effort; dashboard is still reachable */
    }

    router.push("/dashboard");
  }

  return (
    <div className="flex h-full w-full flex-col gap-6 overflow-y-auto px-7 py-8 no-scrollbar">
      <div className="flex flex-col gap-3">
        <span className="text-[11px] font-bold uppercase tracking-wide text-accent-strong">
          Last step — Your budget
        </span>
        <h1 className="font-display text-[clamp(1.9rem,8vw,2.6rem)] font-bold leading-[0.98] tracking-tight text-white">
          Set your
          <br />
          first budget.
        </h1>
        <p className="text-[15px] leading-relaxed text-white/55">
          Pick a starting point and a monthly amount — you can tweak everything
          later. Or skip and explore first.
        </p>
      </div>

      {/* Template chips */}
      <div className="flex flex-col gap-2">
        {STARTER_TEMPLATES.map((t) => {
          const active = t.id === selectedId;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                haptic.selection();
                setSelectedId(active ? null : t.id);
              }}
              className={`rounded-2xl border p-4 text-left transition-colors ${
                active
                  ? "border-transparent bg-white/[0.06] ring-2 ring-[var(--accent-strong)]"
                  : "border-white/12 bg-white/[0.02] active:bg-white/[0.05]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white">
                  {t.name}
                </span>
                <span
                  className={`material-symbols-outlined text-lg ${
                    active ? "text-accent-strong" : "text-white/25"
                  }`}
                >
                  {active ? "radio_button_checked" : "radio_button_unchecked"}
                </span>
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-white/45">
                {t.description}
              </p>
              {t.preview.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {t.preview.slice(0, 3).map((p) => (
                    <span
                      key={p}
                      className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-medium text-white/55"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Total budget */}
      <div className="flex flex-col gap-2">
        <label className="text-[10px] font-bold uppercase tracking-wide text-white/40">
          Monthly budget ({sym})
        </label>
        <div className="flex items-center gap-2 rounded-2xl border border-white/12 bg-white/[0.02] px-4 py-3 focus-within:border-transparent focus-within:ring-2 focus-within:ring-[var(--accent-strong)]">
          <span className="text-lg text-white/40">{sym}</span>
          <input
            type="number"
            inputMode="decimal"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            placeholder="e.g. 50000"
            min="0"
            className="w-full bg-transparent text-lg font-semibold tabular-nums text-white outline-none placeholder:text-white/25"
          />
        </div>
        {selected && totalNum > 0 && (
          <motion.p
            key={`${selected.id}-${totalNum}`}
            {...(reduce
              ? {}
              : { initial: { opacity: 0 }, animate: { opacity: 1 } })}
            className="text-[11px] font-medium text-white/45"
          >
            {selected.categories.length} categories ·{" "}
            {fmt(totalNum)} allocated across {selected.name}
          </motion.p>
        )}
      </div>

      {/* Actions */}
      <div className="mt-auto flex flex-col gap-3 pt-2">
        <button
          type="button"
          onClick={() => complete(true)}
          disabled={busy || !canCreate}
          className="w-full rounded-pill bg-accent py-4 text-sm font-bold text-[var(--accent-ink)] transition active:scale-[0.98] disabled:opacity-30"
        >
          {busy ? "Setting up…" : "Create & enter AlloCat"}
        </button>
        <button
          type="button"
          onClick={() => complete(false)}
          disabled={busy}
          className="w-full py-2 text-xs font-bold uppercase tracking-widest text-white/45 transition hover:text-white/80 disabled:opacity-40"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
