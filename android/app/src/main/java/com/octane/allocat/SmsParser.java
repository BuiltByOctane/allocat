package com.octane.allocat;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Native port of lib/ai/parseSmsTransaction.ts — just enough to parse amount,
 * merchant and direction so the BroadcastReceiver can post a transaction
 * notification when the app (and its WebView) is closed.
 */
final class SmsParser {
    private SmsParser() {}

    static final class Parsed {
        Double amount;
        String currency;
        String merchant;
        String merchantNormalized;
        String direction; // "debit" | "credit" | null
    }

    // Keep these patterns in sync with lib/ai/parseSmsTransaction.ts.
    private static final String STOP =
        "(?=\\s+(?:on|ref|refno|ref no|upi|avl|a/c|info|not|via|dt|your|bal|txn|using|cr|dr|\\.|,)|$)";

    private static final Pattern CURRENCY =
        Pattern.compile("₹|\\bRs\\.?\\b|\\bINR\\b", Pattern.CASE_INSENSITIVE);
    // Strong debit markers: unambiguous "account lost money" tokens.
    private static final Pattern STRONG_DEBIT =
        Pattern.compile("\\b(debited|debit|spent|withdrawn|w/d|purchase|paid|auto[-\\s]?debit|e-?mandate)\\b", Pattern.CASE_INSENSITIVE);
    // Weak debit markers: ambiguous tokens that also appear in credit SMS — only
    // count as debit AFTER credit has been ruled out.
    private static final Pattern WEAK_DEBIT =
        Pattern.compile("\\b(txn|transferred|sent)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern CREDIT =
        Pattern.compile("\\b(credited|credit|received|deposited|refund(?:ed)?)\\b", Pattern.CASE_INSENSITIVE);
    // Credit-card spend phrasing ("...made using your ... Card at X") has no debit keyword.
    private static final Pattern CARD_SPEND =
        Pattern.compile("\\busing\\s+your\\b[\\s\\S]*?\\bcard\\b", Pattern.CASE_INSENSITIVE);
    // Balance clauses report the post-txn balance, not the spend — strip first.
    private static final Pattern BALANCE = Pattern.compile(
        "(?:avl\\.?\\s*bal(?:ance)?|available\\s+bal(?:ance)?|a/c\\s+bal(?:ance)?|bal(?:ance)?)\\s*:?\\s*(?:₹|Rs\\.?|INR)?\\s*[\\d,]+(?:\\.\\d{1,2})?",
        Pattern.CASE_INSENSITIVE);
    private static final Pattern AMT_KW = Pattern.compile(
        "(?:debited|credited|debit|credit|spent|sent|paid|withdrawn|purchase|txn|transferred)\\s+(?:of|by|for|with)?\\s*(?:₹|Rs\\.?|INR)?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
        Pattern.CASE_INSENSITIVE);
    private static final Pattern AMT_CUR =
        Pattern.compile("(?:₹|Rs\\.?|INR)\\s*([\\d,]+(?:\\.\\d{1,2})?)", Pattern.CASE_INSENSITIVE);

    private static final Pattern[] MERCHANTS = new Pattern[] {
        Pattern.compile("(?:to|from|by|at)\\s+VPA\\s+([\\w.\\-]+)@[\\w.\\-]+", Pattern.CASE_INSENSITIVE),
        Pattern.compile("(?:to|from|at)\\s+([\\w.\\-]+)@[\\w.\\-]+", Pattern.CASE_INSENSITIVE),
        Pattern.compile(
            "(?:trf to|transfer to|sent to|paid to|towards|to)\\s+([A-Za-z0-9][A-Za-z0-9 &._\\-]*?)" + STOP,
            Pattern.CASE_INSENSITIVE),
        Pattern.compile("\\bat\\s+([A-Za-z0-9][A-Za-z0-9 &._\\-]*?)" + STOP, Pattern.CASE_INSENSITIVE),
        Pattern.compile("(?:&|and)\\s+([A-Za-z0-9][A-Za-z0-9 &._\\-]*?)\\s+credited", Pattern.CASE_INSENSITIVE),
        Pattern.compile("\\binfo[:\\-]?\\s*([A-Za-z0-9][A-Za-z0-9 &._\\-]*?)" + STOP, Pattern.CASE_INSENSITIVE),
        Pattern.compile("\\bfrom\\s+([A-Za-z0-9][A-Za-z0-9 &._\\-]*?)" + STOP, Pattern.CASE_INSENSITIVE),
    };

    static Parsed parse(String body) {
        Parsed p = new Parsed();
        if (body == null) return p;
        // Collapse newlines so the line-spanning patterns work (bank SMS are multi-line).
        String t = body.replaceAll("\\s+", " ").trim();

        if (CURRENCY.matcher(t).find()) p.currency = "INR";
        // 1. Strong debit wins. 2. Card spend (its "Credit Card" wording must
        // beat CREDIT). 3. Credit beats the weak/ambiguous tokens. 4. Weak debit
        // (txn/transferred/sent) last.
        if (STRONG_DEBIT.matcher(t).find()) p.direction = "debit";
        else if (CARD_SPEND.matcher(t).find()) p.direction = "debit";
        else if (CREDIT.matcher(t).find()) p.direction = "credit";
        else if (WEAK_DEBIT.matcher(t).find()) p.direction = "debit";

        p.amount = extractAmount(t);

        for (Pattern re : MERCHANTS) {
            Matcher m = re.matcher(t);
            if (m.find()) {
                String cleaned = m.group(1).replaceAll("\\s+", " ").replaceAll("[.,\\s]+$", "").trim();
                if (cleaned.length() > 0 && !cleaned.equalsIgnoreCase("vpa")) {
                    p.merchant = cleaned;
                    break;
                }
            }
        }
        if (p.merchant != null) p.merchantNormalized = normalize(p.merchant);
        return p;
    }

    private static Double extractAmount(String t) {
        // Strip balance clauses so an available-balance figure isn't read as the spend.
        String s = BALANCE.matcher(t).replaceAll(" ");
        // Keyword-adjacent amount first (most reliable), then currency-adjacent.
        Matcher mk = AMT_KW.matcher(s);
        if (mk.find()) {
            Double n = num(mk.group(1));
            if (n != null) return n;
        }
        Matcher mc = AMT_CUR.matcher(s);
        if (mc.find()) return num(mc.group(1));
        return null;
    }

    private static Double num(String s) {
        try {
            double n = Double.parseDouble(s.replace(",", ""));
            return n > 0 ? n : null;
        } catch (Exception e) {
            return null;
        }
    }

    /** Mirror of normalizeMerchant() in lib/sms/match.ts. */
    static String normalize(String raw) {
        String before = raw.split("@")[0];
        return before.toLowerCase().replaceAll("[^a-z0-9 &]+", " ").replaceAll("\\s+", " ").trim();
    }
}
