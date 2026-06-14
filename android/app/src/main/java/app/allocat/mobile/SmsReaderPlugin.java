package app.allocat.mobile;

import android.Manifest;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.provider.Settings;

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
        // Only RECEIVE_SMS is declared in AndroidManifest (the app never reads the
        // existing inbox; READ_SMS is intentionally absent for Play-policy
        // compliance). The alias must list ONLY declared permissions: including
        // READ_SMS here meant getPermissionState("sms") could never be GRANTED (an
        // undeclared permission is auto-denied), so requestPermission always
        // resolved granted=false — the "Allow SMS access" button never flipped to
        // "Granted" and the prompt appeared to do nothing.
        @Permission(
            alias = "sms",
            strings = { Manifest.permission.RECEIVE_SMS }
        )
    }
)
public class SmsReaderPlugin extends Plugin {
    private static SmsReaderPlugin instance;
    // Tracks whether the app is actually in the foreground. instance != null is
    // NOT enough: a backgrounded app keeps its process (and instance) alive but
    // its WebView is paused, so emitting to JS would silently drop the event.
    private static volatile boolean foreground = false;

    @Override
    public void load() {
        instance = this;
    }

    @Override
    protected void handleOnResume() {
        foreground = true;
    }

    @Override
    protected void handleOnPause() {
        foreground = false;
    }

    /** True only while the app is foregrounded and the JS layer can handle events. */
    static boolean isWebViewAlive() {
        return instance != null && foreground;
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
        // Fresh snapshot reflects all synced spends → reset the closed-session accumulator.
        SmsAccum.clear(getContext());
        call.resolve();
    }

    /** JS pushes notification preferences (e.g. the auto-allocate confirmation toggle). */
    @PluginMethod
    public void setConfig(PluginCall call) {
        SmsConfig.setConfirmAutoAllocate(getContext(),
            call.getBoolean("confirmAutoAllocate", true));
        SmsConfig.setSound(getContext(), call.getString("sound", "meow"));
        call.resolve();
    }

    /** JS pushes the top budget items for the quick-allocate action buttons. */
    @PluginMethod
    public void setQuickTargets(PluginCall call) {
        SmsTargets.set(getContext(), call.getString("targets", "[]"));
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

    // OEM autostart / background-launch screens. These vary wildly by vendor and
    // Android version, so we try each and fall back to the app's details page.
    private static final String[][] AUTOSTART_TARGETS = {
        { "com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity" },
        { "com.letv.android.letvsafe", "com.letv.android.letvsafe.AutobootManageActivity" },
        { "com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity" },
        { "com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity" },
        { "com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager" },
        { "com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity" },
        { "com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity" },
        { "com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity" },
        { "com.oneplus.security", "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity" },
        { "com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity" },
        { "com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity" },
        { "com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity" },
    };

    /**
     * Opens the OEM autostart manager (best-effort). Some vendors mark these
     * activities non-exported or rename them per OS version, so we just try to
     * launch each and catch failures (resolveActivity often returns null even
     * when launching works). If none open, fall back to the main Settings app —
     * NOT the app-details page — so the user can search "auto start" themselves.
     */
    @PluginMethod
    public void openAutostartSettings(PluginCall call) {
        for (String[] t : AUTOSTART_TARGETS) {
            try {
                Intent i = new Intent();
                i.setComponent(new ComponentName(t[0], t[1]));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                call.resolve();
                return;
            } catch (Exception ignored) {
            }
        }
        openMainSettings();
        call.resolve();
    }

    /**
     * Opens the battery-optimization list (Settings > Battery optimization),
     * where the user can set AlloCat to "Don't optimize" / "Unrestricted". Uses
     * the list screen rather than ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS so
     * we don't need the Play-restricted REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
     * permission. Falls back to the main Settings app.
     */
    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
            return;
        } catch (Exception ignored) {
        }
        openMainSettings();
        call.resolve();
    }

    /** Opens the app's system details page (permissions, autostart on some OEMs). */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        openAppDetails();
        call.resolve();
    }

    private void openAppDetails() {
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception ignored) {
        }
    }

    /** Opens the top-level Settings app so the user can search a vendor screen. */
    private void openMainSettings() {
        try {
            Intent i = new Intent(Settings.ACTION_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception ignored) {
            openAppDetails();
        }
    }
}

