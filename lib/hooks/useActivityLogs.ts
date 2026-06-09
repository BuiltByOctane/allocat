import { useQuery } from "@tanstack/react-query";
import {
  getActivityLogs,
  getActivityLogsForItem,
} from "@/lib/actions/activity-logs";
import { getDB, type ActivityLogRow } from "@/lib/db";

export const ACTIVITY_LOGS_KEY = ["activity-logs"] as const;

export function itemActivityKey(itemId: string) {
  return ["item-activity", itemId] as const;
}

type ActivityCategory = "budget" | "net_worth" | "goals" | "debts";

export interface SelectedMonth {
  month: number; // 0-indexed (0 = Jan)
  year: number;
}

export interface ActivityFilter {
  category: ActivityCategory | "all";
  selectedMonth: SelectedMonth | null; // null = All Time
}

async function fetchLogs(): Promise<ActivityLogRow[]> {
  const db = getDB();

  const meta = await db.sync_meta.get("activity_logs");
  const isStale = !meta || Date.now() - meta.lastSynced > 5 * 60 * 1000;

  const local = await db.activity_logs
    .orderBy("created_at")
    .reverse()
    .limit(200)
    .toArray();

  if (!isStale && local.length > 0) return local;

  const fresh = await getActivityLogs(200);
  if (fresh.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.activity_logs.bulkPut(fresh as any);
  }
  await db.sync_meta.put({ table: "activity_logs", lastSynced: Date.now() });

  return fresh as ActivityLogRow[];
}

// ─── Per-item activity (transactions in the item sheet) ────────────────────────

async function fetchItemLogs(itemId: string): Promise<ActivityLogRow[]> {
  const db = getDB();

  // IDB-first — instant, offline. Cached logs already carry metadata.itemId.
  const local = (
    await db.activity_logs.orderBy("created_at").reverse().toArray()
  ).filter(
    (l) => (l.metadata as { itemId?: string } | null)?.itemId === itemId
  );

  try {
    const fresh = await getActivityLogsForItem(itemId);
    if (fresh.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.activity_logs.bulkPut(fresh as any);
    }
    return fresh as ActivityLogRow[];
  } catch {
    // Offline / fetch failed — fall back to whatever we have cached.
    return local;
  }
}

export function useItemActivity(itemId: string | null, enabled: boolean) {
  const isReal =
    !!itemId && itemId !== "__new__" && !itemId.startsWith("temp_");

  return useQuery({
    queryKey: itemActivityKey(itemId ?? "none"),
    queryFn: () => fetchItemLogs(itemId!),
    enabled: enabled && isReal,
    staleTime: 30_000,
  });
}

export function useActivityLogs(filter: ActivityFilter) {
  const query = useQuery({
    queryKey: ACTIVITY_LOGS_KEY,
    queryFn: fetchLogs,
    staleTime: 30_000,
  });

  const allLogs = query.data ?? [];
  const filtered = applyFilter(allLogs, filter);
  const availableMonths = computeAvailableMonths(allLogs);

  return { ...query, data: filtered, availableMonths };
}

function applyFilter(
  logs: ActivityLogRow[],
  filter: ActivityFilter
): ActivityLogRow[] {
  let result = logs;

  if (filter.category !== "all") {
    result = result.filter((l) => l.category === filter.category);
  }

  if (filter.selectedMonth !== null) {
    const { month, year } = filter.selectedMonth!;
    result = result.filter((l) => {
      const d = new Date(l.created_at);
      return d.getMonth() === month && d.getFullYear() === year;
    });
  }

  return result;
}

export function computeAvailableMonths(logs: ActivityLogRow[]): SelectedMonth[] {
  const seen = new Set<string>();
  const months: SelectedMonth[] = [];
  for (const log of logs) {
    const d = new Date(log.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!seen.has(key)) {
      seen.add(key);
      months.push({ month: d.getMonth(), year: d.getFullYear() });
    }
  }
  // Already sorted newest-first since logs come in descending order
  return months;
}

export function groupLogsByDate(
  logs: ActivityLogRow[]
): { label: string; items: ActivityLogRow[] }[] {
  const groups = new Map<string, ActivityLogRow[]>();

  const todayStr = new Date().toDateString();
  const yesterdayStr = new Date(Date.now() - 86_400_000).toDateString();

  for (const log of logs) {
    const d = new Date(log.created_at);
    const ds = d.toDateString();
    let label: string;
    if (ds === todayStr) label = "Today";
    else if (ds === yesterdayStr) label = "Yesterday";
    else
      label = d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });

    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(log);
  }

  return Array.from(groups.entries()).map(([label, items]) => ({
    label,
    items,
  }));
}
