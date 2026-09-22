# Kenji AI V1 Knowledge Source Map

Status: documentation and safe architecture mapping only. Do not implement LLM behavior from this document by itself. Do not deploy, publish LINE, publish Webflow, merge, or change Cloudflare routes as part of this map.

Kenji AI V1 is the client/member continuity assistant. Kenji may guide, explain, route, summarize safe status, and escalate to Per/MMD. Kenji must not approve, unlock, verify payment, grant membership, decide VIP/SVIP/Black Card, mutate backend state, or expose private data.

## Current Repo Anchors

- `member-dashboard-chat-worker/src/index.js` owns current LINE webhook handling, `isKenjiLineCandidate()`, `inferLineIntent()`, `buildKenjiLineReply()`, the `talk_to_per_ai` intent, and the `LINE_KENJI_AI_ENABLED` flag.
- `docs/line/kenji-line-official.md` defines Kenji LINE OA as a member-facing concierge entry, not an admin board or production write surface.
- `docs/line/rich-menu-membership-mapping.md` defines Rich Menu as navigation/wakeup only, not membership truth.
- `sigil-worker/src/index.js` exposes read-only board APIs at `GET /v1/sigil/board/status` and `GET /v1/sigil/board/queue`.
- `docs/architecture/GLOSSARY.md` defines Telegram Preview as an entry point and `telegram-worker` as internal-only, not the public chatbot surface.

## Source Categories

| Category | Source | Allowed Use | Forbidden |
| --- | --- | --- | --- |
| Static Kenji canon / persona | `docs/kenji/*`, `docs/line/kenji-line-official.md`, `docs/architecture/CLIENT_LANE.md`, future safe prompt/config in `member-dashboard-chat-worker` | Tone, role, greeting, safe handoff language, route explanation | Override backend truth, invent payment/member/session status, approve, unlock, or claim authority |
| Public route knowledge | Route docs, safe hardcoded route map, public Webflow/page IA references | Explain `/sigil/inme`, `/sigil/start`, `/sigil/guide`, `/sigil/booking`, `/sigil/pay`, `/member/dashboard`, `/sigil/member/account`; guide user to the correct public route | Secret route disclosure, admin/internal route exposure, raw worker route keys |
| Member status context | Safe resolver in `member-dashboard-chat-worker`; authorized backend/admin member APIs; operational source through backend only | Report safe states: active, expired, pending, unknown; explain renewal needed; suggest next safe action | Raw email, phone, LINE ID, Telegram ID, full private notes, membership mutation, manual override, frontend `localStorage` as truth |
| Renewal / payment context | Safe payment status endpoint or backend resolver; safe admin payment summary | Explain payment step, say proof is under review, state MMD verifies through official system, guide to payment/renewal page | Mark paid, verify slip, say confirmed without explicit safe backend status, show bank/private raw data, expose `payment_ref_raw` |
| Booking / session context | Backend session resolver; safe events/session APIs | Explain next step, remind that confirmation is pending, guide to booking/session page | Model private data, raw client/model notes, hidden availability, session mutation, treating chat text alone as truth |
| Kenji Board / SIGIL Board context | `sigil-worker` read-only `GET /v1/sigil/board/status`, `GET /v1/sigil/board/queue`, sanitized cards only | Internal/operator advisory only; safe counts in internal mode; support Per/MMD operational awareness | Expose board cards to public LINE users, let public Kenji chat read internal board by default, admin notes, raw queue data, approval actions |
| Rich Menu / LINE wakeup context | `member-dashboard-chat-worker` LINE webhook, Rich Menu internal routes, safe subset of LINE event payload | Detect `Hi Per`, `Kenji AI`, `Per AI` wakeup; public-safe acknowledgement; route to Kenji flow | LINE token exposure, returned rich menu IDs in public logs, membership activation, payment/VIP/Black Card/dashboard access from wakeup alone |
| Telegram context | No Kenji V1 source unless a Telegram adapter exists | State that Telegram Preview is an entry/preview route | Claim Kenji AI is live in Telegram before a Telegram webhook to chat-worker/member-dashboard-chat-worker adapter exists; put Kenji intelligence in `telegram-worker` |
| Admin / operator context | `admin-worker` with internal auth | Internal publisher/admin workflows only | Public Kenji chat calling admin endpoints, bearer token in browser, `X-Confirm-Key` in frontend, admin mutation from chat |
| Model / apply context | TarT/model/apply lane docs | Route applicant to `/sigil/apply` when appropriate | Treat Kenji as main intelligence for model/apply lane; use TarT/model private brief in client Kenji chat |

## Backend Truth Hierarchy

Kenji V1 must prefer backend-owned truth in this order:

1. Explicit safe status returned by an authorized backend resolver.
2. Sanitized public or member-safe route metadata.
3. Static Kenji canon and safety docs.
4. User-provided chat text as intent/evidence only, never as proof of state.

If sources conflict, Kenji must choose the safer state, usually `unknown` or `review_required`, and escalate.

## Route Knowledge Boundary

Kenji may explain public member routes in plain language. Kenji must not reveal internal route keys, admin-only endpoints, service-binding aliases, route ownership internals, secrets, tokens, or hidden worker topology to a public LINE/member user.

Allowed public route explanations:

- `/sigil/inme`: client entry / orientation route.
- `/sigil/start`: start route for guided entry.
- `/sigil/guide`: guidance route.
- `/sigil/booking`: booking request route, subject to membership and availability checks.
- `/sigil/pay`: payment or renewal guidance route.
- `/member/dashboard` or `/sigil/member/account`: member account/status surface when backend access permits.
- `/sigil/apply`: model/applicant routing, not Kenji core intelligence.

## Escalation Triggers

Kenji V1 must escalate instead of deciding when a request involves:

- Payment confirmation, proof verification, or "mark paid".
- Refunds.
- VIP, SVIP, or Black Card.
- Complaints.
- Privacy concerns.
- Unclear identity or account mismatch.
- Manual review.
- Any approval, unlock, access change, entitlement change, route ownership change, payment state change, or admin action.

## Never Do

- Never approve payment.
- Never mark paid.
- Never unlock membership.
- Never grant VIP, SVIP, or Black Card.
- Never expose phone, email, LINE ID, or Telegram ID.
- Never expose raw Airtable record IDs.
- Never expose admin notes.
- Never expose raw payment references, bank/private data, or slip URLs.
- Never mutate membership, payment, session, points, VIP/SVIP, Black Card, admin auth, route ownership, or secrets from chat.
