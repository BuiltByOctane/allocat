package com.octane.allocat;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.regex.Pattern;

/**
 * Native mirror of the merchant rules + the matched category's budget state,
 * pushed from JS via SmsReader.setRules so the receiver can both label a
 * closed-app notification AND decide whether the spend trips the budget limit.
 * Each rule: { match_type, pattern, category, allocated, spent }.
 */
final class SmsRules {
    private static final String PREF = "allocat_rules";
    private static final String KEY = "rules";

    private SmsRules() {}

    static final class Match {
        String category = "";
        double allocated = 0;
        double spent = 0;
        String itemName = "";
        double itemPlanned = 0;
        double itemActual = 0;
        int itemOverspendCount = 0;
    }

    static void set(Context c, String json) {
        c.getSharedPreferences(PREF, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY, json == null ? "[]" : json)
            .apply();
    }

    /** Matched rule's category + budget snapshot, or null when nothing matches. */
    static Match match(Context c, String normMerchant) {
        if (normMerchant == null || normMerchant.isEmpty()) return null;
        String s = c.getSharedPreferences(PREF, Context.MODE_PRIVATE).getString(KEY, "[]");
        try {
            JSONArray a = new JSONArray(s);
            for (String tier : new String[] { "exact", "contains", "regex" }) {
                for (int i = 0; i < a.length(); i++) {
                    JSONObject o = a.getJSONObject(i);
                    if (!tier.equals(o.optString("match_type"))) continue;
                    if (matches(tier, o.optString("pattern"), normMerchant)) {
                        Match m = new Match();
                        m.category = o.optString("category", "");
                        m.allocated = o.optDouble("allocated", 0);
                        m.spent = o.optDouble("spent", 0);
                        m.itemName = o.optString("itemName", "");
                        m.itemPlanned = o.optDouble("itemPlanned", 0);
                        m.itemActual = o.optDouble("itemActual", 0);
                        m.itemOverspendCount = o.optInt("itemOverspendCount", 0);
                        return m;
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    private static boolean matches(String tier, String pattern, String norm) {
        String p = SmsParser.normalize(pattern);
        switch (tier) {
            case "exact":
                return p.equals(norm);
            case "contains":
                return p.length() > 0 && norm.contains(p);
            case "regex":
                try {
                    return Pattern.compile(pattern, Pattern.CASE_INSENSITIVE).matcher(norm).find();
                } catch (Exception e) {
                    return false;
                }
            default:
                return false;
        }
    }
}
