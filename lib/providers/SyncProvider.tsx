"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SyncEngine } from "@/lib/sync/SyncEngine";
import { hydrateAllTables, forceRefreshTable } from "@/lib/db/hydrate";
import { prefetchAllQueries } from "@/lib/db/prefetch";
import { installRandomUUIDPolyfill } from "@/lib/utils/uuid";
import type { SyncQueueItem } from "@/lib/db";

// Insecure-origin WebView (http LAN URL) lacks crypto.randomUUID — patch it
// before any mutation hook runs.
installRandomUUIDPolyfill();

interface SyncContextValue {
  pendingCount: number;
  isOnline: boolean;
  isHydrated: boolean;
  engine: SyncEngine | null;
}

const SyncContext = createContext<SyncContextValue>({
  pendingCount: 0,
  isOnline: true,
  isHydrated: false,
  engine: null,
});

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(() =>
    typeof window !== "undefined" ? navigator.onLine : true
  );
  const [isHydrated, setIsHydrated] = useState(false);
  const qc = useQueryClient();

  // Engine is created once — no callbacks yet (registered in the effect below)
  const [engine] = useState(() => new SyncEngine());

  const handleSynced = useCallback(
    async (item: SyncQueueItem) => {
      // After a successful sync, real IDs replace temp ones in IDB. Invalidate
      // the queries that read affected tables so UI links pick up real IDs.
      if (
        item.table === "budgets" ||
        item.table === "categories" ||
        item.table === "budget_items"
      ) {
        qc.invalidateQueries({ queryKey: ["budget"] });
        qc.invalidateQueries({ queryKey: ["categoryData"] });
        qc.invalidateQueries({ queryKey: ["dashboard"] });
      }
      if (
        item.table === "assets" ||
        item.table === "asset_categories" ||
        item.table === "asset_value_history"
      ) {
        qc.invalidateQueries({ queryKey: ["net-worth"] });
        qc.invalidateQueries({ queryKey: ["goals"] });
        qc.invalidateQueries({ queryKey: ["dashboard"] });
      }
      if (item.table === "debts") {
        qc.invalidateQueries({ queryKey: ["debt"] });
        qc.invalidateQueries({ queryKey: ["dashboard"] });
      }

      // Server-side cascade can mutate other tables. Pull fresh state for
      // those so IDB matches the server before any subsequent read.
      if (
        item.table === "budget_items" &&
        (item.operation === "UPDATE" || item.operation === "PAYMENT")
      ) {
        try {
          await Promise.all([
            forceRefreshTable("assets"),
            forceRefreshTable("asset_value_history"),
            forceRefreshTable("debts"),
          ]);
          qc.refetchQueries({ queryKey: ["net-worth"], type: "all" });
          qc.refetchQueries({ queryKey: ["goals"], type: "all" });
          qc.refetchQueries({ queryKey: ["debt"], type: "all" });
          qc.refetchQueries({ queryKey: ["asset-history"], type: "all" });
          qc.refetchQueries({ queryKey: ["dashboard"], type: "all" });
        } catch (err) {
          console.warn("[SyncEngine] Post-sync refresh failed:", err);
        }
      }
      // SMS ingest / categorize logs a spend server-side (quickLogSpend cascade)
      // → pull fresh budget state so IDB matches the server.
      if (item.table === "sms_transactions") {
        qc.invalidateQueries({ queryKey: ["sms-transactions"] });
        if (item.operation === "INSERT" || item.operation === "CATEGORIZE") {
          try {
            await Promise.all([
              forceRefreshTable("budget_items"),
              forceRefreshTable("assets"),
              forceRefreshTable("debts"),
            ]);
            qc.refetchQueries({ queryKey: ["budget"], type: "all" });
            qc.refetchQueries({ queryKey: ["dashboard"], type: "all" });
            qc.refetchQueries({ queryKey: ["sms-transactions"], type: "all" });
          } catch (err) {
            console.warn("[SyncEngine] Post-SMS refresh failed:", err);
          }
        }
      }
      if (item.table === "assets" && item.operation === "ACHIEVE") {
        try {
          await Promise.all([
            forceRefreshTable("assets"),
            forceRefreshTable("budget_items"),
            forceRefreshTable("net_worth_snapshots"),
          ]);
          qc.refetchQueries({ queryKey: ["net-worth"], type: "all" });
          qc.refetchQueries({ queryKey: ["goals"], type: "all" });
          qc.refetchQueries({ queryKey: ["budget"], type: "all" });
          qc.refetchQueries({ queryKey: ["dashboard"], type: "all" });
        } catch (err) {
          console.warn("[SyncEngine] Post-achieve refresh failed:", err);
        }
      }
    },
    [qc]
  );

  const handleRollback = useCallback(
    (item: SyncQueueItem, error: string) => {
      if (
        item.table === "budget_items" ||
        item.table === "categories" ||
        item.table === "budgets"
      ) {
        qc.invalidateQueries({ queryKey: ["budget"] });
        qc.invalidateQueries({ queryKey: ["categoryData"] });
      }
      if (item.table === "budgets") {
        qc.invalidateQueries({ queryKey: ["dashboard"] });
      }
      if (item.table === "assets" || item.table === "debts") {
        qc.invalidateQueries({ queryKey: ["net-worth"] });
        qc.invalidateQueries({ queryKey: ["goals"] });
        qc.invalidateQueries({ queryKey: ["dashboard"] });
      }
      if (item.table === "debts") {
        qc.invalidateQueries({ queryKey: ["debt"] });
      }
      // TODO: surface a toast with `error`
      console.error("[SyncEngine] Permanent failure — rolled back", {
        table: item.table,
        operation: item.operation,
        error,
      });
    },
    [qc]
  );

  // Register callbacks in an effect (safe — never during render)
  useEffect(() => {
    engine.setCallbacks({
      onPendingChange: setPendingCount,
      onRollback: handleRollback,
      onSynced: handleSynced,
    });
    return () => engine.setCallbacks({});
  }, [engine, setPendingCount, handleRollback, handleSynced]);

  useEffect(() => {
    let mounted = true;

    hydrateAllTables()
      .then(async () => {
        if (!mounted) return;
        // Warm all page queries before marking hydration done —
        // pages render instantly with no skeletons on first navigation.
        await prefetchAllQueries(qc);
        setIsHydrated(true);
        engine.start();
        const count = await engine.getPendingCount();
        if (mounted) setPendingCount(count);
      })
      .catch((err) => {
        console.warn("[SyncProvider] Hydration failed (offline?):", err);
        if (!mounted) return;
        setIsHydrated(true);
        engine.start();
      });

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      mounted = false;
      engine.stop();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [engine]);

  return (
    <SyncContext.Provider value={{ pendingCount, isOnline, isHydrated, engine }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSyncContext() {
  return useContext(SyncContext);
}
