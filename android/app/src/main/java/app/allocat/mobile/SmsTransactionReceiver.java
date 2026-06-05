package app.allocat.mobile;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.telephony.SmsMessage;
import android.util.Log;

import java.util.ArrayList;
import java.util.List;

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
            String merch = parsed.merchant != null ? parsed.merchant : "someone";
            String amt = "₹" + Math.round(parsed.amount);
            String notifTitle;
            String notifBody;
            String url = "/sms";
            int progressPct = -1;
            String[][] actions = null;

            if (mr != null) {
                // Known merchant → auto-categorized. Warn (item-level first, then
                // category) if this spend pushes the budget to the edge.
                double newActual = mr.itemActual + parsed.amount;
                double newSpent = mr.spent + parsed.amount;
                boolean itemNear = mr.itemPlanned > 0 && newActual / mr.itemPlanned >= 0.9;
                boolean catNear = mr.allocated > 0 && newSpent / mr.allocated >= 0.9;
                if (itemNear || catNear) {
                    String name = itemNear ? mr.itemName : mr.category;
                    double used = itemNear ? newActual : newSpent;
                    double total = itemNear ? mr.itemPlanned : mr.allocated;
                    url = "/budget";
                    progressPct = Math.min(100, (int) Math.round(used / total * 100));
                    if (used >= total) {
                        notifTitle = "🙀 Budget blown!";
                        notifBody = name + " is over by ₹" + Math.round(used - total)
                            + ". The cat's out of the bag.";
                    } else {
                        notifTitle = "😼 Budget's getting thin";
                        notifBody = name + " at " + Math.round(used / total * 100)
                            + "% — only ₹" + Math.round(total - used) + " left. Tread softly.";
                    }
                } else {
                    // Predictive pace nudge: on track to overspend before the
                    // 90% threshold even trips?
                    java.util.Calendar cal = java.util.Calendar.getInstance();
                    int day = cal.get(java.util.Calendar.DAY_OF_MONTH);
                    int dim = cal.getActualMaximum(java.util.Calendar.DAY_OF_MONTH);
                    int byDay = (mr.itemPlanned > 0 && newActual > 0)
                        ? (int) Math.ceil(mr.itemPlanned * day / newActual)
                        : Integer.MAX_VALUE;
                    if (mr.itemPlanned > 0 && day >= 3 && byDay <= dim) {
                        notifTitle = "🐾 Spending fast";
                        notifBody = mr.itemName + " is on track to run out around the "
                            + ordinal(byDay) + " — ease up to stay in budget.";
                        url = "/budget";
                    } else {
                        notifTitle = "🐾 Sorted it for you";
                        notifBody = amt + " at " + merch
                            + (mr.category.isEmpty() ? " is logged. Relax." : " → " + mr.category + ". Relax.");
                    }
                }
            } else {
                notifTitle = "🐾 A wild spend appeared!";
                notifBody = amt + " at " + merch + " — tap to give it a home.";
                // Quick-allocate buttons → deep-link by dedupe key (the web layer
                // creates the matching txn when it drains the queue on open).
                String dedupe = SmsHash.dedupeKey(from, text);
                url = "/sms?dedupe=" + dedupe;
                List<String[]> acts = new ArrayList<>();
                for (SmsTargets.Target t : SmsTargets.get(context, 2)) {
                    acts.add(new String[] {
                        t.name, "/sms?dedupe=" + dedupe + "&item=" + t.id + "&apply=1"
                    });
                }
                acts.add(new String[] { "Allocate…", "/sms?dedupe=" + dedupe });
                actions = acts.toArray(new String[0][]);
            }
            SmsNotifier.notify(context, notifTitle, notifBody, url, progressPct, actions);
            Log.e("AllocatSMS", "queued + native notification (app closed)");
        } else {
            Log.e("AllocatSMS", "queued (no amount; await app open)");
        }
    }

    private static String ordinal(int n) {
        if (n >= 11 && n <= 13) return n + "th";
        switch (n % 10) {
            case 1: return n + "st";
            case 2: return n + "nd";
            case 3: return n + "rd";
            default: return n + "th";
        }
    }
}
