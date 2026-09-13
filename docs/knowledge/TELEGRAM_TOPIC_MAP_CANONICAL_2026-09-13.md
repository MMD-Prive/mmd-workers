# MMD Telegram Topic Map — Canonical 2026-09-13

This file is the current production thread map for the MMD Privé Crew Telegram forum. Runtime aliases may remain for backwards compatibility, but their resolved values must match this map.

| Purpose | Canonical env | Thread |
| --- | --- | ---: |
| Booking Draft / Booking lifecycle | `TG_THREAD_BOOKING_DRAFT` | 1399 |
| Payments — Membership | `TG_THREAD_PAYMENTS_MEMBERSHIP` | 20 |
| Points | `TG_THREAD_POINTS` | 17 |
| Payments — Confirm / service money | `TG_THREAD_PAYMENTS_CONFIRM` | 22 |
| Alerts / exceptions | `TG_THREAD_ALERTS` | 9 |
| Applications — MMD Public Model + MMS Therapist | `TG_THREAD_PUBLIC_MODEL` | 155 |
| HIMAI Orders | `TG_THREAD_HIMAI_ORDERS` | 157 |
| HIMAI Payments | `TG_THREAD_HIMAI_PAYMENTS` | 158 |
| HIMAI Alerts | `TG_THREAD_HIMAI_ALERTS` | 159 |
| MMD Shop Orders | `TG_THREAD_MMD_SHOP_ORDERS` | 160 |
| MMD Shop Payments | `TG_THREAD_MMD_SHOP_PAYMENTS` | 161 |
| MMD Shop Alerts | `TG_THREAD_MMD_SHOP_ALERTS` | 162 |
| Legacy Archive | `TG_THREAD_LEGACY_ARCHIVE` | 134 |
| Rules — Model | `TG_THREAD_RULES_MODEL` | 39 |
| Rules — Customer | `TG_THREAD_RULES_CUSTOMER` | 29 |

## Compatibility aliases

Older workers may still read `TG_THREAD_MEMBERSHIP`, `TG_THREAD_PAYMENT`, `TG_THREAD_CONFIRM`, `TG_THREAD_SYSTEM_LOG`, or `TG_THREAD_BOOKING`. During migration they resolve to `20`, `22`, `22`, `134`, and `1399` respectively. New code should use the canonical names above.

## Routing rules

- Membership signup / renewal and clearly classified membership payment proof -> thread `20`.
- Deposit, balance, final payment, tips, and service-payment proof -> thread `22`.
- Exceptions, conflicts, mismatches, failures, recovery, or safety events -> thread `9` in addition to the owning business topic when applicable.
- Booking lifecycle -> thread `1399`.
- MMD Public Model and MMS Therapist applications share thread `155` while retaining distinct application types in the message body and backend records.
- Rules acknowledgements use dedicated threads `39` and `29`; they never fall back to payment topics.
- Historic `system` / `system_log` notifications route to Legacy Archive thread `134`. Thread `22` is exclusively Payments Confirm and must not be reused for System Log.
- Telegram remains notification/operations routing only. It does not create payment truth, entitlement, membership, points, booking truth, or access.
