package app.allocat.mobile;

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

    private static final Pattern CURRENCY =
        Pattern.compile("₹|\\bRs\\.?\\b|\\bINR\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern DEBIT =
        Pattern.compile("\\b(debited|debit|spent|sent|paid|withdrawn|purchase)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern CREDIT =
        Pattern.compile("\\b(credited|credit|received|deposited)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern AMT1 =
        Pattern.compile("(?:₹|Rs\\.?|INR)\\s*([\\d,]+(?:\\.\\d{1,2})?)", Pattern.CASE_INSENSITIVE);
    private static final Pattern AMT2 = Pattern.compile(
        "(?:debited|credited|debit|credit|spent|sent|paid)\\s+(?:by|for|with)?\\s*(?:₹|Rs\\.?|INR)?\\s*([\\d,]+(?:\\.\\d{1,2})?)",
        Pattern.CASE_INSENSITIVE);

    private static final Pattern[] MERCHANTS = new Pattern[] {
        Pattern.compile("(?:to|from|by)\\s+VPA\\s+([\\w.\\-]+)@[\\w.\\-]+", Pattern.CASE_INSENSITIVE),
        Pattern.compile("(?:to|from)\\s+([\\w.\\-]+)@[\\w.\\-]+", Pattern.CASE_INSENSITIVE),
        Pattern.compile(
            "(?:trf to|transfer to|sent to|paid to|to)\\s+([A-Za-z0-9][A-Za-z0-9 &._\\-]*?)(?=\\s+(?:on|ref|refno|ref no|upi|avl|a/c|info|not|\\.|,)|$)",
            Pattern.CASE_INSENSITIVE),
        Pattern.compile("(?:&|and)\\s+([A-Za-z0-9][A-Za-z0-9 &._\\-]*?)\\s+credited", Pattern.CASE_INSENSITIVE),
        Pattern.compile(
            "\\bfrom\\s+([A-Za-z0-9][A-Za-z0-9 &._\\-]*?)(?=\\s+(?:on|ref|refno|upi|avl|\\.|,)|$)",
            Pattern.CASE_INSENSITIVE),
    };

    static Parsed parse(String body) {
        Parsed p = new Parsed();
        if (body == null) return p;
        // Collapse newlines so the line-spanning patterns work (bank SMS are multi-line).
        String t = body.replaceAll("\\s+", " ").trim();

        if (CURRENCY.matcher(t).find()) p.currency = "INR";
        if (DEBIT.matcher(t).find()) p.direction = "debit";
        else if (CREDIT.matcher(t).find()) p.direction = "credit";

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
        Matcher m1 = AMT1.matcher(t);
        if (m1.find()) {
            Double n = num(m1.group(1));
            if (n != null) return n;
        }
        Matcher m2 = AMT2.matcher(t);
        if (m2.find()) return num(m2.group(1));
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
