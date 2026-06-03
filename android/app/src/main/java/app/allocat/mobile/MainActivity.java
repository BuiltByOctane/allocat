package app.allocat.mobile;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register the local SMS reader plugin before the bridge starts.
        registerPlugin(SmsReaderPlugin.class);
        super.onCreate(savedInstanceState);
        stashDeepLink(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        stashDeepLink(intent);
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
