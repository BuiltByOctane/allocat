package com.octane.allocat;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Ephemeral per-item overspend tally for the closed-app path: how many times an
 * item has gone over plan in closed-app spends since the last app open. Display-only,
 * never synced. Cleared when JS pushes a fresh snapshot via setRules (the durable
 * count rides on the rule snapshot's itemOverspendCount). Mirror of SmsAccum.
 */
final class SmsOverspend {
    private static final String PREF = "allocat_sms_overspend";

    private SmsOverspend() {}

    static int get(Context c, String itemName) {
        String k = key(itemName);
        if (k == null) return 0;
        return c.getSharedPreferences(PREF, Context.MODE_PRIVATE).getInt(k, 0);
    }

    static void add(Context c, String itemName, int delta) {
        String k = key(itemName);
        if (k == null) return;
        SharedPreferences p = c.getSharedPreferences(PREF, Context.MODE_PRIVATE);
        p.edit().putInt(k, p.getInt(k, 0) + delta).apply();
    }

    static void clear(Context c) {
        c.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().clear().apply();
    }

    private static String key(String itemName) {
        if (itemName == null || itemName.trim().isEmpty()) return null;
        return itemName.trim().toLowerCase();
    }
}
