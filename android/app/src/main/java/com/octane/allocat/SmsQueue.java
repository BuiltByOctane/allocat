package com.octane.allocat;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Tiny durable queue (SharedPreferences) for captured transaction SMS. Used so
 * messages received while the WebView is dead survive until the app next opens
 * and the web layer drains them. JS dedupes on ingest, so re-delivery is safe.
 */
final class SmsQueue {
    private static final String PREF = "allocat_sms";
    private static final String KEY = "queue";

    private SmsQueue() {}

    static synchronized void add(Context c, String sender, String body, long ts) {
        SharedPreferences p = c.getSharedPreferences(PREF, Context.MODE_PRIVATE);
        try {
            JSONArray a = new JSONArray(p.getString(KEY, "[]"));
            JSONObject o = new JSONObject();
            o.put("sender", sender);
            o.put("body", body);
            o.put("ts", ts);
            a.put(o);
            p.edit().putString(KEY, a.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    /** Returns and clears the queued messages. */
    static synchronized JSONArray drain(Context c) {
        SharedPreferences p = c.getSharedPreferences(PREF, Context.MODE_PRIVATE);
        String s = p.getString(KEY, "[]");
        p.edit().putString(KEY, "[]").apply();
        try {
            return new JSONArray(s);
        } catch (Exception e) {
            return new JSONArray();
        }
    }
}
