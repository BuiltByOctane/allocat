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
    private static final String KEY_PERIOD = "period";

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

    static void set(Context c, String json, String period) {
        c.getSharedPreferences(PREF, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY, json == null ? "[]" : json)
            .putString(KEY_PERIOD, period == null ? "" : period)
            .apply();
    }

    private static final String DATE_FMT = "yyyy-MM-dd";

    private static String stored(Context c) {
        String stored = c.getSharedPreferences(PREF, Context.MODE_PRIVATE).getString(KEY_PERIOD, "");
        return stored == null ? "" : stored;
    }

    private static String fmt(String pattern, long ts) {
        return new java.text.SimpleDateFormat(pattern, java.util.Locale.US).format(new java.util.Date(ts));
    }

    /** Parses "yyyy-MM-dd" at local noon (DST-safe), or null when malformed. */
    private static java.util.Calendar parseDay(String s) {
        try {
            java.text.SimpleDateFormat f = new java.text.SimpleDateFormat(DATE_FMT, java.util.Locale.US);
            f.setLenient(false);
            java.util.Calendar cal = java.util.Calendar.getInstance();
            cal.setTime(f.parse(s));
            cal.set(java.util.Calendar.HOUR_OF_DAY, 12);
            return cal;
        } catch (Exception e) {
            return null;
        }
    }

    /** Stored "start|end" range as {start, end} date strings, or null when the
     * stamp is legacy ("yyyy-MM"), empty or malformed. */
    private static String[] range(Context c) {
        String stored = stored(c);
        int bar = stored.indexOf('|');
        if (bar < 0) return null;
        String start = stored.substring(0, bar);
        String end = stored.substring(bar + 1);
        if (parseDay(start) == null || parseDay(end) == null) return null;
        return new String[] { start, end };
    }

    /** True only when the stored period stamp covers the date of ts. Stamp is
     * either a budget-cycle range "yyyy-MM-dd|yyyy-MM-dd" (inclusive) or the
     * legacy calendar month "yyyy-MM". A missing/empty/malformed stamp (mirror
     * pushed by an old app version) is stale — safe default is a generic
     * notification, not stale budget math. */
    static boolean isFresh(Context c, long ts) {
        String stored = stored(c);
        if (stored.isEmpty()) return false;
        if (stored.indexOf('|') >= 0) {
            String[] r = range(c);
            if (r == null) return false;
            String day = fmt(DATE_FMT, ts);
            return day.compareTo(r[0]) >= 0 && day.compareTo(r[1]) <= 0;
        }
        return stored.equals(fmt("yyyy-MM", ts));
    }

    /** For a range stamp: {day-of-cycle of ts (1-based), cycle length in days}.
     * Null for a legacy/invalid stamp — callers then use calendar-month math. */
    static int[] cycleInfo(Context c, long ts) {
        String[] r = range(c);
        if (r == null) return null;
        java.util.Calendar start = parseDay(r[0]);
        java.util.Calendar end = parseDay(r[1]);
        java.util.Calendar today = parseDay(fmt(DATE_FMT, ts));
        if (start == null || end == null || today == null) return null;
        long ms = 24L * 60 * 60 * 1000;
        int day = (int) Math.round((today.getTimeInMillis() - start.getTimeInMillis()) / (double) ms) + 1;
        int len = (int) Math.round((end.getTimeInMillis() - start.getTimeInMillis()) / (double) ms) + 1;
        return new int[] { day, len };
    }

    /** Real day-of-month of cycle day n (1-based) of the stored range, or n
     * when there is no range. */
    static int dayOfMonthOfCycleDay(Context c, int n) {
        String[] r = range(c);
        java.util.Calendar start = r == null ? null : parseDay(r[0]);
        if (start == null) return n;
        start.add(java.util.Calendar.DAY_OF_MONTH, n - 1);
        return start.get(java.util.Calendar.DAY_OF_MONTH);
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
