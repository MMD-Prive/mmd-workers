# Customer Identity Alignment V1 — 2026-09-11

Status: implementation contract

## Goal

Give Per one bounded read-only signal in Customer 360 showing whether the customer identity converges across:

1. the LINE identity verified through My MMD / LIFF,
2. the reviewed LINE OFC identity projection,
3. the Canonical Client record.

The operator-facing headline is:

`MY MMD / LIFF ↔ LINE OFC ↔ CANONICAL CLIENT`

## Authority

Identity Alignment is evidence only. It never grants or widens Membership, Tier, Points, package state, payment truth, private access, model access, coupon authority, or entitlement.

`my_mmd_entitlement_resolver_v1` remains the rights authority.

Candidate rows are not Members. A LINE OFC row is usable as verified alignment evidence only after the reviewed projection has `review_status=committed`, `decision=link_existing_client`, and a Canonical Client link.

## Server inputs

- Canonical Client: `Clients.line_user_id`.
- Reviewed LINE OFC: `LINE OFC Client Import Staging` identity projection (`tbl1u0foFBvgFpT9G`) with committed link to the Canonical Client.
- LIFF: `LIFF Renewal Sessions.line_user_id` plus the linked `Client` record. This identity originates from the server-verified LIFF session path, not a browser-provided LINE user ID.
- Existing LIFF Identity Resolution Audit may be shown as supporting evidence, but a tail match alone is not sufficient for `verified_match`.

The browser never receives the full LINE user IDs from Identity Alignment. It receives status plus the last six characters only.

## Status rules

- `verified_match`: Canonical Client has a valid LINE user ID, reviewed LINE OFC has the same LINE user ID, and a verified LIFF session with the same LINE user ID is linked to that Canonical Client.
- `mismatch`: a committed reviewed LINE OFC identity linked to the Canonical Client contains a different valid LINE user ID.
- `review_required`: some reviewed/LIFF/audit evidence exists but the three-way exact proof is incomplete.
- `insufficient_evidence`: Canonical Client identity or required evidence is not yet available.
- `unavailable`: the identity evidence source cannot be read safely. Fail closed.

## Customer 360

`/internal/admin/customer-data` owns the operator presentation. The existing authenticated Client Intelligence response is augmented server-side with `identity.alignment` and the response header `x-mmd-identity-alignment: read-only-v1`.

Customer 360 renders a dedicated Identity Alignment panel with three columns: `MY MMD / LIFF`, `LINE OFC`, and `CANONICAL CLIENT`. Full LINE user IDs are never rendered.

## Public / member entry

`/member/login` is an entry page, not an identity authority. Its primary action should open `/member/my-mmd`. My MMD decides whether the current browser needs the explicit LINE verification step. This avoids maintaining a second public login route that bypasses the canonical My MMD session gate.

## My MMD presentation

The My MMD Worker profile API already supplies the customer-safe signals `line_connected` and `match_state`. The Lovable presentation may display a compact `LINE connected` / `checking` state derived only from those backend fields. It must not compare LINE OFC or Canonical Client IDs in the browser and must never display raw LINE IDs.

## Airtable audit support

`MMD — LIFF Identity Resolution Audit` includes audit/display-only fields for Identity Match Status, OFC LINE User ID Tail, Match Checked At, and Match Basis. These fields are not entitlement inputs.
