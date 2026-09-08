# Console setup — copy-paste pack (browser agent)

Two independent console jobs. Each is self-contained: hand **one section at a
time** to the browser extension, and collect the artifacts listed at the end of
it before moving on.

Constant used by both:

- **Package / App ID:** `com.octane.allocat`

## Handling the files these jobs produce

Two of the downloads are **secrets**. Rules for the agent and for you:

- **Never paste a key file's contents into a chat, an issue, or a commit.**
  Download it, then tell the human the filename and where it landed.
- `google-services.json` is **not** a secret — it ships inside every APK, so
  anyone can extract it. Note that `android/.gitignore:65` has its ignore rule
  **commented out**, so this file will be committed. That is fine and usually
  what you want (a fresh clone can build), but be aware it is going into git.
- The two service-account JSON files **are** secrets. They go into `.env.local`
  as base64 and nowhere else. `.env.local` is already gitignored.
- The browser extension cannot write to this repo. It downloads to your
  Downloads folder; you move the files.

---

# Job 1 — Firebase (Cloud Messaging), for broadcast push to the Android app

**Goal:** let the server send notifications to the installed Android app. The
app is a Capacitor WebView with no FCM today, so browsers get web push and the
Android app currently gets nothing.

**Console:** https://console.firebase.google.com

### F1. Create the project

1. Go to https://console.firebase.google.com and click **Create a project**
   (if an "AlloCat" project already exists, use it and skip to F3).
2. Project name: `AlloCat`.
3. **On the Google Analytics step, turn Google Analytics OFF.**
   This matters and is not a preference: Analytics drags in the
   `com.google.android.gms.permission.AD_ID` permission, and this app
   deliberately strips that permission (`android/app/src/main/AndroidManifest.xml`)
   so it can answer **"No"** to Play Console's advertising-ID question. Cloud
   Messaging alone does not need Analytics.
4. Create the project and wait for provisioning.

### F2. Register the Android app

1. On the project overview, click the **Android** icon ("Add app").
2. **Android package name:** `com.octane.allocat` — must match exactly, this is
   the applicationId in `android/app/build.gradle:23`.
3. App nickname: `AlloCat Android`.
4. **Debug signing certificate SHA-1: leave blank.** It is only needed for
   Firebase Auth / Dynamic Links, neither of which this app uses.
5. Click **Register app**, then **Download `google-services.json`**.
6. Stop there — skip the "Add Firebase SDK" and "Next steps" screens. The Gradle
   wiring already exists in this repo (`android/build.gradle:11` has the
   `com.google.gms:google-services:4.4.4` classpath, and
   `android/app/build.gradle:77-82` applies the plugin automatically the moment
   the JSON file is present).

### F3. Confirm the v1 API is on

1. Left sidebar → gear icon → **Project settings** → **Cloud Messaging** tab.
2. Confirm **Firebase Cloud Messaging API (V1)** shows **Enabled**. If it shows
   a "Manage API in Google Cloud Console" link and the API is disabled, open it
   and click **Enable**.
3. Ignore "Cloud Messaging API (Legacy)" — it is deprecated and this
   integration does not use server keys.

### F4. Create the server credential

1. Same **Project settings** page → **Service accounts** tab.
2. Click **Generate new private key** → confirm → a JSON file downloads.
3. This file is a **secret**. Do not open it in a shared screen, do not paste it.

### F5. Record the project id

- **Project settings → General → Project ID** (e.g. `allocat-1a2b3`). Not the
  display name, not the project number. Write it down.

### Job 1 artifacts to hand back

| Artifact | What to do with it |
|---|---|
| `google-services.json` | Move to `android/app/google-services.json` |
| Service-account JSON (from F4) | `base64 -i <file> \| tr -d '\n'` → `FCM_SA_JSON_B64` in `.env.local` |
| Firebase **Project ID** | `FCM_PROJECT_ID` in `.env.local` |

Report back: the Project ID, and confirmation that FCM **V1** is enabled.

---

# Job 2 — Google Play Console + GCP, for install statistics

**Goal:** pull real install/uninstall counts into `/admin/growth`. Play has no
REST API for installs; the numbers live in monthly bulk-report CSVs that Google
writes to a Cloud Storage bucket owned by the developer account.

**Consoles:** https://play.google.com/console and https://console.cloud.google.com

### P1. Get the reports bucket id

1. Play Console → select the **AlloCat** app (or stay at account level).
2. Left sidebar → **Download reports** → **Statistics**.
3. Near the top of that page is a **Copy Cloud Storage URI** button / a URI that
   reads `gs://pubsite_prod_1234567890123456789`.
4. Copy it. **Only the bucket name is needed** — i.e. strip the `gs://` prefix:
   `pubsite_prod_1234567890123456789`.

### P2. Link a Google Cloud project to Play

> **This step no longer exists in the current Play Console** (verified 2026-09-08).
> **Setup → API access** is gone; every URL variant redirects to the app list,
> and it is not under Settings, Developer account, or Users and permissions.
>
> Skip it. Create the service account directly in Google Cloud (P3), then grant
> it report access by inviting its email under **Users and permissions** (P4).
> Bucket access comes from the Play grant, not from GCP IAM, so no Cloud-project
> link is needed. This is how the existing service accounts on this developer
> account are already set up.

### P3. Create the service account

1. Go to https://console.cloud.google.com → **IAM & Admin → Service Accounts →
   Create service account**. Any project will do; it only holds the identity.
2. Name: `allocat-play-reports`. Description: `Reads Play bulk install reports`.
3. **Grant this service account access to project: skip it.** Leave the roles
   empty. Access to the reports bucket is granted by Play Console in P4, not by
   GCP IAM — adding project roles here would over-permission it for no benefit.
4. **Done**. Then open the new account → **Keys** tab → **Add key → Create new
   key → JSON** → it downloads.
5. **Copy the service account's email address** — it looks like
   `allocat-play-reports@<project>.iam.gserviceaccount.com`. Needed in P4.
6. This JSON file is a **secret**. Same handling rules as F4.

### P4. Grant it report access in Play Console

1. Play Console → **Users and permissions** → **Invite new user**.
2. Paste the service-account email from P3.5 as the user's email address.
3. On the **Account permissions** tab, enable:
   - ☑ **View app information and download bulk reports (read-only)**
4. Leave everything else unchecked. This account never needs to publish,
   release, reply to reviews or read financials. Play auto-implies
   *"View app quality information (read-only)"* underneath it and will not let
   you untick that — expected, and harmless.
5. Optionally restrict it under **App permissions** to AlloCat only.
6. **Invite user / Apply**.

### P5. Expect a delay

Bulk-report bucket access can take **up to 24 hours** to propagate after the
permission is granted. A `403` on the first sync attempt is normal — retry the
next day before treating it as broken.

Also note: report files only exist for months in which the app had activity, and
the **current month's file is partial** (Play data lags roughly a day).

### Job 2 artifacts to hand back

| Artifact | What to do with it |
|---|---|
| Bucket name from P1 | `PLAY_BUCKET` in `.env.local` (no `gs://` prefix) |
| Service-account JSON (from P3) | `base64 -i <file> \| tr -d '\n'` → `PLAY_SA_JSON_B64` |
| — | `PLAY_PACKAGE=com.octane.allocat` (already the default) |

Report back: the bucket name, the service-account email, and confirmation that
"View app information and download bulk reports" is ticked.

---

## Verifying, once both jobs are done

```bash
# Play install stats — no rebuild needed, this is server-side only.
# Open /admin/growth and press "Sync now". Expect day-rows to appear.
# A 403 within the first 24h is the P5 propagation delay, not a bug.
```

FCM is wired in as of 2026-09-08 (`@capacitor/push-notifications`, `fcm_tokens`,
`lib/server/fcm.ts`, versionCode `12` / `1.0.5`). To verify it end to end:

1. Apply `supabase/migrations/20260908020000_fcm_tokens.sql`.
2. Deploy the web app — the native shell loads it remotely, so `registerFcmToken`
   must exist on the server the APK is pointed at.
3. Install the APK, sign in, accept the notification permission.
4. `/admin` → Push reach should show 1 Android device.
5. `/admin/broadcast` → "Send test to me".
