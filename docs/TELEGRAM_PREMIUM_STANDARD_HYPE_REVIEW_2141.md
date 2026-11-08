# HYPE · Telegram Premium + Standard (Issue #2141)

## Owner goal

Show Premium and Standard **together** in the authenticated Telegram Rooms owner console. HYPE can read verified canonical MMD membership for a numeric Telegram user ID; it can also suggest potential LINE OA chat-export matches. Neither usernames nor display names are proof of canonical identity.

This is an **incremental evidence intake**, not a complete historical group roster. The Telegram Bot API cannot enumerate every old member. Known, verified numeric IDs may be checked per room by `getChatMember`; never present 0 intake rows as 0 Telegram members.

## Production destinations and limits

- Standard join evidence stays private in Airtable `MMD — Telegram Standard Join Intake` (`tblGFkPcMFsxsW5Ul`).
- Premium join evidence stays private in Airtable `MMD — Telegram Premium Join Intake` (`tblQVya3rvb1CpRrB`).
- Both queues can suggest possible names from `MMD — Telegram Member Link Source Staging` (`tblCVwWXwyEhU2AEN`), which was created from LINE OA chat-export text, **not** verified LINE OA customer notes.
- Telegram Worker uses only the private `HYPE_OPERATIONS` service binding. Admin Worker receives the new Premium intake through `/__internal/telegram-group-join-intake`, preserving the deployed Standard legacy endpoint `/__internal/telegram-standard-join-intake`. Public/non-Telegram callers are rejected.
- Owner-only read-only `GET /internal/admin/premium-group-cleanup/join-requests` returns both queues, grouped by room and with masked numeric IDs, plus HYPE's verification hint, recorded Premium decision, and up to three **unverified** possible LINE OA matches.
- `PREMIUM_GROUP_ELIGIBILITY_CLEANUP_ENABLED=false` and `PREMIUM_GROUP_CLEANUP_DRY_RUN=true` remain unchanged. No automatic removals, entitlement writes, or canonical identity binds are introduced.

## Important Premium behavior

The pre-existing Premium join handler **already** auto-approves requests for **active, canonically verified Premium** users and sends its existing owner alert for ambiguous/non-entitled requests. This change **does not** enable a second approval path. It records that existing result as `approved_by_existing_handler`, `pending_owner_review`, `approval_failed`, or `unknown`, but the evidence observer itself never approves, rejects, messages, or removes anyone.

Standard continues to collect join-request evidence only. Standard's existing policy permits established members, including expired members, to remain for general announcements. HYPE must never use expired Standard status as an eviction reason.

## Activation and rollback

1. Create two separated private Airtable staging tables (already done); no customer data is committed to this public repository.
2. Run `.github/workflows/standard-join-intake-safety.yml` and confirm Premium legacy behavior + both-room owner guard regressions.
3. Deploy Telegram Worker only through its existing approved GitHub workflow. Do not send test events to customer rooms.
4. Admin deployment requires a new owner-reviewed approval for the **exact current main SHA** and the `mmd-admin-worker-solo-mutation` environment. Do not bypass existing review/protection. The scope is the whole deployment SHA, not only #2141.
5. After Admin and Telegram Workers are verified, enable **only** `TELEGRAM_PREMIUM_JOIN_CAPTURE_ENABLED=true` by Cloudflare settings when expressly authorized. Standard already has `TELEGRAM_STANDARD_JOIN_CAPTURE_ENABLED=true`; Wrangler config reflects this to avoid accidental rollback.
6. Confirm secure Owner-only page shows both room names; check staging counts, existing Premium join outcome, HYPE status, and absence of phone/email or full Telegram numeric IDs in API output. Keep all removal/warning flags off.
7. If new Premium capture malfunctions, set only `TELEGRAM_PREMIUM_JOIN_CAPTURE_ENABLED=false`. Keep Standard on and preserve pre-existing Premium join behavior. Never reset unrelated secrets/bindings.

No existing Telegram member is revalidated from name alone. Neither staging table stores a confirmed group roster. Permanent Telegram↔customer binding remains a separate, owner-authorized process.
