"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useHaptic } from "@/lib/hooks/useHaptic";
import { parseSpend } from "@/lib/ai/parseSpend";
import { ManualSpendSheet } from "@/components/dashboard/ManualSpendSheet";

/**
 * Dashboard entry point for a manual spend: the page's primary CTA, opens the
 * amount → item sheet. Also handles `?shared=` (Web Share Target) and
 * `?focus=quick-spend` (manifest shortcut) by opening the sheet pre-filled.
 */
export default function ManualSpendButton() {
  const haptic = useHaptic();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState<{ amount: number | null; label: string | null }>({
    amount: null,
    label: null,
  });

  useEffect(() => {
    const shared = searchParams.get("shared");
    const focusFlag = searchParams.get("focus") === "quick-spend";
    if (!shared && !focusFlag) return;

    queueMicrotask(() => {
      if (shared) {
        const parsed = parseSpend(shared);
        setSeed({ amount: parsed.amount, label: parsed.note || parsed.raw || null });
      } else {
        setSeed({ amount: null, label: null });
      }
      setOpen(true);

      const url = new URL(window.location.href);
      url.searchParams.delete("shared");
      url.searchParams.delete("focus");
      router.replace(url.pathname + (url.search ? url.search : ""), { scroll: false });
    });
  }, [searchParams, router]);

  return (
    <>
      <button
        type="button"
        id="dashboard-quick-spend"
        onClick={() => {
          haptic.light();
          setSeed({ amount: null, label: null });
          setOpen(true);
        }}
        className="w-full flex items-center gap-3 rounded-pill bg-[var(--pill)] text-[var(--pill-foreground)] py-2 pl-2 pr-5 text-left ring-1 ring-inset ring-white/10 shadow-[0_8px_20px_-10px_rgba(0,0,0,0.45)] active:scale-[0.98] transition-transform"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-[var(--accent-ink)]">
          <span className="material-symbols-outlined text-[26px]">add</span>
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-bold leading-tight">Log a spend</span>
          <span className="block text-[11px] font-medium opacity-60 mt-0.5">
            Cash or anything SMS didn&apos;t catch
          </span>
        </span>
        <span className="material-symbols-outlined text-[20px] opacity-60">arrow_forward</span>
      </button>

      <ManualSpendSheet
        open={open}
        onOpenChange={setOpen}
        initialAmount={seed.amount}
        initialLabel={seed.label}
      />
    </>
  );
}
