# MY MMD Historical Client Identity / Email Recovery V2

Effective clarification: 2026-09-20  
Owner: Per  
Authority boundary: identity recovery only

## Canonical rule

A customer who already exists in MMD's historical `#client` population must not be asked to reconstruct identity data that MMD already holds.

The default MY MMD recovery order is:

1. Verify LINE identity server-side from the LIFF session.
2. Resolve the exact Canonical Client by `Clients.line_user_id`.
3. Read existing canonical email from `Clients.Contact Email` / `Clients.email`.
4. If canonical email is absent, resolve existing trusted historical identity evidence already stored in Airtable.
5. If one unique historical email / identity is resolved, continue recovery without asking the customer to type that old email again.
6. Ambiguous, conflicting, blocked, or invalid evidence fails closed to `review_required`.
7. Old-email / Member-ID input is a last-resort fallback only after automatic trusted resolution is exhausted.

## Historical evidence order

Automatic lookup may use only server-side evidence tied to the verified LINE identity:

- trusted LINE → email resolver in auth-worker;
- Canonical Client exact `line_user_id`;
- LINE OFC Client Import Staging exact `line_user_id` with historical `#client` tag and one unique valid `email_candidate`;
- Pre-Session / Identity Seed exact `line_user_id` with one unique `identity_email`;
- committed Email Identity Staging tied to the same exact LINE candidate and exactly one Canonical Client;
- approved, exactly-linked Client Access Evidence where applicable.

Blocked / ignored / rejected evidence is not promoted.

## Authority boundary

Email/contact/history evidence proves or supports identity only. It does not create or infer:

- membership
- tier/package
- points
- payment truth
- entitlement
- Private / model visibility
- booking or Job truth

Current rights must be re-read from `my_mmd_entitlement_resolver_v1` after the canonical identity link is approved.

Browser-provided LINE IDs, tier, points, payment state, entitlement, private access, or similar identity/rights claims remain rejected.

## API behavior

`POST /member/api/liff/recovery` now treats an empty manual claim as an automatic-recovery request:

- verified LINE + unique trusted historical email → continue existing merge/recovery flow with `recovery_mode=automatic_historical_email`;
- verified LINE + conflicting trusted evidence → `review_required`;
- verified LINE + no trusted historical evidence → `manual_recovery_required`;
- only `manual_recovery_required` should surface old-email / Member-ID input to the customer.

No automatic recovery branch grants rights.

## Airtable sources

- `Clients`
- `LINE OFC Client Import Staging`
- `Email Identity Staging`
- `Client Access Evidence`
- `MMD — Pre-Session Client Index`
- `MMD — Identity Merge Requests`

The historical `#client` tag identifies the pre-existing customer population for this recovery policy; it is not an entitlement or membership grant.

## Presentation rule

Webflow / MY MMD must tell the customer that MMD checks existing records first. Do not present “enter your old email” as the default identity step.

Manual data entry is an exception path for unresolved evidence.

## Acceptance

- exact Canonical Client email resolves from verified LINE without customer re-entry;
- exact historical `#client` email resolves from verified LINE without customer re-entry;
- exact Pre-Session / Identity Seed email resolves without customer re-entry;
- committed Email Identity Staging can support recovery only when tied to one Client;
- conflicting emails fail closed;
- non-`#client` LINE rows are not promoted through the `#client` historical path;
- unresolved identity reaches manual recovery, not new-member creation;
- no identity evidence mutates rights;
- approved identity link is followed by `my_mmd_entitlement_resolver_v1`.

## Related implementation

- GitHub issue #696
- `member-pages-worker/src/member-email-recovery.js`
- `member-pages-worker/src/drive-member-bootstrap.js`
- `auth-worker/src/runtime-index.js` trusted LINE → email resolver
- `scripts/line-official-legacy/canonical-identity-batch-commit.js`
