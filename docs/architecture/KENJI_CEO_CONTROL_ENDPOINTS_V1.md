# Kenji CEO Control Endpoint Contract

Status: Ready for merge review
Owner: admin-worker
Surface: Webflow `/internal/ceo/kenji-control`

These endpoints are authenticated, read-only projections for the CEO control surface. Webflow never calls Airtable directly, and the browser is never the authority for membership, access, approval, or model state.

## Endpoints

- `GET /v1/admin/kenji/control/memory?client_id=...`
  - Requires one of `client_id`, `member_id`, `line_user_id`, or `email`.
  - Resolves the canonical Client first, then reads a bounded membership/access snapshot from `MMD — Member Entitlements` when a trusted identity join is available.
  - Returns customer memory fields needed for internal control only: display name, client status, verification, membership/access status, tier/package, renewal timing, and confirmed points snapshot.
  - Does not return phone, email, raw LINE ID, internal notes, sensitive information, payment evidence, or credentials.

- `GET /v1/admin/kenji/control/conversations?client_id=...`
  - Resolves the Client and queries `SIGIL — AI Message Events` using canonical identity signals.
  - Returns at most 25 operational event projections: timestamp, channel, source path, detected intent, risk level, response mode, handoff state/reason, final status, and linked session reference.
  - Does not return `user_message`, `generated_reply`, `payload_json`, contact values, raw LINE identifiers, or credentials.

- `GET /v1/admin/kenji/control/approvals?status=pending`
  - Returns at most 25 bounded approval projections combined from `MMD — Console Inbox` and `MMD — Model Review Requests`.
  - `status=all` returns the bounded combined queue.
  - Does not return admin notes, payload JSON, contact data, model rates, or private decision details.

## Canonical Airtable sources

- Clients: `tblVv58TCbwh5j1fS`
- Members: `tblgWc5VRon5o8Mhk`
- MMD — Member Entitlements: `tblNImdF9PKAxhXGi`
- SIGIL — AI Message Events: `tbljCYfYqfm8gBTPq`
- MMD — Console Inbox: `tblFHmfpB2TTrzO2e`
- MMD — Model Review Requests: `tblJ52hVu0f4uhEmS`

The Worker requests only allowlisted fields for list queries. These projections do not make Airtable records public and do not change source-of-truth ownership.

## Authentication

The routes are under `/v1/admin/` and pass through the credential-bound admin gate.

- Browser requests use the signed `mmd_admin_gate_v1` session cookie.
- Service requests may use a bearer matching `INTERNAL_TOKEN` or `ADMIN_BEARER`.
- Service requests may alternatively use `X-Confirm-Key` matching `CONFIRM_KEY`.
- Arbitrary `Authorization` or `X-Confirm-Key` headers must fail closed.
- Service credentials receive reviewer-level actor context; these GET endpoints still expose no mutation.

## Safety and authority

- GET-only.
- No Airtable write.
- No approval mutation.
- No customer message send.
- No membership/access mutation.
- No raw conversation body.
- No unbounded customer listing.
- No private model pricing or availability.
- No automatic approval or publication.

## Failure behavior

- Missing required identity: HTTP 400 `query_required`.
- Invalid or absent admin/service authentication: HTTP 401 `unauthorized`.
- Missing Airtable configuration: HTTP 503 `airtable_config_missing`.
- Upstream/table/schema unavailable: HTTP 503 `endpoint_unavailable`.
- No matching data: HTTP 200 with `data_status=empty`.

## UI integration boundary

The Webflow CEO control UI may call these endpoints using same-origin requests with `credentials: "same-origin"`. Approval actions, takeover, kill switch, customer-message mutation, and any production write remain separate contracts and are not enabled by this read-only slice.
