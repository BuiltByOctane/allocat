"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import {
  sendTestPushTo,
  forceSignOutUser,
  setSupporterFlag,
  deleteUserAccount,
} from "@/lib/admin/actions";

/**
 * Support-desk operations for one account.
 *
 * Deletion is guarded by typing the account's own email: the destructive button
 * sits next to routine ones, and a misclick here is unrecoverable.
 */
export function UserActions({
  userId,
  email,
  isSupporter,
}: {
  userId: string;
  email: string;
  isSupporter: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");

  const run = (fn: () => Promise<{ ok: true } | { error: string }>, okMsg: string) => {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      setMsg("error" in res ? `✕ ${res.error}` : `✓ ${okMsg}`);
      if (!("error" in res)) router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => sendTestPushTo(userId), "Test push sent")}>
          Send test push
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => forceSignOutUser(userId), "Sessions revoked")}>
          Force sign-out
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => setSupporterFlag(userId, !isSupporter), isSupporter ? "Badge removed" : "Badge granted")}
        >
          {isSupporter ? "Remove supporter badge" : "Grant supporter badge"}
        </Button>
      </div>

      <div className="rounded-tile border border-[var(--neg)] border-dashed p-3 flex flex-col gap-2">
        <div className="t-label-sm text-neg">Danger zone</div>
        <p className="t-body-sm text-muted-foreground">
          Deleting removes the auth user; every table cascades. Irreversible. Type{" "}
          <span className="font-mono">{email}</span> to enable.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={email}
            className="flex-1 min-w-[220px] rounded-pill bg-background px-4 py-2 t-body-sm border border-border outline-none focus:border-foreground/40"
          />
          <Button
            size="sm"
            variant="danger"
            disabled={pending || confirm.trim().toLowerCase() !== email.trim().toLowerCase()}
            onClick={() =>
              run(async () => {
                const res = await deleteUserAccount(userId, confirm);
                if (!("error" in res)) router.push("/admin/users");
                return res;
              }, "Account deleted")
            }
          >
            Delete account
          </Button>
        </div>
      </div>

      {msg && <p className="t-body-sm font-semibold">{msg}</p>}
    </div>
  );
}
