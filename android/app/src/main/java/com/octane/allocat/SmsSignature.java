package com.octane.allocat;

import java.util.Locale;

/**
 * Java port of smsTemplateKey / smsSkeleton / hash53 in lib/sms/match.ts. The
 * template key identifies the *kind* of SMS (variable parts masked) so a user
 * who reports one wrongly-captured message can have that whole template skipped.
 * The closed-app receiver computes this key and matches it against a blocklist
 * pushed from JS (SmsBlocklist), so it MUST produce byte-for-byte identical
 * output to the TS source.
 *
 * Keep in sync with smsTemplateKey/hash53 in lib/sms/match.ts.
 */
final class SmsSignature {
    private SmsSignature() {}

    /** Mirror of smsTemplateKey: hash53(`${sender}|${skeleton(body)}`). */
    static String templateKey(String sender, String body) {
        String s = (sender == null ? "" : sender).toLowerCase(Locale.ROOT).trim();
        String skel = skeleton(body == null ? "" : body);
        return hash53(s + "|" + skel);
    }

    /** Mirror of smsSkeleton: mask the variable parts, keep the structure. */
    private static String skeleton(String raw) {
        return raw
            .toLowerCase(Locale.ROOT)
            // UPI / VPA handles, then any token carrying a digit — masked WHOLE
            // but never eating the trailing sentence punctuation:
            //   /\S*@[^\s.,;:!?]*/g → "#"   /\S*\d[^\s.,;:!?]*/g → "#"
            .replaceAll("\\S*@[^\\s.,;:!?]*", "#")
            .replaceAll("\\S*\\d[^\\s.,;:!?]*", "#")
            // payer identity words in front of their digits:
            // /\b(from|by|vpa)\s+(?:[a-z][a-z&.\-]*\s+){0,2}#/g → "$1 #"
            .replaceAll("\\b(from|by|vpa)\\s+(?:[a-z][a-z&.\\-]*\\s+){0,2}#", "$1 #")
            // collapse number groups like #-#-# (dates): /#(?:[.\-/:]#)+/g → "#"
            .replaceAll("#(?:[.\\-/:]#)+", "#")
            // collapse space-separated masks: /#(?:\s+#)+/g → "#"
            .replaceAll("#(?:\\s+#)+", "#")
            // /#+/g → "#"
            .replaceAll("#+", "#")
            // /\s+/g → " "
            .replaceAll("\\s+", " ")
            .trim();
    }

    /**
     * cyrb53 — must match hash53 in lib/sms/match.ts byte-for-byte. Java int is a
     * 32-bit signed two's-complement value that wraps on overflow exactly like
     * JS Math.imul (low 32 bits of a signed 32-bit multiply), and `>>>` is the
     * same unsigned right shift as JS. The final 53-bit value is assembled in a
     * long and rendered as lowercase hex padded to 14 chars.
     */
    private static String hash53(String str) {
        // cyrb53 constants from lib/sms/match.ts. They exceed Integer.MAX_VALUE,
        // so they're written as 32-bit hex literals (Java reads these as the
        // corresponding negative int — the same bit pattern JS Math.imul uses).
        // hex == decimal:
        //   0x9e3779b1 == 2654435761,  0x5f356495 == 1597334677,
        //   0x85ebca6b == 2246822507,  0xc2b2ae35 == 3266489909.
        // Multiplication on Java int wraps to the low 32 bits exactly like Math.imul.
        int h1 = 0xdeadbeef;
        int h2 = 0x41c6ce57;
        for (int i = 0; i < str.length(); i++) {
            int ch = str.charAt(i);
            h1 = (h1 ^ ch) * 0x9e3779b1;
            h2 = (h2 ^ ch) * 0x5f356495;
        }
        h1 = (h1 ^ (h1 >>> 16)) * 0x85ebca6b;
        h1 ^= (h2 ^ (h2 >>> 13)) * 0xc2b2ae35;
        h2 = (h2 ^ (h2 >>> 16)) * 0x85ebca6b;
        h2 ^= (h1 ^ (h1 >>> 13)) * 0xc2b2ae35;
        long n = 4294967296L * (2097151 & h2) + (h1 & 0xFFFFFFFFL);
        StringBuilder hex = new StringBuilder(Long.toHexString(n));
        while (hex.length() < 14) hex.insert(0, '0');
        return hex.toString();
    }
}
