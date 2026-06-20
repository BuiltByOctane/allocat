import { AllocatDB } from "./AllocatDB";

// Singleton — only created in the browser
let _db: AllocatDB | null = null;

export function getDB(): AllocatDB {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB is only available in the browser");
  }
  if (!_db) {
    _db = new AllocatDB();
  }
  return _db;
}

export { AllocatDB };
export type {
  SyncQueueItem,
  IdMapEntry,
  SyncMetaEntry,
  SyncTable,
  SyncOperation,
  SyncStatus,
  ProfileRow,
  BudgetRow,
  CategoryRow,
  BudgetItemRow,
  AssetRow,
  DebtRow,
  ReportRow,
  SnapshotRow,
  ActivityLogRow,
  MerchantRuleRow,
  SmsTransactionRow,
  SmsBlocklistRow,
  FeedbackRow,
} from "./AllocatDB";
