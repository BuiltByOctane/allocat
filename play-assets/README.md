# AlloCat — Play Store graphics

Generated from the live app (dark theme · Neo·Lime accent · real test-account data).
Captured at 1080×1920 via headless Chromium against `localhost:3000`.

## What to upload

| Play listing slot | File | Spec |
|---|---|---|
| **Phone screenshots** (styled) | `marketing/01..06-*.png` | 1080×1920, PNG · use these 6 |
| **Feature graphic** (required) | `store/feature-graphic.png` | 1024×500, PNG |
| **App icon** (required) | `store/icon-launcher-512.png` | 512×512, PNG — matches installed launcher |
| App icon (alt) | `store/icon-lime-512.png` | 512×512, lime variant |

`raw/` = plain unstyled screenshots of every screen (incl. profile/activity). Kept for
reference; **don't upload `raw/profile.png`** — it shows a real email address.

## Marketing frames (order = store order)
1. dashboard — "Every rupee gets a job"
2. budget — "Budgets that balance"
3. sms — "Spends track themselves"
4. goals — "Hit every goal"
5. net-worth — "Net worth, one number"
6. debt — "Crush your debt"

## Known cosmetic issues (test data)
- Greeting shows **"Tesr"** (test account display name typo) on dashboard frame + feature
  graphic. Rename the test account's display name, then re-run capture for a clean look.
- net-worth holdings renders as a single green circle (only 1 holding in test data).

## Regenerate
Scripts live in `/tmp/allocat-shots/` (`capture.mjs` → screenshots, `compose.mjs` → branded
assets). With dev server up:
```
cd /tmp/allocat-shots
ALLOCAT_EMAIL=… ALLOCAT_PASS=… THEME=dark node capture.mjs   # raw/
node compose.mjs                                             # marketing/ + store/
```
