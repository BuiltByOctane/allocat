// Pure split-transaction maths, validation, dedupe keys and payload types.
// No React, no DB, no network.

export interface SplitPartDraft {
  budgetItemId: string;
  amount: number | null; // UI row; last row's amount ignored
}

export interface SplitPartPayload {
  budgetItemId: string;
  amount: number;
  dedupeKey: string;
  tempId: string | null; // null only for SMS part 1
}

export interface SplitTxnPayload {
  splitId: string;
  sourceTxnId: string | null; // null = manual split
  total: number;
  currency: string;
  label: string | null;
  merchantRaw: string | null; // SMS only
  merchantNormalized: string | null;
  occurredAt: string; // source occurred_at, or now for manual
  parts: SplitPartPayload[];
}

export interface SplitResult {
  ok: true;
  partIdMap: Array<{ tempId: string; realId: string; record: Record<string, unknown> }>;
}

export type SplitIssue =
  | "too_few_parts"
  | "missing_item"
  | "duplicate_item"
  | "bad_amount"
  | "remainder_not_positive";

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function splitRemainder(total: number, typed: number[]): number {
  return roundMoney(total - typed.reduce((s, n) => s + n, 0));
}

function typedAmounts(parts: SplitPartDraft[]): Array<number | null> {
  return parts.slice(0, -1).map((p) => p.amount);
}

export function validateSplit(
  total: number,
  parts: SplitPartDraft[],
): { ok: boolean; remainder: number; issues: SplitIssue[] } {
  const issues: SplitIssue[] = [];
  if (parts.length < 2) issues.push("too_few_parts");
  if (parts.some((p) => !p.budgetItemId)) issues.push("missing_item");
  const ids = parts.map((p) => p.budgetItemId).filter(Boolean);
  if (new Set(ids).size !== ids.length) issues.push("duplicate_item");
  const typed = typedAmounts(parts);
  if (typed.some((a) => a == null || !Number.isFinite(a) || a <= 0)) {
    issues.push("bad_amount");
  }
  const remainder = splitRemainder(
    total,
    typed.filter((a): a is number => a != null && Number.isFinite(a)),
  );
  if (parts.length >= 2 && remainder <= 0) issues.push("remainder_not_positive");
  return { ok: issues.length === 0, remainder, issues };
}

export function resolveSplitAmounts(total: number, parts: SplitPartDraft[]): number[] {
  const typed = typedAmounts(parts).map((a) => a ?? 0);
  return [...typed, splitRemainder(total, typed)];
}

export function smsSplitDedupeKey(baseKey: string, splitId: string, n: number): string {
  return `${baseKey}#split:${splitId}:${n}`;
}

export function manualSplitDedupeKey(splitId: string, n: number): string {
  return `manual_split:${splitId}:${n}`;
}
