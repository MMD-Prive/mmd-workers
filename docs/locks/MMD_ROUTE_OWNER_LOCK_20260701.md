# MMD Route Owner Lock - 2026-07-01

Status: locked after production repair.

## Incident Summary

`/sigil/pay/membership` was returning a `308` redirect to `/sigil/pay/renewal`.
The response identified `x-mmd-route-source: member-dashboard-chat-worker:sigil-pay-renewal`.

This was not caused by `member-pages-worker` source logic and was not caused by
`mmd-redirect-worker` source logic. The root cause was a wrong Cloudflare Worker
route binding that sent the membership payment route to `member-dashboard-chat-worker`.

## Deleted Route Bindings

The following Cloudflare Worker routes were deleted:

| Pattern | Route ID | Former owner |
| --- | --- | --- |
| `mmdbkk.com/sigil/pay/membership*` | `bc9521436bf74261a42d3bce97d25fa8` | `member-dashboard-chat-worker` |
| `www.mmdbkk.com/sigil/pay/membership*` | `372a30bf70da4f64bcb5de6a62e64501` | `member-dashboard-chat-worker` |

Do not recreate these bindings.

## Permanent Ownership

Membership payment routes:

- `/sigil/pay/membership`
- `/pay/membership`

Manual legacy renewal evidence routes:

- `/sigil/pay/renewal`
- `/pay/renewal`

`member-dashboard-chat-worker` may own only explicit manual renewal evidence
routes such as:

- `mmdbkk.com/pay/renewal*`
- `www.mmdbkk.com/pay/renewal*`
- `mmdbkk.com/sigil/pay/renewal*`
- `www.mmdbkk.com/sigil/pay/renewal*`

## Forbidden

- `member-dashboard-chat-worker` must not own `/sigil/pay/membership`.
- `/sigil/pay/membership` must never redirect to `/sigil/pay/renewal`.
- `/pay/membership` must never redirect to `/sigil/pay/renewal`.
- Unknown routes must never redirect to `/default`, `/autodirect`, or `/sigil/pay/renewal`.
- Do not add `/sigil/pay/membership` to any renewal worker or renewal route family.

## Live Verified Versions

- `member-pages-worker`: `20260701-disable-auto-renewal-routing`
- `mmd-redirect-worker`: `20260701-sigil-pay-membership-exact-safe`

## Final Smoke Checklist

- `/sigil/pay/membership`: safe, no redirect to renewal.
- `/sigil/pay/membership?code=TEST`: safe, query preserved/passed through.
- `/sigil/pay/membership?package=premium`: safe, query preserved/passed through.
- `/sigil/pay/membership?plan=standard`: safe, query preserved/passed through.
- `www.mmdbkk.com/sigil/pay/membership`: safe.
- `/pay/membership`: safe, served through `member-pages-worker`.
- `/sigil/pay/renewal`: manual legacy only, served by `member-dashboard-chat-worker`.
- `/pay/renewal`: manual legacy only, served by `member-dashboard-chat-worker`.
- `/unknown-test-route-mmd`: safe 404/recovery behavior, no renewal/default/autodirect redirect.
- LIFF `entry_route=renewal`: safe, normalizes to `membership_review`.
- LIFF `entry_route=pay_membership`: safe, routes to `/pay/membership`.

## Evidence

Redacted Worker route snapshot:

`/Users/Hiright_1/.mmd-secrets/codexmin-backups/mmd-route-lock-worker-routes-after-fix-20260701.json`

The snapshot asserts:

- no `mmdbkk.com/sigil/pay/membership*` route is assigned to `member-dashboard-chat-worker`;
- no `www.mmdbkk.com/sigil/pay/membership*` route is assigned to `member-dashboard-chat-worker`;
- `member-dashboard-chat-worker` pay routes are explicit renewal routes only;
- no global catch-all sends membership routes to `member-dashboard-chat-worker`.

## Remaining Audit Gap

Cloudflare Page Rules, Rulesets, and Bulk Redirect API checks returned `403` for
the current local OAuth token. A complete external redirect audit requires
read-only permissions equivalent to:

- Zone Rulesets Read
- Zone Page Rules Read
- Account Bulk Redirects Read

No Webflow, Memberstack, DNS, secrets, Airtable, or code changes were made for
the route-binding repair.
