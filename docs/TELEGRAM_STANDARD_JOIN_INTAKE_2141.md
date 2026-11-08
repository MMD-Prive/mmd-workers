# STANDARD Telegram Join Intake — Owner-only #2141

## Scope

This is a separate, **read-only review lane** for Telegram `chat_join_request` events in **MMD PRIVÉ : STANDARD**. It is **not** a membership-entitlement resolver, historical roster importer, or automatic approval/removal feature.

Existing Premium join behavior is unchanged. Standard policy remains: established members of all tiers may stay even after membership expiry for announcements. Unknown identity is `review_required`, never a reason to remove automatically.

## Where data goes

Telegram webhook (bot must be group Admin with relevant join-request rights) → `telegram-worker` → existing `HYPE_OPERATIONS` private service binding → `admin-worker.internal/__internal/telegram-standard-join-intake` → **private** Airtable table `MMD — Telegram Standard Join Intake` (table ID is configured in Admin Wrangler).

Stored **only**: room, Telegram numeric ID **as text**, Telegram username, display name, request timestamp, minimal provenance, owner review status. Never store bio, user_chat_id, chat histories, phone, email, maps, payment, or membership truth in this intake.

- Stable key: `standard:<telegram_user_id>` with Airtable upsert and read-before-write; owner review status is not overwritten when the same request is re-delivered.
- Source candidates: existing `MMD — Telegram Member Link Source Staging`, collected from an **unverified LINE OA chat export**, **not** directly from LINE OA Notes.
- Candidate ranking: exact numeric Telegram ID > exact normalized username > exact normalized display name. All results are **suggestions**. Display-name matches are weak and never authorize identity linking.
- Airtable credentials remain in Cloudflare secrets. No raw rows or identifiers in GitHub, CI, Slack, logs, or public app payloads.
- Internal endpoint requires private service-binding hostname and caller. Production capture is off by default using `TELEGRAM_STANDARD_JOIN_CAPTURE_ENABLED = "false"`.

## Owner view

Authenticated Owner opens `/internal/admin/premium-group-cleanup/preview` for the multi-room audit and the new Standard Join Requests panel. The panel calls owner-protected `GET /internal/admin/premium-group-cleanup/join-requests`. No write buttons are provided: review candidates in LINE OA + Airtable before any verified Telegram bind is created via the existing secured identity-binding authority.

It does **not** discover existing members of a group in bulk. Telegram Bot API's `getChatMember` checks one known numeric ID at a time. Old group members without prior confirmed numeric IDs still need explicit identity linking or authorized historical evidence.

## Deployment acceptance / controls

1. Review and pass `.github/workflows/standard-join-intake-safety.yml`. It runs tests only; no production secrets or deployment.
2. Confirm bot is an administrator in Standard with permissions needed to receive `chat_join_request` updates, the existing canonical webhook is configured with `chat_join_request` allowed, and Admin service binding `HYPE_OPERATIONS` resolves.
3. Merge and deploy by separate approval. Start with the flag **off** and check Owner page shows an empty / existing safe queue (never claim complete roster coverage).
4. After explicit owner approval, turn **only** `TELEGRAM_STANDARD_JOIN_CAPTURE_ENABLED` on in Admin Worker and test with an authorized, controlled Standard join request. Verify Airtable record count and owner-only UI match suggestions. Do not change any Premium cleanup/removal flag.
5. Verify all `join-requests` endpoints deny public/non-Owner access, redaction of phone/email, no Telegram `sendMessage`, `approveChatJoinRequest`, `declineChatJoinRequest`, `banChatMember`, or `kickChatMember` from Standard observation.
6. To rollback: return `TELEGRAM_STANDARD_JOIN_CAPTURE_ENABLED` to `false`. Existing owner-reviewed staging records remain private and should be managed using retention policy.

**No automated Telegram messages, joins, removals, or canonical entitlement writes are part of this PR.** All existing join requests remain pending until handled by the Owner through a separately approved process.
