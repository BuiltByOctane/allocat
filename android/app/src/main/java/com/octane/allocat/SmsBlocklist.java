package com.octane.allocat;

import android.content.Context;

import org.json.JSONArray;

/**
 * Native mirror of the sms_blocklist table (template keys the user reported as
 * mistakes), pushed from JS via SmsReader.setBlocklist. The closed-app receiver
 * computes a template key (SmsSignature.templateKey) for each incoming SMS and
 * skips it entirely if the key is in this set — so a reported template neither
 * notifies nor queues. Stored as a JSON array of hex template-key strings.
 */
final class SmsBlocklist {
    private static final String PREF = "allocat_blocklist";
    private static final String KEY = "keys";

    private SmsBlocklist() {}

    static void set(Context c, String json) {
        c.getSharedPreferences(PREF, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY, json == null ? "[]" : json)
            .apply();
    }

    /** True if `key` is in the stored blocklist array. */
    static boolean contains(Context c, String key) {
        if (key == null || key.isEmpty()) return false;
        String s = c.getSharedPreferences(PREF, Context.MODE_PRIVATE).getString(KEY, "[]");
        try {
            JSONArray a = new JSONArray(s);
            for (int i = 0; i < a.length(); i++) {
                if (key.equals(a.optString(i))) return true;
            }
        } catch (Exception ignored) {
        }
        return false;
    }
}
