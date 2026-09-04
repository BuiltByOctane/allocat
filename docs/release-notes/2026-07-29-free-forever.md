# AlloCat — Release Notes (2026-07-29)

**Free forever.** The subscription model introduced on 2026-06-14 is removed in full.

---

## Play Console "What's new" (≤500 chars)

```
AlloCat is now completely free. 🎉

No plans, no trial, no limits — every feature is unlocked for everyone.

• Unlimited goals, assets and debts
• AlloCat AI chat is open to all accounts
• Automatic spend tracking from your bank SMS, parsed on your device
• No ads, ever, and your data is never sold

If AlloCat is useful to you, there's a new "Why AlloCat is free" page in Profile.
```

---

## What changed

### Removed
- The entire entitlement/paywall system: `lib/subscription/*`, `EntitlementProvider`,
  `PaywallProvider`, `PaywallSheet`, `TrialWelcomeModal`, `SubscriptionCard`,
  `useSubscription`, `lib/actions/subscription.ts`, `lib/native/deviceId.ts`.
- **Adapty / Google Play Billing** — `@adapty/capacitor` dependency, `lib/native/adapty.ts`,
  `AdaptyBridge`, `/api/adapty/webhook`, and the Adapty `tools:replace` in AndroidManifest.
- Free-tier caps on goals (3), assets (5) and debts (2). All unlimited now.
- The 40-day opt-in trial.
- The `402 premium_required` gate on `/api/ai/chat`.

The `profiles` subscription columns are left in the database, unread — no destructive
migration. `docs/migrations/2026-06-14-profiles-subscription.sql` is superseded.

### Added
- **Why AlloCat is free** page (`/support`): what the app costs to run, the no-ads /
  no-data-selling commitment, and an optional Ko-fi link. Reached from Profile.
- **Ko-fi supporter flow** — `/api/kofi/webhook` banks donations in a new `supporters`
  table and sets `profiles.is_supporter`; `syncSupporterStatus()` reconciles donations
  made before signup. Supporters get a **cosmetic crown badge only** — no unlocks.
- **AI daily allowance** — AI chat is free for everyone, capped at 30 messages per
  account per day (`increment_ai_usage` RPC, durable across serverless instances).
  Hitting it shows a plain explanation in chat, not a wall.
- One dismissible dashboard card mentioning the support page, shown once after the
  account is 14 days old.

### Play policy posture
- No in-app purchases are declared. Donations happen on Ko-fi's site; on Android the
  link opens the **system browser**.
- `NEXT_PUBLIC_SUPPORT_CTA_NATIVE=false` hides the Ko-fi button inside the Android app
  entirely, leaving a plain text pointer — flip it if review objects, no code change.
- Existing Play subscription products should be deactivated in Play Console.

---

## Go-live checklist

- [ ] Run `docs/migrations/2026-07-29-supporters.sql` on Supabase.
- [ ] Create the Ko-fi page; set the webhook to `https://allocat.xyz/api/kofi/webhook`.
- [ ] Set `KOFI_VERIFICATION_TOKEN`, `NEXT_PUBLIC_KOFI_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Deactivate subscription products in Play Console.
- [ ] Deploy the landing page (pricing section replaced with "Why it's free" + FAQ).
