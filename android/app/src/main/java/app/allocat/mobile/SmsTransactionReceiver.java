package app.allocat.mobile;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.telephony.SmsMessage;
import android.util.Log;

/**
 * Fires on every incoming SMS — including when the app is closed. It assembles
 * the message, drops anything that doesn't look like a financial transaction
 * (SmsFilter), then queues it and notifies the web layer if it's alive.
 */
public class SmsTransactionReceiver extends BroadcastReceiver {
    private static final String SMS_RECEIVED = "android.provider.Telephony.SMS_RECEIVED";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !SMS_RECEIVED.equals(intent.getAction())) return;
        Bundle bundle = intent.getExtras();
        if (bundle == null) return;

        Object[] pdus = (Object[]) bundle.get("pdus");
        if (pdus == null) return;
        String format = bundle.getString("format");

        StringBuilder body = new StringBuilder();
        String sender = null;
        for (Object pdu : pdus) {
            SmsMessage msg = format != null
                ? SmsMessage.createFromPdu((byte[]) pdu, format)
                : SmsMessage.createFromPdu((byte[]) pdu);
            if (msg == null) continue;
            if (sender == null) sender = msg.getDisplayOriginatingAddress();
            body.append(msg.getMessageBody());
        }

        String text = body.toString();
        String from = sender == null ? "" : sender;
        Log.e("AllocatSMS", "onReceive from=" + from + " body=" + text);

        // Compliance gate — non-financial SMS never proceeds past this point.
        if (!SmsFilter.isLikelyTransaction(from, text)) {
            Log.e("AllocatSMS", "FILTERED OUT (not transaction-like)");
            return;
        }

        SmsParser.Parsed parsed = SmsParser.parse(text);
        // Only track debits (spends). Credits are ignored entirely.
        if ("credit".equals(parsed.direction)) {
            Log.e("AllocatSMS", "credit — ignored");
            return;
        }

        long ts = System.currentTimeMillis();
        // Always queue the raw SMS so the web layer does the authoritative ingest
        // (logging + sync) on next open. Dedupe there makes this safe.
        SmsQueue.add(context, from, text, ts);

        if (SmsReaderPlugin.isWebViewAlive()) {
            // App is open → let JS parse + notify (avoids a duplicate notification).
            SmsReaderPlugin.emitIfAlive(from, text, ts);
            Log.e("AllocatSMS", "queued + emitted (app open)");
        } else if (parsed.amount != null) {
            // App closed → notify natively right now.
            SmsRules.Match mr = SmsRules.match(context, parsed.merchantNormalized);
            String merch = parsed.merchant != null ? parsed.merchant : "Unknown";
            String amt = "₹" + Math.round(parsed.amount);
            String notifTitle;
            String notifBody;
            String url = "/sms";

            if (mr != null) {
                // Known merchant → auto-categorized. Warn if this spend trips the
                // budget — item-level first (actual vs planned), then category.
                double newActual = mr.itemActual + parsed.amount;
                double newSpent = mr.spent + parsed.amount;
                if (mr.itemPlanned > 0 && newActual / mr.itemPlanned >= 0.9) {
                    boolean over = newActual >= mr.itemPlanned;
                    long remaining = Math.round(Math.max(0, mr.itemPlanned - newActual));
                    notifTitle = over ? "Budget exceeded" : "Budget almost gone";
                    notifBody = over
                        ? mr.itemName + " is over budget"
                        : mr.itemName + " at " + Math.round(newActual / mr.itemPlanned * 100)
                            + "% — ₹" + remaining + " left";
                    url = "/budget";
                } else if (mr.allocated > 0 && newSpent / mr.allocated >= 0.9) {
                    boolean over = newSpent >= mr.allocated;
                    long remaining = Math.round(Math.max(0, mr.allocated - newSpent));
                    notifTitle = over ? "Budget exceeded" : "Budget almost gone";
                    notifBody = over
                        ? mr.category + " is over budget"
                        : mr.category + " at " + Math.round(newSpent / mr.allocated * 100)
                            + "% — ₹" + remaining + " left";
                    url = "/budget";
                } else {
                    notifTitle = "Transaction detected";
                    notifBody = amt + " at " + merch + (mr.category.isEmpty() ? "" : " → " + mr.category);
                }
            } else {
                notifTitle = "New transaction — allocate it";
                notifBody = amt + " at " + merch;
            }
            SmsNotifier.notify(context, notifTitle, notifBody, url);
            Log.e("AllocatSMS", "queued + native notification (app closed)");
        } else {
            Log.e("AllocatSMS", "queued (no amount; await app open for LLM parse)");
        }
    }
}
