import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDB, type ReportRow } from "@/lib/db";
import { useEnqueue } from "@/lib/hooks/useSync";
import { getReport } from "@/lib/actions/reports";
import type { Json } from "@/lib/types/database";

export function reportKey(month: number, year: number) {
  return ["report", month, year] as const;
}

// ─── IDB read helper ──────────────────────────────────────────────────────────

export async function getReportFromIDB(
  month: number,
  year: number,
): Promise<ReportRow | null> {
  const db = getDB();
  const row = await db.reports
    .where("[month+year]")
    .equals([month, year])
    .first();
  return row ?? null;
}

// ─── Query ────────────────────────────────────────────────────────────────────

export function useMonthlyReport(month: number, year: number) {
  return useQuery({
    queryKey: reportKey(month, year),
    queryFn: async () => {
      const local = await getReportFromIDB(month, year);
      if (local) return local;
      // IDB miss: fall back to server (returns null if never saved).
      return getReport(month, year);
    },
  });
}

// ─── Mutation ───────────────────────────────────────────────────────────────

export function useSaveReportNotes() {
  const qc = useQueryClient();
  const enqueue = useEnqueue();

  return useMutation({
    mutationFn: async ({
      budgetId,
      month,
      year,
      notes,
      summaryData,
    }: {
      budgetId: string;
      month: number;
      year: number;
      notes: string;
      summaryData?: Json;
    }) => {
      const db = getDB();
      const now = new Date().toISOString();
      const existing = await getReportFromIDB(month, year);

      if (existing) {
        await db.reports.update(existing.id, {
          notes,
          ...(summaryData !== undefined ? { summary_data: summaryData } : {}),
          updated_at: now,
        });
        await enqueue({
          table: "reports",
          operation: "UPDATE",
          recordId: existing.id,
          payload: { budgetId, month, year, notes, summaryData },
        });
        return { id: existing.id };
      }

      const tempId = `temp_${crypto.randomUUID()}`;
      await db.reports.add({
        id: tempId,
        budget_id: budgetId,
        user_id: "__pending__",
        month,
        year,
        notes,
        summary_data: (summaryData ?? {}) as Json,
        created_at: now,
        updated_at: now,
      });
      await enqueue({
        table: "reports",
        operation: "INSERT",
        recordId: tempId,
        tempId,
        payload: { budgetId, month, year, notes, summaryData },
      });
      return { id: tempId };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: reportKey(vars.month, vars.year) });
    },
  });
}
