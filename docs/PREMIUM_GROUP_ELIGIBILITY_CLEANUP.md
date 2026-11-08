# PREMIUM_GROUP_ELIGIBILITY_CLEANUP (#2141) — phase 1

Owner-only, read-only dry-run audit. Sends nothing, removes nothing, writes no entitlement truth.

- `GET /internal/admin/premium-group-cleanup/status` — flags and phase.
- `GET /internal/admin/premium-group-cleanup/preview` — expired-Premium members classified as
  `dry_run_candidate` / `review_required` (masked ids, capped at 100).
- Flags (wrangler vars): `PREMIUM_GROUP_ELIGIBILITY_CLEANUP_ENABLED=false`, `PREMIUM_GROUP_CLEANUP_DRY_RUN=true`.
- Not auto-handled (always `review_required`): VIP/SVIP/Black, blocked member, pending payment/renewal,
  owner grant/override, no single verified Telegram link, lookup failure.
- Telegram group presence is checked read-only via telegram-worker `POST /telegram/internal/member-presence` (getChatMember only): absent → ignored, present → candidate, privileged/unknown → review_required.
- Grace uses the shared resolver (currently 7 days; decided 14 — separate change).
- Later phases (warning, follow-up, owner-approved removal) are out of scope for this PR.

## Telegram ↔ customer identity candidates — source intake (2026-11-08)

A private Airtable **staging** table now holds owner-review-only identity *candidates*. The evidence currently comes from a LINE OA **chat export**, not the per-customer LINE OA **Notes**, and has not yet been reconciled against the canonical customer table.

### Guardrails

- Do not commit or attach the source CSV, customer names, chat-room references, phone numbers, emails, LINE IDs, Telegram names/handles/IDs, or raw note contents to GitHub, logs, CI artifacts, issues, PRs, or public sites. The repository is public.
- Source CSV column order must be exactly:
  `line_oa_customer_ref,telegram_display_name,telegram_username,telegram_user_id_numeric,line_id_handle,phone,email,nickname,note_date,telegram_missing,possible_duplicate,telegram_name_history`.
- `line_oa_customer_ref` and at least one of `line_id_handle`, `phone`, or `email` must exist. Empty Telegram fields are allowed if `telegram_missing=true`; preserve display-name spelling/emoji and earlier names exactly.
- Phone must remain a **string** including its leading zero (`0XXXXXXXXX`); Telegram numeric ID must remain a digit **string**, not a float. Never round-trip identity fields through a spreadsheet number parser.
- Normalize usernames to lowercase without a leading `@`; normalize emails to lowercase. Use the live customer's validated LINE OA Note as additional evidence; don't substitute the chat message date for `note_date`.
- Duplicate names, unidentified chat references, placeholder handles, and unknown/ambiguous matches are always `review_required`.
- All staged rows remain `pending_owner_review`. Do **not** automatically link to `Clients`, `Members`, or `MMD — Telegram Identity Binds`. Only an explicit owner confirmation can authorize a permanent Telegram ID ↔ customer bind.
- **No Telegram messages** and **no removals** at this phase, including warnings. Preserve `PREMIUM_GROUP_ELIGIBILITY_CLEANUP_ENABLED=false` and `PREMIUM_GROUP_CLEANUP_DRY_RUN=true` unless the owner separately approves a future phase.
- Do not infer entitlement solely from display name, username, phone, or email. Protected tiers, unresolved payments, overrides, and any identity ambiguity remain excluded from automated action.
- If hashes are later written to a canonical customer record for matching, use the agreed server-side keyed hashing/normalization design with a secret outside source control; never use a plain unsalted phone/email digest as proof of identity.

### Private intake checklist

1. Run `node scripts/validate-telegram-member-link-source.mjs /path/to/telegram-member-link-source.csv` **locally**; the validator displays only aggregate counts, never row contents.
2. Import into the private Airtable staging table with deterministic idempotency keys and `pending_owner_review`; keep original CSV in restricted storage, never in this repository.
3. Show candidate matches only in the authenticated owner console. Each suggested match needs manual confirmation, with provenance and duplicate flags visible to the owner.
4. Treat current dry-run preview as independent of the staging import until a separately reviewed, authorization-gated resolution path is connected; importing rows alone does **not** make the preview aware of them.

## Standard room review (same candidate source, no duplicate import)

The same private Telegram/customer candidate staging source is used for Standard and Premium **identity review**, because a Telegram account identity is independent of the room. The staging table has distinct manual presence-review columns:

- `standard_room_presence_review`
- `premium_room_presence_review`

Both start as `not_checked` for every candidate. Never assume that a LINE OA customer is already present in either Telegram room, and never copy a Premium membership result into a Standard presence decision or vice versa.

**Standard is not an expired-member cleanup queue.** The existing `admin-worker/src/premium-group-cleanup/rooms.js` policy explicitly permits all known membership tiers, including expired Standard/Premium members, to remain in Standard for announcements (reason: `expired_standard_may_stay`). Non-members, unclear identity, pending payments, and protected cases require owner review. A missing or expired membership is **not** permission to remove anyone automatically.

The multi-room owner-only audit endpoint (`GET /internal/admin/premium-group-cleanup/rooms`) and read-only Telegram member presence helper already support `standard`. This does not imply that source candidates have been matched to the canonical membership resolver or that Standard group membership has been enumerated. A bot cannot infer a complete membership roster from candidate chat exports. Owner-confirmed identity and actual room presence remain prerequisites to any later action.

No data is duplicated into a second Standard-only table, no automatic room assignment is performed, and all Standard/Premium checks remain `not_checked` until separately verified.
