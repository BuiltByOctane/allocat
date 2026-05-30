# Multi-currency support — display-only

Approved 2026-05-28.

## Goal

Let any user pick a currency at Profile → Preferences. All numeric amounts display in the chosen currency. No FX conversion. Numbers stored in DB stay as-is.

## Decisions

- **Conversion model**: Display-only relabel. ₹1000 becomes $1000 after switch. No FX rates.
- **Storage**: `profiles.currency` column. Syncs across devices via existing hydration. Default `'INR'`.
- **Catalog**: Curated 15 currencies. ISO 4217 code + paired locale.
- **Locale pairing**: Each currency carries its own locale (INR→en-IN lakh/crore, USD→en-US thousands, etc.).
- **Activity logs**: Pragmatic interpretation of "render-time format" — store `amount` + `currency` in `metadata`; render layer uses `CurrencyText` (which reads provider currency) for metadata amounts. Pre-baked `title`/`description` strings are kept as-is (frozen at write time using user's *current* currency via the currency-aware `fmt()`). Old logs from pre-feature stay in INR.

## Files

### New
- `docs/migrations/2026-05-28-profiles-currency.sql`
- `lib/currency/catalog.ts` — currency list + types
- `lib/providers/CurrencyProvider.tsx` — provides current code+locale
- `lib/hooks/useFormatCurrency.ts` — memoised formatter bound to provider
- `lib/hooks/useUpdateCurrency.ts` — mutation hook
- `components/profile/CurrencySelector.tsx` — UI control

### Edit
- `lib/db/AllocatDB.ts` — version 7 noop stores bump (column non-indexed)
- `lib/types/database.ts` — add `currency` to profiles Row/Insert/Update
- `lib/number-format.ts` — accept `code` + `locale` params; multi-key cache
- `components/ui/CurrencyText.tsx` — pull code+locale from provider via hook
- `app/(app)/layout.tsx` — wrap CurrencyProvider inside SyncProvider
- `components/profile/ProfilePage.tsx` — slot CurrencySelector in Preferences
- `lib/server/activity-logger.ts` — `fmt(value, code)` accepts code; helper `getUserCurrency(supabase, userId)`
- `lib/actions/budget.ts`, `lib/actions/debt.ts`, `lib/actions/net-worth.ts`, `lib/actions/asset-history.ts`, `lib/actions/ai-chat.ts` — fetch user currency once per action, pass to `fmt`
- `lib/budget-templates.ts`, `lib/tour/mockData.ts`, `lib/hooks/useActivityLogs.ts`, `lib/ai/parseSpend.ts`, `app/api/ai/chat/route.ts` — currency-aware where applicable

## Architecture

```
Profile.currency  ──hydrate──▶ IDB.profiles  ──useProfile──▶ CurrencyProvider
                                                                   │
                                       ┌───────────────────────────┴──┐
                                       ▼                              ▼
                              useFormatCurrency()              CurrencyText
                                       │                              │
                                       ▼                              ▼
                              components use it            metadata amounts render live
```

Server actions read `profile.currency` synchronously when logging activity. New entries reflect current currency; existing entries unchanged.

## Out of scope
- Per-record currency tagging
- Exchange-rate conversion
- Bulk re-format of historical activity log strings

## Rollback
Drop column on Supabase, decrement Dexie version, revert files. Stored numeric data unaffected.
