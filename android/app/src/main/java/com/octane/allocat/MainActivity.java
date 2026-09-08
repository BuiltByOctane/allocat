package com.octane.allocat;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register the local SMS reader plugin before the bridge starts.
        registerPlugin(SmsReaderPlugin.class);
        super.onCreate(savedInstanceState);
        stashDeepLink(getIntent());
        requestNotificationPermission();
    }

    /**
     * Persist WebView cookies to disk whenever we leave the foreground. The
     * remote-URL WebView keeps the Supabase auth session in cookies, but Android
     * does NOT flush the in-memory cookie store to disk until told to. If the OS
     * (or an OEM battery killer) reaps the process while backgrounded, an
     * unflushed refreshed-session cookie is lost → the next cold launch is
     * unauthenticated and the middleware bounces the user to /auth/login. Flushing
     * on pause/stop closes that window. See bug: "sometimes auto-logged out".
     */
    @Override
    public void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    public void onStop() {
        super.onStop();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        stashDeepLink(intent);
    }

    /**
     * Ask for POST_NOTIFICATIONS at launch (Android 13+). Done natively so the
     * prompt appears regardless of what the remote web layer does, alongside the
     * SMS permission. No-op once granted.
     */
    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                this, new String[] { Manifest.permission.POST_NOTIFICATIONS }, 9001);
        }
    }

    /**
     * A tapped native SMS notification carries `deeplink`; an FCM admin
     * broadcast carries `url`. Save either while the WebView starts so the web
     * layer can consume it via SmsReader.consumeDeepLink(). This also covers a
     * cold launch, where Capacitor's push action listener has not loaded yet.
     */
    private void stashDeepLink(Intent intent) {
        if (intent == null) return;
        String url = intent.getStringExtra("deeplink");
        if (url == null) url = intent.getStringExtra("url");
        // Only allow an in-app path; the server owns broadcast payloads, but
        // this guards against a malformed or externally-crafted launch intent.
        if (url != null && url.startsWith("/")) {
            getSharedPreferences("allocat_sms", Context.MODE_PRIVATE)
                .edit()
                .putString("pending_deeplink", url)
                .apply();
        }
    }
}
