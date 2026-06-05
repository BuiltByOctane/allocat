/**
 * Device-local notification preferences (shared by the web ingest path, the
 * Profile toggle, and pushed to the native layer for the closed-app path).
 */
const CONFIRM_KEY = "allocat-confirm-autoallocate";

/** Whether to show a subtle confirmation when a known merchant auto-allocates. Default ON. */
export function confirmAutoAllocate(): boolean {
  try {
    return localStorage.getItem(CONFIRM_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setConfirmAutoAllocate(on: boolean): void {
  try {
    localStorage.setItem(CONFIRM_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}
