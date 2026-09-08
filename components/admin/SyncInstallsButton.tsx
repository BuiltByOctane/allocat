"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { syncPlayInstallsNow } from "@/lib/admin/actions";

export function SyncInstallsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        loading={pending}
        onClick={() => {
          setMsg(null);
          startTransition(async () => {
            const res = await syncPlayInstallsNow();
            setMsg("error" in res ? `✕ ${res.error}` : `✓ ${res.rows} day-rows updated`);
            if (!("error" in res)) router.refresh();
          });
        }}
      >
        Sync now
      </Button>
      {msg && <span className="t-body-sm font-semibold">{msg}</span>}
    </div>
  );
}
