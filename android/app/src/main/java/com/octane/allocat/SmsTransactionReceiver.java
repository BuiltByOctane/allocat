package com.octane.allocat;

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
        // Privacy: never log raw SMS body or sender (PII, readable via logcat).
        log("onReceive (len=" + text.length() + ")");

        // Compliance gate — non-financial SMS never proceeds past this point.
        if (!SmsFilter.isLikelyTransaction(from, text)) {
            log("FILTERED OUT (not transaction-like)");
            return;
        }

        SmsParser.Parsed parsed = SmsParser.parse(text);
        // Only track CONFIRMED debits (spends). Credits and ambiguous messages
        // with no debit cue are ignored — mirrors the require-debit gate in
        // lib/sms/ingestClient.ts so the closed-app path can't log phantoms.
        if (!"debit".equals(parsed.direction)) {
            log("non-debit — ignored");
            return;
        }

        // User-reported template blocklist: skip whole "kinds" of SMS the user
        // flagged as mistakes (same key the web layer computes). Blocked
        // templates neither notify nor queue.
        String tkey = SmsSignature.templateKey(from, text);
        if (SmsBlocklist.contains(context, tkey)) {
            log("blocked kind — ignored");
            return;
        }

        long ts = System.currentTimeMillis();
        // Always queue the raw SMS so the web layer does the authoritative ingest
        // (logging + sync) on next open. Dedupe there makes this safe.
        SmsQueue.add(context, from, text, ts);

        if (SmsReaderPlugin.isWebViewAlive()) {
            // App is open → let JS parse + notify (avoids a duplicate notification).
            SmsReaderPlugin.emitIfAlive(from, text, ts);
            log("queued + emitted (app open)");
        } else if (parsed.amount != null) {
            // App closed → notify natively right now.
            SmsRules.Match mr = SmsRules.match(context, parsed.merchantNormalized);
            String merch = parsed.merchant != null ? parsed.merchant : "someone";
            String amt = "₹" + Math.round(parsed.amount);
            String notifTitle = "";
            String notifBody = "";
            String url = "/sms";
            int progressPct = -1;
            String[][] actions = null;
            boolean suppressNotif = false;

            if (mr != null) {
                // Accumulate across closed spends so consecutive closed transactions
                // correctly trip the limit (the snapshot is only fresh as of last open).
                double accumItem = SmsAccum.get(context, mr.itemName);
                double accumCat = SmsAccum.get(context, mr.category);
                double newActual = mr.itemActual + accumItem + parsed.amount;
                double newSpent = mr.spent + accumCat + parsed.amount;
                SmsAccum.add(context, mr.itemName, parsed.amount);
                SmsAccum.add(context, mr.category, parsed.amount);

                // Known merchant → auto-categorized. Warn (item-level first, then
                // category) if this spend pushes the budget to the edge.
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
                    } else if (SmsConfig.confirmEnabled(context)) {
                        // Subtle auto-allocate confirmation (user can disable in Settings).
                        notifTitle = "🐾 Sorted: " + amt
                            + (mr.category.isEmpty() ? "" : " → " + mr.category);
                        notifBody = mr.category.isEmpty()
                            ? "Auto-logged to your budget."
                            : "Auto-logged to " + mr.category + ".";
                        url = "/budget";
                    } else {
                        suppressNotif = true;
                    }
                }
            } else {
                notifTitle = "🐾 A wild spend appeared!";
                notifBody = amt + " at " + merch + " — tap to give it a home.";
                // Deep-link by dedupe key so tapping the notification opens the SMS page.
                // (The web layer creates the matching txn when it drains the queue on open.)
                String dedupe = SmsHash.dedupeKey(from, text);
                url = "/sms?dedupe=" + dedupe;
            }
            if (!suppressNotif) {
                SmsNotifier.notify(context, notifTitle, notifBody, url, progressPct, actions);
                log("queued + native notification (app closed)");
            } else {
                log("queued + auto-allocated (confirmation off)");
            }
        } else {
            log("queued (no amount; await app open)");
        }
    }

    /** Debug-only diagnostic log. Never pass raw SMS body/sender here. */
    private static void log(String msg) {
        if (BuildConfig.DEBUG) Log.d("AllocatSMS", msg);
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
