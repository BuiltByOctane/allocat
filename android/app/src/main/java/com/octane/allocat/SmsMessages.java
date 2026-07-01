package com.octane.allocat;

/** Mirror of lib/notify/messages.ts pools. Keep in lockstep. NO em-dash. */
final class SmsMessages {
    // {title, bodyTemplate} where %1$s = item name, %2$s = formatted over amount (e.g. "₹250").
    static final String[][] TIER1 = {
        {"🙀 Over budget", "%1$s just went %2$s over. That overflow comes from your other allocations or savings."},
        {"😼 Budget blown", "%1$s is %2$s past plan. AlloCat's borrowing it from your other pots for now."},
        {"🐾 Spilled the bowl", "%1$s tipped %2$s over. The extra is coming out of your savings or other budgets."},
    };
    static final String[][] TIER2 = {
        {"🙀 Over again", "%1$s is over a second time, now %2$s past plan. Worth a glance before the next swipe."},
        {"😾 Twice over", "That's two overspends on %1$s. You're %2$s deep into other allocations."},
        {"🐾 Climbing", "%1$s crossed the line again, %2$s over. The cat's keeping count."},
    };
    static final String[][] TIER3 = {
        {"🙀 Over and over", "%1$s keeps going over, now %2$s past plan. Might be time to re-plan this one."},
        {"😼 A pattern", "%1$s is %2$s over yet again. Want to move some funds or raise the budget?"},
        {"🐾 The cat's concerned", "%1$s has run over more than twice, %2$s this time. Your savings are quietly covering it."},
    };

    private SmsMessages() {}

    static String[] pick(int count, String itemName, String overFormatted) {
        String[][] pool = count <= 1 ? TIER1 : (count == 2 ? TIER2 : TIER3);
        int idx = Math.floorMod(fnv1a(itemName + ":" + count), pool.length);
        String title = pool[idx][0];
        String body = String.format(pool[idx][1], itemName, overFormatted);
        return new String[] { title, body };
    }

    // Must match poolIndex() FNV-1a in lib/notify/messages.ts.
    private static int fnv1a(String s) {
        int h = 0x811c9dc5;
        for (int i = 0; i < s.length(); i++) {
            h ^= s.charAt(i);
            h *= 0x01000193;
        }
        return Math.abs(h);
    }
}
