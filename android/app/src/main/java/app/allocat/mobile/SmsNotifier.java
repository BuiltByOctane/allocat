package app.allocat.mobile;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.drawable.IconCompat;

/**
 * Posts a heads-up transaction notification directly (no WebView needed) so
 * alerts pop on screen even when the app is closed. Uses the paw silhouette as
 * the status-bar icon, the app logo as the large icon, and a meow sound if
 * res/raw/meow is present (else the default notification sound).
 */
final class SmsNotifier {
    // Bump this whenever channel settings change — Android freezes a channel's
    // config (importance/sound) at creation time, so a new id forces a refresh.
    private static final String CHANNEL = "allocat_txn_v4";

    private SmsNotifier() {}

    /**
     * progressPct 0..100 shows a budget progress bar; -1 renders the cat chat style.
     * actions: optional {label, deeplink} pairs rendered as tappable buttons.
     */
    static void notify(Context c, String title, String body, String url, int progressPct,
                       String[][] actions) {
        NotificationManager nm =
            (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        Uri sound = soundUri(c);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL, "Transactions", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Transaction + budget alerts");
            ch.enableVibration(true);
            ch.setVibrationPattern(new long[] { 0, 120, 80, 120 });
            ch.enableLights(true);
            if (sound != null) {
                AudioAttributes aa = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
                ch.setSound(sound, aa);
            }
            nm.createNotificationChannel(ch);
        }

        Intent i = new Intent(c, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (url != null) i.putExtra("deeplink", url);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT
            | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_IMMUTABLE : 0);
        int id = (int) (System.currentTimeMillis() % 100000);
        PendingIntent pi = PendingIntent.getActivity(c, id, i, piFlags);

        Bitmap large = null;
        try {
            large = BitmapFactory.decodeResource(c.getResources(), R.mipmap.ic_launcher);
        } catch (Exception ignored) {
        }

        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(ContextCompat.getColor(c, R.color.notif_accent))
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setVibrate(new long[] { 0, 120, 80, 120 })
            .setAutoCancel(true)
            .setContentIntent(pi);
        if (sound != null) b.setSound(sound);

        if (progressPct >= 0 && progressPct <= 100) {
            // Budget warnings: standard layout + a visual progress bar.
            b.setStyle(new NotificationCompat.BigTextStyle().bigText(body));
            b.setProgress(100, progressPct, false);
            if (large != null) b.setLargeIcon(large);
        } else {
            // Transaction alerts: render as a chat from the AlloCat mascot.
            IconCompat avatar = large != null
                ? IconCompat.createWithBitmap(large)
                : IconCompat.createWithResource(c, R.mipmap.ic_launcher);
            Person cat = new Person.Builder().setName("AlloCat").setIcon(avatar).build();
            b.setStyle(new NotificationCompat.MessagingStyle(cat)
                .setConversationTitle(title)
                .addMessage(body, System.currentTimeMillis(), cat));
        }

        // Quick-allocate action buttons (each opens the app to its deep-link).
        if (actions != null) {
            int n = 0;
            for (String[] a : actions) {
                if (a == null || a.length < 2 || n >= 3) continue;
                Intent ai = new Intent(c, MainActivity.class);
                ai.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                ai.putExtra("deeplink", a[1]);
                // Distinct action string so the PendingIntents don't collapse/merge extras.
                ai.setAction("app.allocat.mobile.ACTION_" + id + "_" + n);
                PendingIntent ap = PendingIntent.getActivity(c, id * 10 + n + 1, ai, piFlags);
                b.addAction(0, a[0], ap);
                n++;
            }
        }

        nm.notify(id, b.build());
    }

    /** res/raw/meow if present, else the system default notification sound. */
    private static Uri soundUri(Context c) {
        int meow = c.getResources().getIdentifier("meow", "raw", c.getPackageName());
        if (meow != 0) {
            return Uri.parse("android.resource://" + c.getPackageName() + "/" + meow);
        }
        return RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
    }
}
