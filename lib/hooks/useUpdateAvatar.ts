"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getDB } from "@/lib/db";
import { updateUserAvatar } from "@/lib/actions/profile";
import { PROFILE_KEY } from "@/lib/hooks/useProfile";
import { isKnownAvatar } from "@/lib/profile/avatars";

export function useUpdateAvatar() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (avatarId: string) => {
      if (!isKnownAvatar(avatarId)) {
        throw new Error(`Unknown avatar: ${avatarId}`);
      }

      // Optimistic IDB write so the UI re-renders immediately.
      const db = getDB();
      const rows = await db.profiles.toArray();
      const current = rows[0];
      if (current) {
        await db.profiles.put({ ...current, avatar: avatarId });
      }

      const result = await updateUserAvatar(avatarId);
      if ("error" in result && result.error) {
        // Roll back IDB on server failure.
        if (current) await db.profiles.put(current);
        throw new Error(result.error);
      }
      return avatarId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PROFILE_KEY });
    },
  });
}
