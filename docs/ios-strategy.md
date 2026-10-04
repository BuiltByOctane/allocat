# iOS strategy — low-friction expense capture without SMS

Research note, 2026-09-16. Question: Android gets automatic capture via `RECEIVE_SMS`
(`docs/sms-feature.md`). iOS forbids any SMS/inbox access, so today iPhone users get the
web app and must open it to log every spend. What is the closest iOS equivalent, and is a
native app required?

**Short answer:** iOS has a real automatic-capture path — Shortcuts' **Notification
automation trigger** (new in iOS 27, public release Sept 2026) — plus a rich set of
one-gesture entry points (Back Tap, Action Button, Control Center, Lock Screen, Siri,
Screenshot automation). None of it needs an App Store app: Shortcuts talks to an **HTTP
endpoint**, not to the app binary. So Phase 0 ships on the existing PWA. A native shell is
a Phase 1 upgrade that removes the token-paste step, keeps parsing on-device, and buys
widgets + share extension.

---

## 1. What iOS actually forbids

| Capability | iOS | Notes |
|---|---|---|
| Read SMS inbox / receive SMS broadcasts | ❌ never | No public API at all. Not a permission question. |
| Read other apps' push notifications, from an app | ❌ | Only Apple Watch relay / accessibility hacks, both unusable. |
| Read other apps' push notifications, **from a Shortcuts automation** | ✅ iOS 27 | See §2. This is the loophole. |
| Web Share Target (PWA receives shares) | ❌ | WebKit does not implement it; `app/share-target/` is Android/desktop-only. |
| PWA widgets / Control Center / NFC / background sync | ❌ | Native only. |
| PWA push notifications | ✅ iOS 16.4+ | Home-screen web apps only. iOS 26 makes standalone display the default for any added site. |

## 2. The headline: iOS 27 Notification automation trigger

Shortcuts in iOS 27 can run **when a notification arrives from a chosen app**, filter on
title/subtitle/message, and exposes a `Notification` magic variable carrying the **body
text**.

Every Indian payment app and bank app already pushes a transaction notification
("₹240 paid to Blue Tokai", "A/c XX12 debited INR 240"). So:

```
Notification from [GPay | PhonePe | Paytm | HDFC | ICICI …]
  → (optional) Match Text filter to keep only debit-shaped bodies
  → Get Contents of URL  POST https://allocat.xyz/api/ingest/shortcut
       Authorization: Bearer <user token>
       { "text": <Notification body>, "source": "ios-notification" }
```

That is functional parity with the Android SMS pipeline, from the user's side: zero taps,
happens while the phone is in a pocket.

Caveats to be honest about in the UI:

- **iOS 27 only.** Ships Sept 2026; adoption ramps over ~6 months.
- **One automation per source app.** The user sets up 2–5 of them. Mitigate with a
  pre-built shortcut + a 60-second setup guide (screenshots) on `/sms` for iOS.
- **Notification must be delivered.** A user who has muted their bank app's notifications
  captures nothing.
- **Privacy is a step down from Android.** Android parses on-device and never uploads the
  raw SMS. A Shortcut POST uploads the raw notification body. Two mitigations, in order of
  preference:
  1. Parse inside the Shortcut using `Match Text` (Shortcuts supports regex) and POST only
     the extracted fields — keeps the "raw never leaves the phone" promise, but means a
     **third** copy of the parser (after `parseSmsTransaction.ts` and `SmsParser.java`) in
     a format that is painful to maintain.
  2. POST the raw text, parse server-side with the existing TS parser, **never persist the
     raw** (`IngestSmsInput.raw` is already documented as never-persisted). Say so plainly
     in the setup screen and the privacy policy.

  Recommend (2) for v1, (1) only if it becomes a trust objection.

## 3. Entry points that work on iOS **today** (no iOS 27, no native app)

All of these run a Shortcut, and a Shortcut can POST to our API without ever opening the app.

| Gesture | Requirement | Fit |
|---|---|---|
| **Back Tap** — double/triple tap the back of the phone | iPhone 8+, iOS 14+ | The thing you asked about. Best manual-entry gesture: tap-tap → "Amount?" → POST → banner "₹240 logged". Triple tap if phantom double-taps are a problem. |
| **Action Button** | iPhone 15 Pro+ | Same shortcut, one press. |
| **Control Center control / Lock Screen widget slot** | iOS 18+ | Log without unlocking. |
| **Siri phrase** — "Log two forty coffee" | any | Hands-free, in the car. Shortcut name is the phrase. |
| **Home Screen shortcut icon** | any | Sits next to the AlloCat PWA icon. |
| **Apple Watch complication** | any | Runs the same shortcut from the wrist. |
| **NFC tag automation** | any | Tag on the desk/wallet → log. Niche but fun. |
| **Screenshot automation** — "when a screenshot is taken" | iOS 16+ | Screenshot the GPay success screen → `Extract Text from Image` → POST. Pre-iOS-27 auto-capture with one deliberate user action. Filter on "paid"/"₹" so unrelated screenshots do not fire. |
| **Email automation trigger** — "email from X, subject contains Y" | iOS 18+ | Banks email transaction alerts. Pre-iOS-27 zero-tap path, but depends on Mail being set up and fetching. |
| **Wallet/Transaction trigger** (was "Transaction", renamed "Wallet" in iOS 26) | Apple Pay cards | Fires on a card tap with amount + merchant. Useless in India for now — Apple Pay launches there ~Oct 2026 **without UPI**, cards only — but it is the best capture path for US/EU users. |

Note the PWA-launch quirk: `Open URL` from a Shortcut opens **Safari**, not the installed
home-screen web app. So Shortcuts should hit the **API** (`Get Contents of URL`), not deep
link, whenever the goal is "log without leaving what I'm doing".

## 3a. What is built (2026-09-16)

Phase 0's manual-log path is implemented and tested; the notification-automation
path in §2 is not (it is the same `POST /api/shortcut/log` endpoint with a body
the shortcut parses, so it needs no new server work).

| Piece | Where |
|---|---|
| `api_tokens` table, hash-only | `supabase/migrations/20260916000000_api_tokens.sql` |
| Token mint / hash / bearer auth | `lib/server/api-tokens.ts` |
| Token UI actions | `lib/actions/api-tokens.ts` |
| Picker feed | `app/api/shortcut/items/route.ts` + `lib/shortcut/choices.ts` |
| Log endpoint | `app/api/shortcut/log/route.ts` + `lib/shortcut/logBody.ts` |
| Session-free spend engine | `lib/server/spend-core.ts`, `assets-core.ts`, `debts-core.ts` |
| Setup screen | `/shortcut` → `components/shortcut/ShortcutSetupPage.tsx` |

Two things remain, both requiring a physical iPhone: authoring the shortcut and
publishing its iCloud link into `NEXT_PUBLIC_IOS_SHORTCUT_URL`. Until that is
set, `/shortcut` shows the step-by-step build recipe instead of an Add button.

## 4. Phase 0 — ship on the existing PWA (days, no Mac, no $99)

Work required:

1. **Personal API token.** New table `api_tokens (id, user_id, token_hash, label,
   last_used_at, created_at, revoked_at)`, RLS own-row. Generate + copy + revoke UI on
   `/profile` or `/sms`. Hash at rest (SHA-256); show the plaintext once.
2. **`app/api/ingest/shortcut/route.ts`** — Bearer token → user id via service client →
   parse with `parseTransactionSms` → dedupe with `txnDedupeKey` → reuse the existing
   ingest path (`ingestOne` in `lib/actions/sms.ts`, currently private to the module;
   export it or lift the shared core). Must be rate-limited (`lib/server/rateLimit.ts`)
   and must **not** persist `raw`.
   - Note: this route bypasses `getAuthedUser()` cookie auth by design, so it needs its
     own auth unit test and it must never accept a `user_id` from the body.
   - Accept both shapes: `{text}` (parse server-side) and `{amount, merchant, occurredAt,
     currency}` (already parsed inside the Shortcut) — the second shape is the privacy
     upgrade path from §2.
3. **Published shortcut library** (iCloud links, versioned, listed on an `/ios` page):
   - *AlloCat: Quick Log* — Ask for amount → optional note → POST. Bind to Back Tap.
   - *AlloCat: Auto-Log Notifications* (iOS 27) — the §2 automation.
   - *AlloCat: Log from Screenshot* (iOS 16+).
   - *AlloCat: Log from Bank Email* (iOS 18+).
   Each starts with a "paste your token" text action.
4. **iOS onboarding surface.** `/sms` currently assumes Android. Branch on platform: iPhone
   users see the shortcut setup guide instead of the SMS permission flow. The existing
   pending/allocate UI on `/sms` works unchanged — a shortcut-ingested row is just another
   `sms_transactions` row.
5. Install-to-Home-Screen prompt polish + Web Push (works on iOS 16.4+ home-screen web
   apps) so spend alerts still land.

This covers the great majority of the gap. It is also the fastest way to learn whether
iPhone users actually adopt the automation before paying for a native build.

## 5. Phase 1 — native iOS shell (weeks, $99/yr, Mac + Xcode)

Capacitor already runs the Android shell in remote-URL mode; iOS uses the same
`capacitor.config.ts` `server.url`. What native buys:

- **App Intents** — "Log Spend in AlloCat" appears as a first-class Shortcuts action, so
  the Notification automation pipes into the app with **no token paste and no raw text
  leaving the device**. Mirror the Android design exactly: the App Intent appends the text
  to an App Group queue (iOS twin of `SmsQueue`), the WebView drains it on next open via a
  Capacitor plugin (iOS twin of `SmsBridge`/`SmsReader`), and `lib/sms/ingestClient.ts`
  parses it with the **existing TS parser** — no third parser copy needed, unless we also
  want an immediate native notification while the app is closed (that would need a Swift
  port of the parser, same as `SmsParser.java`).
- **Share extension** — share a UPI screenshot or a payment SMS's text into AlloCat. This
  is the iOS replacement for `app/share-target/`; it can reuse `lib/ai/parseSpend.ts`.
- **Interactive Home Screen widget** (iOS 17+) with 2–3 one-tap amounts, **Control Center
  control**, **Live Activity** for "budget left today".
- **FCM/APNs**, proper offline shell, App Store distribution and discovery.

Review risks to plan for, not discover:

- **Guideline 4.2 minimum functionality.** A bare full-screen `WKWebView` on a remote URL
  is the textbook rejection. The App Intents + share extension + widgets above are exactly
  what makes it pass — do not submit the shell before they exist.
- **Guideline 4.8 login services.** The app offers Google OAuth, so it must also offer Sign
  in with Apple (or another equivalent private option). Not currently implemented.
- **Guideline 5.1.1(v)** — in-app account deletion is mandatory. Verify `/profile` has it.
- Keep the money surface as-is: Ko-fi opens in the **system browser**, `is_supporter` stays
  cosmetic. Same reasoning as Play — gating anything on a donation turns it into a purchase
  of digital content (Apple 3.1.1 is stricter than Play here).

## 6. Phase 2 — real bank data (only at scale)

India's RBI **Account Aggregator** framework (Finvu, Setu/Pine Labs, OneMoney, CAMSFinServ;
13+ licensed NBFC-AAs) is the sanctioned, consent-based replacement for SMS scraping, and
it is **platform-independent** — it would fix iOS *and* make Android's SMS parser optional.
Cost: you must be a registered FIU or ride a partner's licence, pricing is quote-only, and
the compliance surface is real. Outside a bootstrapped free app's budget today. Revisit if
AlloCat ever monetizes or partners. Plaid/equivalents are the same story for US/EU.

## 7. Recommendation

1. Build Phase 0 now — token + `/api/ingest/shortcut` + four published shortcuts + an iOS
   setup page. Back Tap manual logging works on every iPhone from day one; iOS 27 users get
   automatic capture that matches Android.
2. Instrument it (a `source` value per ingest: `ios-notification`, `ios-backtap`,
   `ios-screenshot`, `ios-email`) and watch adoption on `/admin`.
3. Ship the native shell only once the App Intents + widget + share-extension set is
   designed, so it clears 4.2 on first submission.

## Sources

- [Run shortcuts by tapping the back of your iPhone — Apple](https://support.apple.com/guide/shortcuts/run-shortcuts-tapping-iphone-apd897693606/ios)
- [Use Back Tap on your iPhone — Apple](https://support.apple.com/en-us/111772)
- [Add automations to Shortcuts — Apple](https://support.apple.com/guide/shortcuts/add-automations-apdfbdbd7123/ios)
- [Transaction (Wallet) triggers in Shortcuts — Apple](https://support.apple.com/guide/shortcuts/transaction-trigger-apd65c67538a/ios)
- [iOS and iPadOS 27: The MacStories Review — automations](https://www.macstories.net/stories/ios-and-ipados-27-review/13/)
- [iOS 27 Makes the Shortcuts App Much Less Intimidating — MacRumors](https://www.macrumors.com/guide/ios-27-shortcuts/)
- [PWA iOS limitations and Safari support 2026 — MagicBell](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [Do PWAs work on iOS? 2026 — MobiLoud](https://www.mobiloud.com/blog/progressive-web-apps-ios/)
- [App Store review guidelines and WebView wrappers — MobiLoud](https://www.mobiloud.com/blog/app-store-review-guidelines-webview-wrapper)
- [Guideline 4.2 minimum functionality rejections](https://ascauto.org/rejections/guideline-4-2)
- [Apple Pay India launch, cards only, no UPI — Medianama](https://www.medianama.com/2026/08/223-apple-pay-launch-india-without-upi/)
- [Account Aggregator framework guide 2026 — HyperVerge](https://hyperverge.co/blog/account-aggregator-framework-rbi/)
- [capacitor-plugin-siri-shortcuts](https://github.com/lovetodream/capacitor-plugin-siri-shortcuts)
