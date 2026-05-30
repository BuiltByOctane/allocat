"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getDB } from "@/lib/db";
import { updateUserCurrency } from "@/lib/actions/profile";
import { PROFILE_KEY } from "@/lib/hooks/useProfile";
import { isKnownCurrency } from "@/lib/currency/catalog";

export function useUpdateCurrency() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (code: string) => {
      if (!isKnownCurrency(code)) {
        throw new Error(`Unsupported currency: ${code}`);
      }

      // Optimistic IDB write so the UI re-renders immediately.
      const db = getDB();
      const rows = await db.profiles.toArray();
      const current = rows[0];
      if (current) {
        await db.profiles.put({ ...current, currency: code });
      }

      const result = await updateUserCurrency(code);
      if ("error" in result && result.error) {
        // Roll back IDB on server failure.
        if (current) await db.profiles.put(current);
        throw new Error(result.error);
      }
      return code;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PROFILE_KEY });
    },
  });
}
