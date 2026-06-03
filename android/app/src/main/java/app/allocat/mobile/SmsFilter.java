package app.allocat.mobile;

/**
 * On-device gate: only financial-looking SMS may ever leave the device.
 * Non-transaction messages (personal texts, plain OTPs, promos) are dropped
 * here and never queued, surfaced to JS, or transmitted — this is what keeps
 * the app within Google Play's SMS-permission policy.
 */
final class SmsFilter {
    private SmsFilter() {}

    static boolean isLikelyTransaction(String sender, String body) {
        if (body == null) return false;
        // Collapse newlines/whitespace — bank SMS are multi-line and Java's
        // String.matches() is whole-string with '.' not crossing newlines.
        String b = body.toLowerCase().replaceAll("\\s+", " ");

        boolean txnWord = b.matches(
            ".*(debited|credited|debit|credit|spent|sent|paid|received|withdrawn|purchase|txn|transaction|upi|a/c|acct).*");
        boolean hasDigits = b.matches(".*\\d{2,}.*");
        boolean amountCue = b.matches(".*(rs\\.?|inr|₹)\\s*\\d.*") || (txnWord && hasDigits);
        boolean otpOnly = b.contains("otp") && !txnWord;

        return amountCue && !otpOnly;
    }
}
