package app.allocat.mobile;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Capacitor bridge for the SMS transaction reader. Exposes permission control
 * and a drain of messages captured while the WebView was dead, and emits a
 * "smsReceived" event for messages that arrive while the app is open.
 */
@CapacitorPlugin(
    name = "SmsReader",
    permissions = {
        @Permission(
            alias = "sms",
            strings = { Manifest.permission.RECEIVE_SMS, Manifest.permission.READ_SMS }
        )
    }
)
public class SmsReaderPlugin extends Plugin {
    private static SmsReaderPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    /** True while the WebView/JS layer is running (app open). */
    static boolean isWebViewAlive() {
        return instance != null;
    }

    /** Called by the BroadcastReceiver; no-op if the WebView isn't running. */
    static void emitIfAlive(String sender, String body, long ts) {
        android.util.Log.e("AllocatSMS", "emitIfAlive webviewAlive=" + (instance != null));
        if (instance == null) return;
        JSObject data = new JSObject();
        data.put("sender", sender);
        data.put("body", body);
        data.put("ts", ts);
        instance.notifyListeners("smsReceived", data);
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", getPermissionState("sms") == PermissionState.GRANTED);
        call.resolve(r);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (getPermissionState("sms") == PermissionState.GRANTED) {
            JSObject r = new JSObject();
            r.put("granted", true);
            call.resolve(r);
        } else {
            requestPermissionForAlias("sms", call, "permsResult");
        }
    }

    @PermissionCallback
    private void permsResult(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", getPermissionState("sms") == PermissionState.GRANTED);
        call.resolve(r);
    }

    /** Returns and clears messages captured while the app was closed. */
    @PluginMethod
    public void getQueued(PluginCall call) {
        JSArray messages = new JSArray();
        JSONArray queued = SmsQueue.drain(getContext());
        for (int i = 0; i < queued.length(); i++) {
            try {
                JSONObject o = queued.getJSONObject(i);
                JSObject e = new JSObject();
                e.put("sender", o.optString("sender"));
                e.put("body", o.optString("body"));
                e.put("ts", o.optLong("ts"));
                messages.put(e);
            } catch (Exception ignored) {
            }
        }
        JSObject r = new JSObject();
        r.put("messages", messages);
        call.resolve(r);
    }

    /** JS pushes the current merchant rules so the receiver can match when closed. */
    @PluginMethod
    public void setRules(PluginCall call) {
        SmsRules.set(getContext(), call.getString("rules", "[]"));
        call.resolve();
    }

    /** Returns + clears a pending deep-link stashed when a notification was tapped. */
    @PluginMethod
    public void consumeDeepLink(PluginCall call) {
        SharedPreferences p = getContext().getSharedPreferences("allocat_sms", Context.MODE_PRIVATE);
        String url = p.getString("pending_deeplink", null);
        if (url != null) p.edit().remove("pending_deeplink").apply();
        JSObject r = new JSObject();
        r.put("url", url);
        call.resolve(r);
    }
}

