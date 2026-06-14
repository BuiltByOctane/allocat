# Play Store release — copy-paste pack (AlloCat)

Everything below is ready to paste into Play Console. The only manual steps are
recording the demo video and clicking through the forms.

- **App ID:** `com.octane.allocat`
- **Restricted permission requested:** `RECEIVE_SMS` only (no `READ_SMS`).
- **Eligible policy use case:** **SMS-based money management** (apps that track and
  manage budget) — Play [SMS/Call-Log policy](https://support.google.com/googleplay/android-developer/answer/10208820).
- **Privacy policy URL:** `https://allocat.xyz/legal/privacy-policy`

---

## 1. Permissions Declaration Form (SMS)

**Which permission group:** SMS (`RECEIVE_SMS`).

**Selected use case:** *SMS-based money management.*

**Justification (paste):**
> AlloCat is a personal budgeting app. Its core feature automatically tracks the
> user's spending by reading incoming bank/UPI **transaction** SMS. When a
> transaction SMS arrives, AlloCat parses the amount, merchant, and direction
> **entirely on the device** and records the spend against the user's budget.
>
> Only `RECEIVE_SMS` is requested — AlloCat listens for newly-arriving messages
> via a broadcast receiver and never reads the existing SMS inbox (no `READ_SMS`).
> An on-device filter processes only financial transaction messages; OTPs,
> personal, and promotional messages are discarded immediately and never stored or
> transmitted. The raw SMS content never leaves the device and is never shared with
> any third party — only the extracted transaction fields (amount, currency,
> normalized merchant, direction, date) and a one-way hashed de-duplication key are
> synced to the user's own account to keep budgets consistent across devices.
>
> SMS access is core to the app's primary purpose; without it the automatic
> spend-tracking feature cannot function.

**Prominent disclosure:** shown in-app before the runtime permission prompt
(`NativeSetup.tsx`), with a link to the privacy policy. The OS permission dialog
only appears after the user taps "Allow".

---

## 2. Demo video script (record ~60–90s, screen recording on a real device)

1. Fresh launch → the **disclosure screen** appears: read the line "reads only
   your transaction SMS… parsed on your device… never uploaded or shared."
2. Tap **Allow SMS access** → the **OS permission dialog** appears (shows the
   prompt comes *after* the disclosure) → Allow.
3. Send a test bank SMS to the device, e.g.
   `Rs.499 spent on your SBI Card at AMAZON on 01-Jun-26. Avl Lmt Rs.40,000`.
4. Show the transaction **notification**, tap it → lands on the **/sms** screen
   with the parsed amount + merchant as a pending item.
5. **Allocate** it to a budget category with "remember merchant" on.
6. Send the same SMS again → it **auto-categorizes silently** and the budget
   updates. End.

Keep the whole flow visible (don't cut away from the permission dialog).

---

## 3. Data Safety form answers

**Data collected / shared**

| Question | Answer |
|---|---|
| Does the app collect or share user data? | Yes (collect). **No data shared with third parties.** |
| Is data encrypted in transit? | Yes |
| Can users request deletion? | Yes (in-app / by email) |

**Data types**
- **Financial info → Purchase/transaction info (derived):** Collected. Purpose:
  *App functionality.* Not shared. Transmitted encrypted. *Note:* derived from
  transaction SMS **on-device**; the raw SMS message content is **not** collected
  off-device.
- **Personal info → Email address:** Collected for *App functionality / Account
  management.* Not shared.
- **App activity / app info** (budgets, categories, goals the user creates):
  Collected for *App functionality.* Not shared.

**Explicitly NOT collected/uploaded:** SMS message content, contacts, SMS inbox,
location, photos. (SMS text is processed only on-device.)

**SMS/Call-Log declaration consistency:** use case = *SMS-based money management*;
data used only for the core budgeting feature; not sold; not used for ads.

---

## 4. Store listing copy

**Short description (≤80 chars):**
> Minimalist budgeting that auto-tracks spends from your bank SMS — on-device.

**Long description (excerpt — keep the SMS paragraph verbatim for review consistency):**
> AlloCat is a clean, offline-first personal finance app for budgets, goals, debts
> and net worth.
>
> **Automatic spend tracking (Android):** AlloCat reads your incoming bank/UPI
> **transaction** SMS to log spends against your budget automatically. All parsing
> happens **on your device** — the raw SMS text never leaves your phone and is
> never shared with anyone. Only financial transaction messages are used; OTPs and
> personal messages are ignored. You can turn this off anytime in settings.

---

## 5. Pre-upload checklist
- [ ] `RECEIVE_SMS` only in the manifest (no `READ_SMS`) — verify with
      `aapt dump permissions` on the built AAB.
- [ ] Privacy policy URL resolves publicly: `https://allocat.xyz/legal/privacy-policy`.
- [ ] Release build signed; `versionCode` incremented.
- [ ] Upload to **internal testing** first; submit the declaration; iterate if Google asks for changes.
