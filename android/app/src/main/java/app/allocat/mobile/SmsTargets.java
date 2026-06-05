package app.allocat.mobile;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Top budget items pushed from JS, shown as quick-allocate action buttons on an
 * unallocated-transaction notification. Each: { "id", "name" }.
 */
final class SmsTargets {
    private static final String PREF = "allocat_targets";
    private static final String KEY = "targets";

    private SmsTargets() {}

    static final class Target {
        String id;
        String name;
    }

    static void set(Context c, String json) {
        c.getSharedPreferences(PREF, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY, json == null ? "[]" : json)
            .apply();
    }

    static List<Target> get(Context c, int max) {
        List<Target> out = new ArrayList<>();
        String s = c.getSharedPreferences(PREF, Context.MODE_PRIVATE).getString(KEY, "[]");
        try {
            JSONArray a = new JSONArray(s);
            for (int i = 0; i < a.length() && out.size() < max; i++) {
                JSONObject o = a.getJSONObject(i);
                Target t = new Target();
                t.id = o.optString("id");
                t.name = o.optString("name");
                if (t.id != null && !t.id.isEmpty() && t.name != null && !t.name.isEmpty()) {
                    out.add(t);
                }
            }
        } catch (Exception ignored) {
        }
        return out;
    }
}
