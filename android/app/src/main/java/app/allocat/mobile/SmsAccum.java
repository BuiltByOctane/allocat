package app.allocat.mobile;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Running spend deltas accumulated across closed-app spends so consecutive
 * closed transactions correctly trip the near-limit warning (the budget snapshot
 * pushed from JS is only as fresh as the last app open). Cleared when JS pushes a
 * fresh snapshot via setRules. Doubles are stored as their long bits because
 * SharedPreferences has no putDouble.
 */
final class SmsAccum {
    private static final String PREF = "allocat_accum";

    private SmsAccum() {}

    static double get(Context c, String key) {
        if (key == null || key.isEmpty()) return 0;
        long bits = c.getSharedPreferences(PREF, Context.MODE_PRIVATE).getLong(key, 0);
        return Double.longBitsToDouble(bits);
    }

    static void add(Context c, String key, double amount) {
        if (key == null || key.isEmpty()) return;
        SharedPreferences p = c.getSharedPreferences(PREF, Context.MODE_PRIVATE);
        double cur = Double.longBitsToDouble(p.getLong(key, 0));
        p.edit().putLong(key, Double.doubleToLongBits(cur + amount)).apply();
    }

    static void clear(Context c) {
        c.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().clear().apply();
    }
}
