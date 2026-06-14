# AlloCat — Release Notes (2026-06-14)

**Package:** `com.octane.allocat` · **versionName:** 1.0.1 · **versionCode:** 2
**Track:** Closed testing · **This is the first release.**

---

## Play Console "What's new" (paste this — ≤500 chars, tester-facing)

```
Welcome to AlloCat — the first AlloCat build! 🎉

A clean, offline-first money app: budgets, goals, debts and net worth.

• Automatic spend tracking from your bank/UPI SMS — parsed on your device
• AI insights & chat about your finances
• Start a 40-day free Premium trial — no card needed

Thanks for testing — please send any bugs or feedback our way!
```

> The build loads the deployed web app (`https://allocat.xyz`), so testers see
> whatever is live there. Make sure the subscription/trial flow is deployed before
> testers expect it — otherwise use the short variant below.

### Short variant (no subscription mention)

```
Welcome to AlloCat — our first build! 🎉

A minimalist, offline-first money app for budgets, goals, debts and net worth,
with automatic spend tracking from your bank SMS (parsed on your device).

Thanks for testing — please report any bugs or feedback!
```

---

## Closed testing — quick checklist

- [ ] Add testers (email list or Google Group) to the **Closed testing** track.
- [ ] Complete the **SMS permission declaration** (use case: *SMS-based money
      management*) and **Data safety** form — copy in `docs/play-release.md`.
- [ ] Privacy policy URL resolves: `https://allocat.xyz/legal/privacy-policy`.
- [ ] Subscription/trial flow deployed to `allocat.xyz` (or use the short variant).
- [ ] Testers opt in via the closed-testing link, then install from Play.

---

## What's in this first build (internal — not for Play)

### App
- Offline-first PWA shipped as a native Android app (Capacitor, remote-URL WebView).
- Budgets, goals, debts, net worth; on-device SMS transaction tracking
  (`RECEIVE_SMS` only — never reads the inbox).
- AI chat & insights.

### Subscription (new this cycle)
- Server-backed entitlement; free tier fully usable, AI Premium-only, caps on
  goals (3) / assets (5) / debts (2). SMS auto-tracking never gated.
- Opt-in **40-day free trial** (no card), idempotent — one per account.
- Paywall sheet + Premium section on profile (trial countdown, upgrade, restore).
- **Adapty (Google Play Billing)** wired (`@adapty/capacitor@3.17`); purchases
  native-only; signed webhook (`/api/adapty/webhook`) is the sole server writer.
- Pricing: ₹79/mo · ₹699/yr.

### Android setup
- Package `com.octane.allocat` (applicationId, namespace, Java packages, appId,
  OAuth deep-link scheme).
- Manifest `tools:replace` for Adapty backup-rule merge; `buildFeatures.buildConfig`
  enabled (AGP 8).

### Go-live still required
- Run migration `docs/migrations/2026-06-14-profiles-subscription.sql`.
- Set `NEXT_PUBLIC_ADAPTY_PUBLIC_KEY`, `ADAPTY_WEBHOOK_SECRET`; real `PRODUCT_IDS`;
  Adapty access-level/placement `premium`; Play subscription products.
- Add `com.octane.allocat://auth/callback` to Supabase Auth redirect allowlist.