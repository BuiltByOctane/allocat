package app.allocat.mobile;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;

/**
 * Posts a transaction notification directly (no WebView needed) so alerts fire
 * when the app is closed. Tapping opens MainActivity carrying a deep-link the
 * web layer consumes to land on /sms.
 */
final class SmsNotifier {
    private static final String CHANNEL = "allocat_sms_txn";

    private SmsNotifier() {}

    static void notify(Context c, String title, String body, String url) {
        NotificationManager nm =
            (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                CHANNEL, "Transactions", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("New transaction alerts from SMS");
            nm.createNotificationChannel(ch);
        }

        Intent i = new Intent(c, MainActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (url != null) i.putExtra("deeplink", url);

        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT
            | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_IMMUTABLE : 0);
        int id = (int) (System.currentTimeMillis() % 100000);
        PendingIntent pi = PendingIntent.getActivity(c, id, i, piFlags);

        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(c.getApplicationInfo().icon)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pi);

        nm.notify(id, b.build());
    }
}
