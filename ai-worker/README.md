# MMD ai-worker — Kenji Intelligence Layer

`ai-worker` is the read-only reasoning layer behind Kenji.

## Architecture lock

- `member-dashboard-chat-worker` = LINE / LIFF interface and transport.
- `ai-worker` = retrieval, ranking, summarization, customer-context reasoning, and conversation decision support.
- `auth-worker` / My MMD Resolver and other domain workers = canonical truth and authorization.
- `ai-worker` never grants membership, entitlement, points, payment approval, booking confirmation, Telegram access, Drive access, or campaign benefits.

The canonical entitlement authority is `entitlement_snapshot.schema_version = my_mmd_entitlement_resolver_v1`.

## Kenji customer reasoning

Route: `POST /v1/ai/kenji/customer-reasoning`

Internal-auth only. Input must contain `actor` and a safe `customer_context` assembled from reviewed/canonical upstream data.

Reasoning order:

`Rename -> Hashtag/Tenure -> VIP/SVIP/Black Card history -> latest Premium/Lite/7 Days cycle -> latest signup/renewal -> expiry -> Resolver rights -> conversation strategy -> reactivation CTA`

Rules:

- Rename is the primary human-facing identity reference. Email, phone, LINE user ID, legal name, and other identifiers are matching evidence only.
- Hashtags are historical/tenure evidence. They do not grant access.
- VIP/SVIP/Black Card recognition is a separate axis from the underlying Premium/Lite/7 Days package/base.
- A Per-assigned Rename containing `Blackcard` is historical paid-Black-Card context for customer handling. It does not prove current active entitlement.
- Current rights are projected only from a valid My MMD Resolver snapshot.
- Missing/invalid Resolver snapshot, blocked member state, or unresolved Rename fails closed and routes to review.
- Returning expired customers should be addressed with awareness of history/tenure rather than as brand-new leads.

## Existing routes

- `GET /ping`
- `POST /v1/ai/search`
- `POST /v1/ai/answer`
- `POST /v1/ai/member-context`
- `POST /v1/ai/recommend`
- `POST /v1/ai/kenji/customer-reasoning`

Search/member-context compatibility routes no longer return demo Airtable or Memberstack truth. They require explicit canonical upstream configuration and fail closed with `503 UPSTREAM_UNAVAILABLE` otherwise.

## Required secrets / vars

- `INTERNAL_TOKEN` — caller authentication for ai-worker routes.
- `AI_CANONICAL_UPSTREAM_TOKEN` — separate service credential for configured canonical read upstreams.
- `AI_SEARCH_UPSTREAM_URL` — optional canonical search endpoint.
- `AI_MEMBER_CONTEXT_UPSTREAM_URL` — optional canonical member-context endpoint.

Do not point these vars at browser/public endpoints. No secrets belong in source control.

## Tests

```sh
npm test --prefix ai-worker
```

The Phase 1 resurrection is intentionally not a production deployment. Wire a canonical upstream, review contracts, run CI, then separately approve deployment.
