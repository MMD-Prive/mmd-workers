# PREMIUM_GROUP_ELIGIBILITY_CLEANUP (#2141) — phase 1

Owner-only, read-only dry-run audit. Sends nothing, removes nothing, writes no entitlement truth.

- `GET /internal/admin/premium-group-cleanup/status` — flags and phase.
- `GET /internal/admin/premium-group-cleanup/preview` — expired-Premium members classified as
  `dry_run_candidate` / `review_required` (masked ids, capped at 100).
- Flags (wrangler vars): `PREMIUM_GROUP_ELIGIBILITY_CLEANUP_ENABLED=false`, `PREMIUM_GROUP_CLEANUP_DRY_RUN=true`.
- Not auto-handled (always `review_required`): VIP/SVIP/Black, blocked member, pending payment/renewal,
  owner grant/override, no single verified Telegram link, lookup failure.
- Telegram group presence is NOT checked here (piece B: read-only getChatMember endpoint in telegram-worker).
- Grace uses the shared resolver (currently 7 days; decided 14 — separate change).
- Later phases (warning, follow-up, owner-approved removal) are out of scope for this PR.
