"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Capacitor } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
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

  // Re-pull server→IDB when the app returns to the foreground / reconnects.
  // With `staleTime: Infinity` + `refetchOnWindowFocus: false`, cold-launch
  // hydration is otherwise the ONLY server pull, so a backgrounded WebView shows
  // stale data on resume. Throttled so rapid focus flips don't hammer Supabase.
  const lastRefreshRef = useRef(0);
  const refreshFromServer = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    const now = Date.now();
    if (now - lastRefreshRef.current < 20_000) return;
    lastRefreshRef.current = now;
    try {
      await hydrateAllTables();
      await qc.refetchQueries({ type: "active" });
    } catch (err) {
      console.warn("[SyncProvider] Foreground refresh failed:", err);
    }
  }, [qc]);

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
        // Category-detail item list is keyed separately — a temp→real INSERT swap
        // must refresh it too or the row lingers under its temp id.
        qc.invalidateQueries({ queryKey: ["categoryItems"] });
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
        // UPDATE and PAYMENT (quick-spend) can both cascade server-side into a
        // linked asset/debt — pull fresh state so IDB matches.
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
        // IDB is now populated → pages can read it. Mark hydrated + start the
        // engine FIRST so the UI (and the first-run setup/tour modals) become
        // interactive immediately. Warming the React Query cache is a no-skeleton
        // optimization, not a correctness gate, so do it in the background —
        // awaiting it here used to keep the WebView's main thread busy through a
        // 4-query prefetch on launch, which froze the first-run modals.
        setIsHydrated(true);
        engine.start();
        void prefetchAllQueries(qc).catch(() => {});
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

  // Foreground / reconnect / native-resume → re-pull server state into IDB.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshFromServer();
    };
    const onOnline = () => void refreshFromServer();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    let resumeHandle: PluginListenerHandle | undefined;
    if (Capacitor.isNativePlatform()) {
      void import("@capacitor/app")
        .then(({ App }) => App.addListener("resume", () => void refreshFromServer()))
        .then((handle) => {
          resumeHandle = handle;
        })
        .catch(() => {});
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      void resumeHandle?.remove();
    };
  }, [refreshFromServer]);

  return (
    <SyncContext.Provider value={{ pendingCount, isOnline, isHydrated, engine }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSyncContext() {
  return useContext(SyncContext);
}
