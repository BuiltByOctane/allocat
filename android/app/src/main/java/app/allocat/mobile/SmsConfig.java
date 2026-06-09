package app.allocat.mobile;

import android.content.Context;

/** Notification preferences pushed from JS (SmsReader.setConfig), read by the
 *  closed-app receiver. */
final class SmsConfig {
    private static final String PREF = "allocat_config";
    private static final String CONFIRM = "confirm_auto";
    private static final String SOUND = "notif_sound";

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

    /** Notification sound: a res/raw resource name, or "default" for the system sound. */
    static void setSound(Context c, String id) {
        c.getSharedPreferences(PREF, Context.MODE_PRIVATE)
            .edit()
            .putString(SOUND, id)
            .apply();
    }

    /** Default to the cat meow until JS pushes a value (preserves prior behaviour). */
    static String sound(Context c) {
        return c.getSharedPreferences(PREF, Context.MODE_PRIVATE).getString(SOUND, "meow");
    }
}
