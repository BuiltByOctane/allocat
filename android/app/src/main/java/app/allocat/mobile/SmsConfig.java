package app.allocat.mobile;

import android.content.Context;

/** Notification preferences pushed from JS (SmsReader.setConfig), read by the
 *  closed-app receiver. */
final class SmsConfig {
    private static final String PREF = "allocat_config";
    private static final String CONFIRM = "confirm_auto";

    private SmsConfig() {}

    static void setConfirmAutoAllocate(Context c, boolean on) {
        c.getSharedPreferences(PREF, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(CONFIRM, on)
            .apply();
    }

    /** Default true until JS pushes a value. */
    static boolean confirmEnabled(Context c) {
        return c.getSharedPreferences(PREF, Context.MODE_PRIVATE).getBoolean(CONFIRM, true);
    }
}
