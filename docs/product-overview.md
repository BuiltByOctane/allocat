# AlloCat — Product Overview

> *Money, allocated like a cat plans its naps.*

A plain-language guide to what AlloCat is, the problem it solves, how it solves it, and every feature it offers — in detail. No code, no stack talk. Just the product.

---

## 1. What AlloCat Is

AlloCat is a **minimalist personal-finance companion** for everyday people. It lives on your phone (installable app), your desktop browser, and as a **native Android app**. One place to see your whole money picture:

- What you can spend this month (**Budget**)
- What you owe and what's owed to you (**Debt**)
- What you're saving toward (**Goals**)
- What you're worth overall (**Net Worth**)
- Where your money actually went (**Transactions & Reports**)
- A calm AI that answers questions about *your* numbers (**Ask AlloCat**)

The personality is deliberate: **calm, uncluttered, non-judgmental**. It warns you *before* you overspend, never lectures you after. The whole tone — from copy to color — is "a cat choosing its sunny spot," not a spreadsheet yelling at you.

**Tagline in the app:** *personal finance, allocated like a cat plans its naps.*

---

## 2. The Problem

Most people don't have a "money knowledge" problem. They have a **clarity** problem.

- **"Can I afford this?"** has no fast answer. Checking means opening a banking app, doing mental math, guessing.
- **Budgets feel like punishment.** Traditional budgeting apps are heavy, form-first, and make you feel bad. People abandon them.
- **Logging every spend is a chore.** Manual entry dies within a week. So the data goes stale and the app becomes useless.
- **Your money lives in silos.** Bank balance here, loan statement there, savings somewhere else, investments in a fourth place. Nobody sees the whole picture.
- **Finance apps are anxious.** Red numbers, alarms, guilt. That drives avoidance, not control.

Core belief baked into the product: **people aren't bad with money — they need clarity. Budgeting is control, not restriction. Mistakes are normal; recovery matters more.**

---

## 3. How AlloCat Solves It

Five moves, each aimed straight at a problem above.

1. **One number to check, not ten.** The dashboard leads with a single figure — *"Left to spend, this month"* — plus an on-track / off-pace / over-budget status. "Can I spend this?" becomes a glance.

2. **Budgets that build themselves.** A ~60-second, tap-only onboarding quiz asks how you live and spend, then hands you a working budget. No blank forms. Reusable **templates** let you snap the same plan onto each new month.

3. **Spends that log themselves (Android).** AlloCat reads incoming bank/UPI **transaction SMS** on-device and auto-categorizes them. Known merchant → logged silently. New merchant → one tap to allocate, and it *remembers* for next time. The manual-entry chore mostly disappears.

4. **Everything in one line.** Budget, debt, goals, and assets roll up into **Net Worth** — assets minus liabilities, with a trend line. Savings goals are counted as assets, so progress shows up in your real worth.

5. **Calm by design.** Forward-looking nudges ("On pace for ₹37,000 by month-end") instead of after-the-fact shame. Soft colors, a runtime accent system, light/dark. An AI that's *supportive, never preachy*.

---

## 4. The Features — In Detail

### 4.1 Dashboard — *money at a glance*

The home screen. Time-aware greeting ("Good evening, Sam"), then:

- **Budget hero card** — the big *Left to spend · this month* number, a progress bar (spent vs total), and two live chips:
  - **Days left** in the month.
  - **Status:** *On track* / *Off pace* / *Over budget*.
- **Pace projection** — a forward-looking, linear month-end estimate from your spend-so-far. Tells you *"On pace for ₹X by month-end"* or *"₹Y over — ease up to recover."* This is the app's signature "warn before, not after" moment.
- **Top spending strip** — a compact row of the biggest item spends this month.
- **Stat pair** — Net Worth (with % change) and Goals (top goal + progress) as tappable cards.
- **Quick Log** — log an expense against a category/item right from the dashboard, no navigation.
- A **crown badge** appears for Premium members.

New users see a friendly empty state prompting "Set up your budget."

### 4.2 Budget — *the core*

Monthly budgeting with a clean hierarchy: **Budget → Categories → Items → Transactions.**

- **Month navigation** — step forward/back, or jump via a month picker (a rolling window: 12 months back through 3 forward).
- **Summary card** — *Left to spend* (or *Over*), the editable **total budget** (tap to edit inline), a **% used** meter, and an *over-allocated / not-allocated-yet* hint so your category allocations stay honest against the total.
- **Categories** — each shows icon, name, spent-vs-allocated, and a colored progress bar that turns red when overspent. Tap a category to plan its **items** in detail.
- **Quick setup** —  the underlying budget row is created lazily on first save, so opening setup is instant.
- **Templates** — save the current month as a reusable template; apply it to future months; edit the template; or push a "drifted" (tweaked) month back into its template. A quiet amber dot flags when a linked month has drifted, with a tap-through to *Update / Edit / Save as new*.
- **Carry-forward** — a new empty month can inherit the previous month's structure (categories/allocations) with spend reset to zero. Auto-carry runs for the current month; peeked months get a one-tap "carry" action.
- **Log expense** — a quick-spend sheet (also reachable from the action dock) to record a spend against any item.
- **Deferred quiz plan** — if you built a budget in onboarding but tapped "keep it for later," it's waiting here to apply.

### 4.3 Debt — *liability tracker*

Track loans, EMIs, and money you've lent out.

- **Total outstanding hero** with an overall payoff progress bar and a *Paying down / Cleared* chip.
- **Three tabs:** Internal, External, and Closed debts.
- **Per-debt cards** — name, optional icon, interest-rate badge, **% paid off**, **monthly minimum**, and **remaining / total repayable**, each with a colored progress bar.
- **Interest models** — flat or diminishing; optional loan tenure (months) and total-repayable amount, so the payoff math reflects real EMI structures.
- **Payments** — a payment sheet logs a payment against any active debt; a payment-trend indicator shows momentum.
- **Lent out ("Out to friends")** — track money others owe *you*, separate from your own liabilities, with its own running total.
- **Close / reopen / delete** — mark a debt paid off (moves to Closed) or remove it (with a confirm guard).

### 4.4 Goals — *what you're saving toward*

- **Active vs Achieved** tabs. Each goal has an icon, target, current amount, and a **% complete** bar.
- **Quick Update** — pick a goal, type an amount, tap Update. Fast progress logging.
- **Mark Achieved** — celebrates the win, archives the goal, and **withdraws that amount from net worth** (since the money is now "spent" on its purpose). Linked budget items lose their link cleanly.
- Goals are **counted as assets** and surface in Net Worth, so saving progress shows up in your real worth — not a separate silo.

### 4.5 Net Worth — *the whole picture*

- **Total net worth** = assets − liabilities, shown big, with a **sparkline** trend and a *"▲ ₹X this month"* change chip.
- **Assets / Liabilities** stat pair.
- **Holdings donut** — visual split of where your worth sits.
- **Assets grouped by category** (e.g. Cash, Investments, Property), each row showing value and share of the group; add assets straight into a category.
- **Goals tab** — see goal-assets and their progress toward target alongside regular holdings.
- **Per-asset detail** — value, invested amount, category; goals show value / target.
- History **snapshots** power the trend line and month-over-month change.

### 4.6 SMS Auto-Tracking — *spends log themselves* (Android only)

The signature native feature. iOS can't read SMS, so this is Android-exclusive.

- Reads incoming **bank/UPI transaction SMS** and turns them into logged spends. Works **even when the app is closed** (a background receiver queues messages and posts a notification).
- **On-device parsing** — amount + merchant are extracted by on-device pattern matching. **No message ever leaves your phone** for parsing; there's no cloud AI in this path.
- **Learned merchant rules** — the first time you allocate a merchant (e.g. SWIGGY → Dining Out), AlloCat remembers. The next SWIGGY debit auto-logs silently.
- **Near-limit warning** — when an auto-logged spend pushes a category near its budget, you get a heads-up.
- **Privacy by construction** — only extracted fields (amount, normalized merchant, a hashed dedupe key) sync to the server. The **raw SMS body and sender stay on-device.** The app requests **only** `RECEIVE_SMS` — it never reads your existing inbox. Only debits are tracked; credits are ignored.
- **Review screen (`/sms`)** — pending (unmatched) spends wait here for a one-tap allocation, reachable directly or via the transaction notification.

### 4.7 Transactions (History) — *every spend in one place*

- A unified timeline of **all** spends — auto-captured from SMS *and* logged by hand — each tagged **SMS** or **Manual**.
- Grouped by day (Today / Yesterday / dated), newest first.
- **Filters:** search by name/merchant, filter by month, by budget item, and by source (All / SMS / Manual).
- Tap any row for detail: amount, item, category, date, time, and original amount (for currency-converted entries).

### 4.8 Monthly Report — *your spending, summarised*

- Month picker with a four-tile recap: **Spent, Budget, Allocated, Left/Over.**
- **By category** — allocation-vs-spend bars (spend bar turns red past 100%).
- **Top spends** — your five biggest merchant/label totals for the month.
- **Notes** — a free-text journal per month ("How did this month go?") saved with the report.

### 4.9 Ask AlloCat (AI) — *a cat that knows your money* (Premium)

- A chat that answers **only** from your real financial data — budget, spending, goals, debts, net worth. It never invents numbers.
- **Personality:** calm, observant, quietly witty, supportive, never judgmental. Answers are short and intentional (1–2 sentences), no lectures, no jargon, no emojis.
- **Topic-guarded:** off-topic questions (recipes, movies, code, medical, etc.) are politely deflected before any AI runs — *"I only help with your personal finances."*
- **Weekly insights (Android):** an optional AI summary each Sunday, delivered as a local notification even when the app is closed.
- Respects your chosen currency for every figure.

### 4.10 Activity Log — *audit trail*

A timeline of everything you've changed across the app, with formatted summaries. Your paper trail for "wait, when did that change?"

### 4.11 Profile & Settings

- **Identity card** — avatar (pickable), name, email, Verified chip, Premium crown.
- **Subscription** — plan status and upgrade entry point.
- **Tools** — quick links to Activity, SMS Transactions, Transaction History, and Monthly Report.
- **Preferences** — **Accent color** (lime default, plus tangerine, lemon, purple, blue) and **Currency** (multi-currency; not locked to one region).
- **Notifications** — toggle auto-allocate confirmations; **Weekly insights** (Android); and a **custom notification sound** picker (Android).
- **Helper** — guided tours on/off, and replay walkthroughs.
- **Support** — send feedback / report a bug, or email directly.
- **Legal** — privacy policy and account deletion (both reachable in-app, per store policy).
- **Theme** — light/dark toggle (also on the quick-action dock).
- Logout and **permanent account + data deletion** (clearly warned, irreversible).

### 4.12 Onboarding — *no forms, promise*

A swipeable teaching deck (Welcome → Budget → Grow → SMS → AI) with live mini-previews, ending in an invitation to the **budget quiz** — a ~60-second, tap-only flow that builds your first budget. You can also "explore first" and skip straight to the dashboard.

---

## 5. Cross-Cutting Product Qualities

- **Installable PWA** — add to home screen on iOS, Android, or desktop; works like a native app, service-worker cached.
- **Native Android app** — same experience plus SMS auto-tracking, local notifications with custom sounds, and in-app billing.
- **Multi-currency** — pick your currency; every figure follows it. Not hardcoded to one region.
- **Runtime theming** — five accent colors, light/dark, no-flash on load.
- **Haptics & motion** — tactile feedback and gentle animation throughout (respecting reduced-motion).
- **Guided tours** — per-section walkthroughs on first visit, replayable anytime.
- **Web Share Target** — share text (e.g. a receipt line) into AlloCat and it parses the spend.

---

## 6. Free vs Premium

**SMS auto-tracking — the core feature — is never gated.** Free covers a casual user comfortably; limits nudge committed users toward Premium.

| | Free | Premium (paid or in-trial) |
|---|---|---|
| SMS auto-tracking | ✅ Unlimited | ✅ Unlimited |
| Budget & manual logging | ✅ | ✅ |
| Goals | Up to **3** active | **Unlimited** |
| Assets (net worth) | Up to **5** | **Unlimited** |
| Debts | Up to **2** active | **Unlimited** |
| History (reports/activity) | Last **3 months** | **Full history** |
| Ask AlloCat (AI chat & insights) | — | ✅ |

- **Pricing:** ₹79 / month or ₹699 / year (~26% cheaper than paying monthly).
- **Trial:** an opt-in **40-day free** Premium trial (offered once).
- **Billing:** purchases happen in the **Android app**; on the web the paywall points you there.
- Hitting a limit opens a paywall explaining exactly why ("More goals need Premium") and offering the trial or a plan.

---

## 7. The Feel — Design Language

- **"Neo · Lime"** aesthetic: clean cards, rounded pills, a confident lime accent, generous whitespace.
- Distinct type system: a display face for headlines, a humanist sans for body, a mono for figures — numbers always feel precise.
- Mobile-first (a 480px phone frame) that expands to a comfortable desktop layout.
- Emotionally tuned: green means "on track," amber means "heads up," red is reserved for genuinely over — used sparingly so it still means something.

---

## 8. One-Sentence Summary

**AlloCat turns scattered money — budget, debt, goals, net worth, and every spend — into one calm picture, with bank-SMS spends that log themselves and a cat-like AI that answers from your real numbers.**

---

*Built by Octane Innovations · [allocat.xyz](https://allocat.xyz)*
