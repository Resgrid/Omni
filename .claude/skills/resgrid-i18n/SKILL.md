---
name: resgrid-i18n
description: Translation rules for Resgrid Omni — every user-visible string through t(), ten languages kept in key parity, the common namespace plus per-variant namespaces, department terminology overrides, product names via interpolation, and how to add or change keys. Use whenever adding or editing UI text, translation JSON, labels that a department can rename, or language detection.
---

# i18n in Omni

## Hard rules

- Every user-visible string goes through `t()` (or `useTranslation`). No literals in JSX, toasts, alerts, notifications or accessibility labels.
- Ten languages, always in key parity: `en, ar, de, el, es, fr, it, pl, sv, uk`. `ar` is RTL. Adding a key means adding it to all ten files in the same change (English text as a clearly marked placeholder is better than a missing key; CI fails on missing keys).
- Product names are interpolated, never hardcoded: `t('login.title_app', { appName })`.
- Department-renameable words (calls, units, personnel, shifts, record types, modules…) come from the terminology store (`useTerm(TermKeys.X)`, v4 `Config/GetTerminology`), not from translations alone. Use the term in labels where the department's word should appear.

## Namespaces

- `common` — strings used by several variants (login, settings, MFA, calls, statuses, errors, buttons).
- `responder`, `unit`, `ic`, `dispatch`, `bigboard` — strings only one app shows.
- `fallbackNS: 'common'`, so a flat key such as `t('calls.title')` resolves from the variant namespace first, then `common`.
- Only English is bundled; the other nine languages load on demand (`resources/<ns>.ts` loaders, a separate chunk per language and namespace in the web export). `initI18n` stays synchronous and shows English until `loadLanguage()` resolves; `setLanguage()` and the shell's startup wait for it. Never import a non-English JSON file statically.
- Put a new key in `common` unless it is only meaningful in one app's signature module.

## Reconciling legacy translations

The legacy repos disagree: 71 keys have different English text across apps and 2,355 key/language pairs differ where English matches. When porting a key:

1. Prefer the wording already used by the most apps; for conflicts, take the most recently changed translation (git blame) and note the choice in the review CSV.
2. Merge duplicate namespaces into one: `weatherAlerts` + `weather_alerts` → `weather_alerts`; `videoFeeds` + `video_feeds` → `video_feeds`; `poi` + `pois` → `pois`.
3. Remove scaffold leftovers (e.g. "Welcome to obytes app site").

## Language detection

Iterate all device locales and pick the first supported one (Unit/IC approach); fall back to `en`. Clear the memoized `translate` cache on language change. Language and theme are device preferences: they survive logout.

## Checks

- Translation lint (key order, identity) and key-parity check run in CI.
- AI-written translations need native-speaker review before they are considered final, especially push/SMS/voice text.
