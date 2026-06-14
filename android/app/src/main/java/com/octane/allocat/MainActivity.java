package com.octane.allocat;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;

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

    /** A tapped transaction notification carries a deep-link; the web layer
     *  consumes it via SmsReader.consumeDeepLink() to land on /sms. */
    private void stashDeepLink(Intent intent) {
        if (intent == null) return;
        String url = intent.getStringExtra("deeplink");
        if (url != null) {
            getSharedPreferences("allocat_sms", Context.MODE_PRIVATE)
                .edit()
                .putString("pending_deeplink", url)
                .apply();
        }
    }
}
