# Play Store Launch Compliance Report — AlloCat

**App ID:** `com.octane.allocat` · **versionCode:** 2 · **versionName:** 1.0.1
**Date:** 2026-06-14 · **Target SDK:** 36 (Android 16) · **min SDK:** 24

This report audits AlloCat against current Google Play policies and lists every
action required before public release. Items are grouped by where the work
happens: **code/repo** (we fix), **Play Console** (forms/uploads), and
**infra** (keystore, hosting). Severity: 🔴 blocker · 🟡 required · 🟢 verify.

The existing copy-paste submission pack lives in `docs/play-release.md` — this
report supersedes its checklist by adding the gaps found in the audit.

---

## 0. Executive summary

The hard part — the **SMS restricted-permission** story — is already in good
shape: only `RECEIVE_SMS` is declared, parsing is 100% on-device, raw SMS never
leaves the phone, and a prominent disclosure precedes the OS prompt. That is the
single most-rejected area on Play and it is largely handled.

The remaining work is mostly **Play Console paperwork** plus a few real code
gaps. The biggest code gap: **there is no in-app account-deletion flow**, yet
the privacy policy implies one exists and Play's Account Deletion policy
requires a deletion path. Fix that before submitting.

**Top blockers**
1. 🔴 No account-deletion mechanism (in-app or public web URL). — code/infra
2. 🔴 Release keystore not committed/configured; signing block is conditional. — infra
3. 🔴 SMS Permissions Declaration Form + demo video not yet filed. — Console
4. 🔴 Data Safety form not completed. — Console

---

## 1. SMS / Call-Log restricted permission (the main review hurdle)

Policy: [Use of SMS or Call Log permission groups](https://support.google.com/googleplay/android-developer/answer/10208820).
Eligible use case we claim: **SMS-based money management** (apps that track and
manage budget).

| # | Item | Status | Action |
|---|------|--------|--------|
| 1.1 | `RECEIVE_SMS` only, no `READ_SMS` | 🟢 done | Confirmed in `AndroidManifest.xml:65`. Re-verify on the built AAB: `aapt dump permissions app-release.aab`. |
| 1.2 | On-device parsing, no third-party egress | 🟢 done | Regex parser `lib/ai/parseSmsTransaction.ts`; only extracted fields + hashed dedupe key sync. No LLM. |
| 1.3 | Prominent disclosure before OS prompt | 🟢 done | `components/pwa/NativeSetup.tsx` — disclosure shown first run, OS prompt fires only on user tap. Links to privacy policy. |
| 1.4 | Privacy policy covers SMS handling | 🟢 done | `/legal/privacy-policy` has a dedicated SMS section. |
| 1.5 | Permissions Declaration Form | 🔴 not filed | File in Console → App content → Sensitive app permissions. Paste justification from `docs/play-release.md §1`. |
| 1.6 | Demo video (public URL, e.g. unlisted YouTube) | 🔴 not made | Record per `docs/play-release.md §2`. Must show disclosure → OS dialog → real SMS → categorize, without cutting away from the permission dialog. |
| 1.7 | Store listing documents SMS as core | 🟡 pending | Use the verbatim SMS paragraph from `docs/play-release.md §4` in the long description. |

**Risk note:** Google may still reject if the demo doesn't clearly prove the SMS
feature is *core*. Keep the video tight and on-device.

---

## 2. Account deletion (Play policy, blocker)

Policy: [User Data → Account deletion](https://support.google.com/googleplay/android-developer/answer/13327111).
Any app with account creation must let users **request deletion of the account
and associated data**, and provide a **deletion request URL** in the Data Safety
form that is reachable without installing the app.

| # | Item | Status | Action |
|---|------|--------|--------|
| 2.1 | In-app account deletion | 🔴 missing | No delete flow exists in `lib/actions/*` or profile UI. Privacy policy says "in-app account-deletion option where available" — currently it isn't. Build a delete-account action (auth user + cascade delete Supabase rows) and a profile entry point, OR |
| 2.2 | Public web deletion URL | 🔴 missing | At minimum, publish a no-login web page (e.g. `/legal/delete-account`) explaining how to request deletion + a form/email, and enter that URL in Data Safety. Email-only is accepted but a dedicated URL is safer. |
| 2.3 | Privacy policy wording matches reality | 🟡 fix | Once 2.1/2.2 exist, tighten the deletion paragraph so it states the actual mechanism (no "where available" hedge). |

**Recommendation:** ship a real in-app "Delete account" in profile (Supabase
`auth.admin.deleteUser` via a server action + RLS cascade) — it satisfies both
the in-app requirement and gives a clean story for review.

---

## 3. Data Safety form (Console, blocker)

Policy: [Data safety](https://support.google.com/googleplay/android-developer/answer/10787469).
Must match the privacy policy and actual behavior exactly. Answers prepared in
`docs/play-release.md §3`. Key declarations:

- Collects: Financial info (derived transaction info), Personal info (email),
  App activity (budgets/goals/etc.). **Shares: none.**
- Encrypted in transit: **yes**. Deletion: **yes** (link to 2.2 URL).
- **Explicitly NOT collected off-device:** raw SMS body, sender, contacts,
  location, photos.

🔴 Action: complete the form in Console; ensure the "data deletion" answer points
to the URL from §2.

---

## 4. App content / declarations (Console)

| # | Declaration | Expected answer | Status |
|---|-------------|-----------------|--------|
| 4.1 | Privacy policy URL | `https://allocat.xyz/legal/privacy-policy` | 🟢 resolves — verify it's live in prod |
| 4.2 | Ads | No ads | 🟡 declare |
| 4.3 | Content rating questionnaire (IARC) | Finance, no objectionable content → likely Everyone | 🔴 complete |
| 4.4 | Target audience & content | 13+ (policy says not for children <13) | 🔴 set; do NOT opt into Designed-for-Families |
| 4.5 | Financial features declaration | AlloCat is budgeting, **not** lending/investing/crypto/payments → answer "does not provide financial features" (confirm none of the sub-categories apply) | 🔴 complete |
| 4.6 | News app | No | 🟢 |
| 4.7 | Health / COVID | No | 🟢 |
| 4.8 | Government app | No | 🟢 |
| 4.9 | App access (login credentials for review) | App is login-gated → **must** provide a working test account (email + password) and steps so reviewers can reach the SMS feature | 🔴 create test account + add under App access |
| 4.10 | Data deletion / account deletion URL | from §2 | 🔴 |

---

## 5. Minimum functionality / WebView wrapper risk

Policy: [Minimum functionality](https://support.google.com/googleplay/android-developer/answer/9888379) — Play rejects thin
webview wrappers of a website.

- AlloCat runs in **remote-URL WebView mode** (`capacitor.config.ts` loads
  `https://allocat.xyz/dashboard`). This is the classic trigger for a
  "webview/repackaged content" rejection.
- **Mitigation (already true):** substantial native code — background SMS
  broadcast receiver, on-device filter/parser, local notifications, merchant
  rule engine, native Capacitor plugin. The app does things a website cannot.
- 🟡 Action: in the store listing and (if asked) review notes, emphasize the
  native SMS auto-tracking + offline IndexedDB app as the value, not "a website."
  Keep the SMS feature front-and-center in screenshots.

---

## 6. Code / manifest hardening

| # | Item | Status | Action |
|---|------|--------|--------|
| 6.1 | `android:allowBackup="true"` | 🟡 risk | Local SMS text + dedupe data live in app storage; auto-backup could copy them off-device. Set `allowBackup="false"` (or add a backup-rules XML excluding SMS prefs) — `AndroidManifest.xml:5`. |
| 6.2 | Release signing block conditional on env keystore | 🔴 infra | `android/app/build.gradle` only signs release if keystore env vars present. Generate a keystore, wire `storeFile/storePassword/keyAlias/keyPassword` (or use Play App Signing — recommended). |
| 6.3 | `versionCode` increment per upload | 🟡 process | Currently 2. Bump on every Console upload. |
| 6.4 | Doc URL inconsistency | 🟢 minor | `docs/sms-feature.md:54` says `allocat.app`; real URL is `allocat.xyz`. Fix to avoid confusion. |
| 6.5 | Receiver `exported="true"` + `BROADCAST_SMS` permission | 🟢 ok | Correct/required for system SMS broadcast; protected by the system permission. |
| 6.6 | OAuth deep-link scheme `com.octane.allocat://auth` | 🟢 ok | Verify Google sign-in redirect is whitelisted in Supabase + Google Cloud console for prod. |

---

## 7. Store listing assets (Console, manual)

🔴 Required before submission:
- App icon (512×512), feature graphic (1024×500).
- Phone screenshots (min 2; show the SMS allocate flow + dashboard).
- Short description (≤80) + full description — copy in `docs/play-release.md §4`.
- App category: **Finance**.
- Contact email: `innovationsoctane@gmail.com` (matches privacy policy).

---

## 8. Pre-submission checklist (ordered)

**Code/infra (do first):**
- [ ] 🔴 Build in-app account deletion (server action + profile UI) — §2.1
- [ ] 🔴 Publish `/legal/delete-account` public page + enter URL in Data Safety — §2.2
- [ ] 🔴 Generate release keystore / enable Play App Signing — §6.2
- [ ] 🟡 `allowBackup="false"` or backup-exclusion rules — §6.1
- [ ] 🟡 Tighten privacy-policy deletion wording to match — §2.3
- [ ] 🟢 Fix `allocat.app` → `allocat.xyz` doc URL — §6.4
- [ ] 🟢 Verify privacy policy + deletion URL resolve in prod
- [ ] Bump `versionCode`, build signed AAB, `aapt dump permissions` shows RECEIVE_SMS only

**Console (after build):**
- [ ] 🔴 Create reviewer test account; fill App access — §4.9
- [ ] 🔴 SMS Permissions Declaration Form + upload demo video — §1.5/1.6
- [ ] 🔴 Data Safety form — §3
- [ ] 🔴 Content rating questionnaire — §4.3
- [ ] 🔴 Target audience = 13+ — §4.4
- [ ] 🔴 Financial features declaration — §4.5
- [ ] 🟡 Ads declaration (none) — §4.2
- [ ] 🟡 Store listing copy + assets — §7
- [ ] Upload to **internal testing** track first, submit declarations, iterate on feedback

**Then:** promote internal → closed/production once the SMS declaration is approved.

---

## 9. Biggest rejection risks (watch these)

1. **SMS declaration / demo video** rejected as "feature not core" → keep video on-device, show full permission flow.
2. **Account deletion** missing → blocker, build it (§2).
3. **Minimum functionality** (webview wrapper) → lean on native SMS feature in listing + screenshots (§5).
4. **Data Safety mismatch** with privacy policy → keep both saying the exact same thing about SMS staying on-device.
