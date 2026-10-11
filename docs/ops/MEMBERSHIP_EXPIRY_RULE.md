# Membership Expiry Rule

Decided 2026-10-11.

## Rule
A membership expires **the day before the signup anniversary** and is **valid through the end of that day (Bangkok time, ICT)**.

Example: signup 30 Jan 2027 + 2 years -> valid through end of 29 Jan 2029.

LINE OFC customer names carry the signup date plus "x N" years, e.g. `เบน 30 มค 70 x 2` (70 = Buddhist year 2570 = 2027).

## Stored values
Three stamp conventions exist in Member Entitlements `expire_at`:

| Stamp | Example | Meaning |
|---|---|---|
| End-of-day ICT | `2029-01-29T16:59:59.999Z` | last valid day = 2029-01-29 |
| 00:00 ICT next day | `2029-01-29T17:00:00Z` | last valid day = 2029-01-29 |
| Date-only / legacy 00:00Z | `2029-01-29` | last valid day = 2029-01-29 |

Taking the UTC date slice (`safeCalendarDate` in `my-mmd-canonical-entitlement-bridge.js`) yields the last valid day for all three.

**New writes:** use end-of-day ICT (`...T16:59:59.999Z`); the Members `Membership Expiry` date field holds the last valid day.

## Client contract
MY MMD (`liff-member-shell.js`) accepts `YYYY-MM-DD` only (`safeDate`). Servers must send the last valid day as a date-only string.

## Pitfall: template-literal backslashes
The LIFF page script is inside a JS template literal. Regex escapes must be doubled (`\\d`), otherwise the backslash is dropped (`/^d{4}.../`) and every date renders as INVALID. Guarded by `member-pages-worker/test/liff-member-shell-safe-date.test.mjs`.

## CARE BACK extension
The +1 year extension counts from the existing last valid day.
