package app.allocat.mobile;

import java.util.Locale;

/**
 * Java port of txnDedupeKey / hash53 in lib/sms/match.ts. MUST stay byte-for-byte
 * compatible: a closed-app notification's quick-allocate action deep-links by
 * dedupe key, and the web layer (which creates the txn when it drains the queue)
 * computes the same key. A mismatch just degrades to opening the picker.
 */
final class SmsHash {
    private SmsHash() {}

    static String dedupeKey(String sender, String body) {
        String s = (sender == null ? "" : sender).toLowerCase(Locale.ROOT).trim()
            + "|"
            + (body == null ? "" : body).toLowerCase(Locale.ROOT).replaceAll("\\s+", " ").trim();
        return hash53(s);
    }

    private static String hash53(String str) {
        int h1 = 0xdeadbeef;
        int h2 = 0x41c6ce57;
        for (int i = 0; i < str.length(); i++) {
            int ch = str.charAt(i);
            h1 = (h1 ^ ch) * 0x9e3779b1; // Math.imul == low-32-bit signed multiply
            h2 = (h2 ^ ch) * 0x5f356495;
        }
        h1 = (h1 ^ (h1 >>> 16)) * 0x85ebca77;
        h1 ^= (h2 ^ (h2 >>> 13)) * 0xc2b2ae35;
        h2 = (h2 ^ (h2 >>> 16)) * 0x85ebca77;
        h2 ^= (h1 ^ (h1 >>> 13)) * 0xc2b2ae35;
        long n = 4294967296L * (2097151 & h2) + (h1 & 0xFFFFFFFFL);
        StringBuilder hex = new StringBuilder(Long.toHexString(n));
        while (hex.length() < 14) hex.insert(0, '0');
        return hex.toString();
    }
}
