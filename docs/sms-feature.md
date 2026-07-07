# SMS Transaction Auto-Categorization (Android)

Reads bank/UPI **transaction** SMS, parses amount + merchant, and either logs the
spend automatically (known merchant) or asks the user to allocate it (new
merchant) — learning the choice so repeats are silent. Warns when a category
nears its budget. Android-only (iOS forbids reading SMS).

## Architecture

```
Incoming SMS ─► SmsTransactionReceiver (fires even app-killed)
                 │  SmsFilter.isLikelyTransaction()  ← on-device compliance gate
                 ▼
        SmsQueue (SharedPreferences)  +  emit "smsReceived" if WebView alive
                 │
   SmsBridge.tsx (native-only) ─► ingestSmsClient()
                 │  parseTransactionSms (regex, 100% on-device)
                 │  matchMerchantRule (IDB)
                 ▼
        optimistic IDB write + enqueue ─► SyncEngine ─► ingestSmsTransaction (server)
                 │                                         │ matched+auto → quickLogSpend → near-limit push
                 └──────────────────────── unmatched ─────┴─► push "allocate it" → /sms?txn=<id>
```

### Key files
| Layer | Path |
|------|------|
| Regex parser (TDD) | `lib/ai/parseSmsTransaction.ts` (+ `.test.ts`) |
| Merchant match / dedupe (TDD) | `lib/sms/match.ts` (+ `.test.ts`) |
| Client pipeline | `lib/sms/ingestClient.ts` |
| Server actions | `lib/actions/sms.ts` (`ingestSmsTransaction`, `categorizeSmsTransaction`, `ignoreSmsTransaction`) |
| Hooks | `lib/hooks/useSmsTransactions.ts` |
| UI + dev harness | `components/sms/SmsPage.tsx`, route `app/(app)/sms/page.tsx` |
| Sync wiring | `lib/sync/SyncEngine.ts` (`sms_transactions` dispatchers), `lib/providers/SyncProvider.tsx` |
| Data model | migration `supabase/migrations/20260603000000_sms_transactions_merchant_rules.sql`, `lib/db/AllocatDB.ts` v8, `lib/types/database.ts` |
| Native plugin | `android/app/src/main/java/app/allocat/mobile/{SmsReaderPlugin,SmsTransactionReceiver,SmsFilter,SmsQueue}.java`, `MainActivity.java` |
| JS binding / bridge | `lib/native/SmsReader.ts`, `components/pwa/SmsBridge.tsx` |

The `/sms` screen is reachable via the transaction push notification (deep link
`/sms?txn=<id>`) or directly. It also includes a **paste-SMS dev harness** to
exercise the whole pipeline in a normal browser, no device needed.

## Run the database migration
Apply `supabase/migrations/20260603000000_sms_transactions_merchant_rules.sql`
to Supabase (creates `sms_transactions` + `merchant_rules` with RLS).

## Build & run the Android app (remote-URL WebView)
Capacitor loads the deployed Next.js app; only the native SMS plugin is bundled.

```bash
# Point the shell at JDK 21 (Capacitor 8 requires it)
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"

# Production: capacitor.config.ts defaults server.url to https://allocat.xyz/dashboard
npx cap sync android

# LAN dev against a local Next server (enables cleartext http automatically):
CAP_SERVER_URL=http://<your-lan-ip>:3000 npx cap sync android

npx cap run android        # or: npx cap open android  → Run in Android Studio
```

### Manual end-to-end on a device/emulator
```bash
# Simulate an incoming bank SMS to the emulator
adb emu sms send HDFCBK "Rs.1,500.00 debited from a/c **1234 on 02-06-26 to VPA amazon@ybl. Avl Bal Rs.10,000"
```
Expect: the SMS is captured (app open or closed), appears on `/sms` as pending
(or auto-logs if a rule exists), and a notification fires. Categorize once with
"remember" on, then resend — the second one should auto-apply silently.

## Google Play compliance (REQUIRED before public release)
`RECEIVE_SMS` is a restricted permission. The eligible exception we submit under is
**"SMS-based money management"** (apps that track and manage budget) — see the Play
[SMS/Call-Log policy](https://support.google.com/googleplay/android-developer/answer/10208820).
Full submission steps and the exact text to paste live in **`docs/play-release.md`**.

Status of the in-app prerequisites:
- [x] Request **only** `RECEIVE_SMS` (no `READ_SMS`; the inbox is never read).
- [x] **No third-party egress** — parsing is 100% on-device; the OpenRouter LLM
      fallback was removed. The raw SMS body/sender stay on-device; only extracted
      fields + a hashed dedupe key sync (see `ingestSmsClient` / `ingestSmsTransaction`).
- [x] **Prominent disclosure** before the OS permission prompt (`NativeSetup.tsx`)
      with a link to the privacy policy; the OS prompt only fires after the user taps Allow.
- [x] In-app **privacy policy** at `/legal/privacy-policy`.
- [ ] File the **Permissions Declaration Form** + record the **demo video** (Console).
- [ ] Complete the **Data Safety** form (Console).
- [ ] Store-listing copy documents SMS reading as core functionality (Console).
- [ ] Upload to an **internal-testing track** first as a rejection-safe fallback.
      The remote-WebView shell can trip "minimum functionality"; the substantial
      native code (background receiver, local notifications, rule engine) is the mitigation.

## Notes / future work
- **Background-while-killed notifications:** MVP queues SMS natively and notifies
  on next app open (the live path notifies immediately while open). The native
  parser (`SmsParser.java`) also matches rules and notifies while the app is closed.
- Parsing is on-device regex only (`parseSmsTransaction.ts`); SMS that don't yield
  an amount become `pending` for manual allocation on `/sms`. Keep the JS and
  native (`SmsParser.java`) patterns in sync.
- iOS builds (if added) must exclude this feature.
