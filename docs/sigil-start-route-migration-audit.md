# SIGIL Start Route Migration Audit

Last updated: 2026-06-23

> Superseded membership-route note (2026-08-01): `/sigil/member/membership` is now the canonical membership gate. References below to `/member/membership` describe the historical route; that path is retained only as a query-preserving `301` compatibility alias.

Canonical rule: `/trust/inme` is legacy. The canonical SIGIL entry gate is
`/sigil/start`.

This audit covers the front-gate behavior in `mmd-redirect-worker` plus the
owned downstream routes that must keep working while legacy Trust/Inme entry
aliases move toward `/sigil/start`.

## Route Ownership Table

| Route | Current owner | Target owner | Query preservation | Behavior | Expected production headers |
| --- | --- | --- | --- | --- | --- |
| `/trust/inme` | `mmd-redirect-worker` redirect guard, then generic site pass-through when canonical | `mmd-redirect-worker` redirect guard to `/sigil/start` | Preserve full query string exactly, including `t`, `code`, `promo`, `payment_ref`, and unknown params | `301` redirect to `https://mmdbkk.com/sigil/start` | `x-mmd-front-gate: mmd-redirect-worker`, `x-mmd-front-version: 20260622T071500Z`, `location: https://mmdbkk.com/sigil/start?...` |
| `/inme` | `mmd-redirect-worker` redirect guard | `mmd-redirect-worker` redirect guard to `/sigil/start` | Preserve full query string exactly | `301` redirect to `/sigil/start` | Same front-gate headers plus `location` |
| `/login` | `mmd-redirect-worker` redirect guard for safe methods; POST pass-through | `mmd-redirect-worker` redirect guard to `/sigil/start` for safe methods; POST pass-through remains untouched | Preserve full query string exactly | `GET`/`HEAD` redirect; unsafe methods pass through | Redirect response has front-gate headers and `location`; unsafe pass-through has front-gate headers |
| `/members` | `mmd-redirect-worker` redirect guard | `mmd-redirect-worker` redirect guard to `/sigil/start` | Preserve full query string exactly | `301` redirect to `/sigil/start` | Same front-gate headers plus `location` |
| `/renew` | `mmd-redirect-worker` redirect guard | `mmd-redirect-worker` redirect guard to `/sigil/start` | Preserve full query string exactly | `301` redirect to `/sigil/start` | Same front-gate headers plus `location` |
| `/renewal` | `mmd-redirect-worker` redirect guard | `mmd-redirect-worker` redirect guard to `/sigil/start` | Preserve full query string exactly | `301` redirect to `/sigil/start` | Same front-gate headers plus `location` |
| `/trust` | `mmd-redirect-worker` redirect guard | `mmd-redirect-worker` redirect guard to `/sigil/start` | Preserve full query string exactly | `301` redirect to `/sigil/start` | Same front-gate headers plus `location` |
| `/sigil/start` | Generic safe-page pass-through behind `mmd-redirect-worker`; protected by `/sigil/` never-redirect prefix | SIGIL entry gate content owner. Front gate should not redirect it. | Preserve full query string exactly | Pass through/render directly from canonical site/SIGIL content owner | `x-mmd-front-gate: mmd-redirect-worker`, `x-mmd-front-version: 20260622T071500Z`; no `location` on canonical pass-through |
| `/member/dashboard` | `mmd-redirect-worker` delegates to `IMMIGRATE_WORKER` service binding, fallback `immigrate-worker` URL | unchanged: `immigrate-worker` | Preserve full query string exactly, including `t`, `code`, `promo`, `payment_ref`, and unknown params | Proxy/delegate, no redirect | `x-mmd-front-gate: mmd-redirect-worker`, `x-mmd-front-version: 20260622T071500Z`, downstream `x-mmd-page: member-dashboard` when provided |
| `/member/membership` | `mmd-redirect-worker` delegates to `MEMBER_PAGES_WORKER` service binding, fallback `member-pages-worker` URL | unchanged: `member-pages-worker` | Preserve full query string exactly | Proxy/delegate, no redirect | `x-mmd-front-gate: mmd-redirect-worker`, `x-mmd-front-version: 20260622T071500Z`, downstream `x-mmd-page: member-membership` when provided |
| `/pay/*` | `mmd-redirect-worker` never-redirect prefix; downstream site/member/payment pages | unchanged: payment/member page owner by path | Preserve full query string exactly, especially `payment_ref`, `t`, `code`, and `promo` | Pass through, no SIGIL Start redirect | `x-mmd-front-gate: mmd-redirect-worker`, `x-mmd-front-version: 20260622T071500Z`; no `location` |
| `/webhooks/*` | `member-dashboard-chat-worker` owns production `/webhooks/line`; `mmd-redirect-worker` must not bridge or proxy LINE events | unchanged: webhook owner by Cloudflare route | Preserve full query string exactly | production LINE events handled by `member-dashboard-chat-worker`; front gate fails closed if it catches LINE webhook paths | `x-mmd-worker: member-dashboard-chat-worker` on canonical webhook; no Netlify fallback |
| `/sigil/apply` | `mmd-redirect-worker` delegates to `SIGIL_WORKER`, fallback `https://sigil.mmdbkk.com` | unchanged: `sigil-worker` | Preserve full query string exactly, including `t`, `code`, `promo` | Proxy/delegate, no Webflow fallback | `x-mmd-front-gate: mmd-redirect-worker`, `x-mmd-front-version: 20260622T071500Z`, `x-mmd-route-owner: sigil-worker`, `x-mmd-page: sigil-private-model-setup`, `x-mmd-origin: service-binding:sigil-worker` or `https://sigil.mmdbkk.com` |
| `/sigil/api/private-model/apply` | Previously protected by `/sigil/` never-redirect prefix, which allowed generic pass-through if it reached `mmd-redirect-worker` | `sigil-worker` | Preserve full query string exactly and preserve request method/body | Explicitly proxy/delegate POST and OPTIONS to `SIGIL_WORKER`; fallback only to `https://sigil.mmdbkk.com`, never Webflow | `x-mmd-front-gate: mmd-redirect-worker`, `x-mmd-front-version: 20260622T071500Z`, `x-mmd-route-owner: sigil-worker`, `x-mmd-page: sigil-private-model-apply-api`, `x-mmd-origin: service-binding:sigil-worker` or `https://sigil.mmdbkk.com` |

## Patch Gate

The minimal gated patch may only:

- Redirect legacy entry aliases to `/sigil/start`.
- Preserve full query strings exactly.
- Explicitly delegate `/sigil/api/private-model/apply` to `sigil-worker` so POST
  and OPTIONS cannot fall through to Webflow/OpenResty.
- Add regression tests for the protected member, payment, webhook, and SIGIL
  apply flows.

It must not redesign pages, publish Webflow, deploy production, or change
payment, membership, points, Black Card, webhook processing, admin auth, or
unrelated route families.

## `/trust/inme*` Worker Route Ownership Correction

Production investigation after the initial SIGIL Start migration found that
`/trust/inme` was still intercepted before `mmd-redirect-worker` by more
specific Cloudflare Worker routes:

| Production route | Previous production owner | Correct owner |
| --- | --- | --- |
| `mmdbkk.com/trust/inme*` | `member-dashboard-chat-worker` | `mmd-redirect-worker` |
| `www.mmdbkk.com/trust/inme*` | `member-dashboard-chat-worker` | `mmd-redirect-worker` |

`mmd-redirect-worker/wrangler.toml` now declares both explicit route patterns
so the canonical redirect logic in `mmd-redirect-worker/src/index.js` can own:

`/trust/inme?t=...` -> `/sigil/start?t=...`

The full query string must remain preserved exactly.

The current `main` branch used for this PR does not contain a tracked
`member-dashboard-chat-worker/wrangler.toml`, so this PR cannot remove those
older declarations from that worker's config. Future changes to
`member-dashboard-chat-worker` must not reintroduce ownership of
`mmdbkk.com/trust/inme*` or `www.mmdbkk.com/trust/inme*`.

## Legacy Membership and Renewal Route Audit

Canonical route rules:

- `/sigil/start` is the SIGIL entry gate.
- `/member/dashboard` is the member home/status hub.
- `/member/membership` is the package selection page.
- `/sigil/membership` is the renewal/access conditions page.
- `/pay/membership` is payment flow only after the user chooses payment intent.

The current behavior below describes the `main` source before PR #94. The
desired behavior describes the minimal route patch in PR #94. All redirect
decisions must preserve the full query string exactly, including `t`, `code`,
`promo`, `payment_ref`, `session_id`, and unknown params.

| Route | Current owner Worker | Target owner Worker | Current behavior | Desired behavior | Decision | Query preservation | Expected production headers | Risk note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/member` | `mmd-redirect-worker` | `mmd-redirect-worker` redirect guard to `immigrate-worker` dashboard owner | Redirects to `/membership/benefits` | Redirect to `/member/dashboard` | Redirect `301` | Preserve exact query string | `x-mmd-front-gate: mmd-redirect-worker`, `x-mmd-front-version`, `location: https://mmdbkk.com/member/dashboard?...` | Avoid sending a member home alias into package or payment selection. |
| `/member/` | `mmd-redirect-worker` | `mmd-redirect-worker` redirect guard to `immigrate-worker` dashboard owner | Redirects to `/membership/benefits` after path normalization | Redirect to `/member/dashboard` | Redirect `301` | Preserve exact query string | Same front-gate headers plus `location` | Trailing slash must not create a second hop. |
| `/membership` | `mmd-redirect-worker` | `mmd-redirect-worker` redirect guard to `member-pages-worker` package owner | Redirects to `/membership/benefits` | Redirect to `/member/membership` | Redirect `301` | Preserve exact query string | Same front-gate headers plus `location: https://mmdbkk.com/member/membership?...` | Prevent stale `/membership/benefits` loop or Webflow drift. |
| `/membership/` | `mmd-redirect-worker` | `mmd-redirect-worker` redirect guard to `member-pages-worker` package owner | Redirects to `/membership/benefits` after path normalization | Redirect to `/member/membership` | Redirect `301` | Preserve exact query string | Same front-gate headers plus `location` | Trailing slash must land on canonical package page. |
| `/membership/benefits` | `mmd-redirect-worker` via catchall | `mmd-redirect-worker` redirect guard to `member-pages-worker` package owner | Generic pass-through if reached | Redirect to `/member/membership` | Redirect `301` | Preserve exact query string | Same front-gate headers plus `location` | Must not remain an unofficial info page. |
| `/membership/benefits/` | `mmd-redirect-worker` via catchall | `mmd-redirect-worker` redirect guard to `member-pages-worker` package owner | Normalizes then generic pass-through if reached | Redirect to `/member/membership` | Redirect `301` | Preserve exact query string | Same front-gate headers plus `location` | Avoid slash normalization hop to stale route. |
| `/member/membership` | `mmd-redirect-worker` explicit route, delegates to `MEMBER_PAGES_WORKER` | Unchanged: `member-pages-worker` package selection owner | Delegates/proxies with no redirect | Keep canonical package selection page | Delegate/proxy | Preserve exact request URL and query | `x-mmd-front-gate: mmd-redirect-worker`, `x-mmd-front-version`, downstream `x-mmd-page: member-membership` when provided, no `location` | Must not become payment flow or SIGIL entry. |
| `/member/membership/` | `mmd-redirect-worker` explicit route, delegates to `MEMBER_PAGES_WORKER` | Unchanged: `member-pages-worker` package selection owner | Delegates/proxies with no redirect | Keep canonical package selection page | Delegate/proxy | Preserve exact request URL and query | Same as `/member/membership` | Slash variant must remain protected. |
| `/member/membership/benefits` | `mmd-redirect-worker` | `mmd-redirect-worker` redirect guard to `member-pages-worker` package owner | Redirects to `/pay/membership` | Redirect to `/member/membership` | Redirect `301` | Preserve exact query string | Same front-gate headers plus `location: https://mmdbkk.com/member/membership?...` | Must not skip package selection and force payment intent. |
| `/member/membership/benefits/` | `mmd-redirect-worker` | `mmd-redirect-worker` redirect guard to `member-pages-worker` package owner | Redirects to `/pay/membership` after path normalization | Redirect to `/member/membership` | Redirect `301` | Preserve exact query string | Same front-gate headers plus `location` | Trailing slash must not reintroduce payment redirect. |
| `/renew` | `mmd-redirect-worker` | `mmd-redirect-worker` redirect guard to `/sigil/membership` content owner | Redirects to `/sigil/start` | Redirect to `/sigil/membership` | Redirect `301` | Preserve exact query string | Same front-gate headers plus `location: https://mmdbkk.com/sigil/membership?...` | Renewal aliases should not enter generic SIGIL start. |
| `/renew/` | `mmd-redirect-worker` | `mmd-redirect-worker` redirect guard to `/sigil/membership` content owner | Redirects to `/sigil/start` after path normalization | Redirect to `/sigil/membership` | Redirect `301` | Preserve exact query string | Same front-gate headers plus `location` | Avoid slash normalization into wrong canonical route. |
| `/renewal` | `mmd-redirect-worker` | `mmd-redirect-worker` redirect guard to `/sigil/membership` content owner | Redirects to `/sigil/start` | Redirect to `/sigil/membership` | Redirect `301` | Preserve exact query string | Same front-gate headers plus `location` | Must not return to `/trust/inme` or payment renewal. |
| `/renewal/` | `mmd-redirect-worker` | `mmd-redirect-worker` redirect guard to `/sigil/membership` content owner | Redirects to `/sigil/start` after path normalization | Redirect to `/sigil/membership` | Redirect `301` | Preserve exact query string | Same front-gate headers plus `location` | Slash variant must match non-slash behavior. |
| `/pay/membership` | `mmd-redirect-worker` member page route delegation | Unchanged payment/member page owner behind front gate | Delegates to `MEMBER_PAGES_WORKER` fallback `member-pages-worker` | Keep payment flow only after user chooses payment intent | Delegate/proxy, no alias redirect | Preserve exact request URL and query | `x-mmd-front-gate: mmd-redirect-worker`, `x-mmd-front-version`, no `location` | Must not be used as a generic membership info target. |
| `/pay/membership/` | `mmd-redirect-worker` member page route delegation | Unchanged payment/member page owner behind front gate | Delegates to `MEMBER_PAGES_WORKER` fallback `member-pages-worker` | Keep payment flow only after user chooses payment intent | Delegate/proxy, no alias redirect | Preserve exact request URL and query | Same as `/pay/membership` | Slash variant must not redirect to SIGIL start. |
| `/pay/pending-verification` | `mmd-redirect-worker` member page route delegation | Unchanged payment/member page owner behind front gate | Delegates to `MEMBER_PAGES_WORKER` fallback `member-pages-worker` | Keep pending verification flow untouched | Delegate/proxy, no alias redirect | Preserve exact request URL and query | `x-mmd-front-gate: mmd-redirect-worker`, `x-mmd-front-version`, no `location` | Payment verification state must stay untouched. |
| `/pay/pending-verification/` | `mmd-redirect-worker` member page route delegation | Unchanged payment/member page owner behind front gate | Delegates to `MEMBER_PAGES_WORKER` fallback `member-pages-worker` | Keep pending verification flow untouched | Delegate/proxy, no alias redirect | Preserve exact request URL and query | Same as `/pay/pending-verification` | Slash variant must not redirect. |
| `/sigil/membership` | `mmd-redirect-worker` catchall with `/sigil/` never-redirect prefix | `/sigil/membership` content owner behind canonical site/SIGIL content | Pass-through if reached | Keep canonical renewal/access conditions route | Pass-through/render by content owner | Preserve exact request URL and query | `x-mmd-front-gate: mmd-redirect-worker`, `x-mmd-front-version`, no `location` | This PR only points aliases here; it does not change page rendering. |
| `/sigil/membership/` | `mmd-redirect-worker` catchall with `/sigil/` never-redirect prefix | `/sigil/membership` content owner behind canonical site/SIGIL content | Pass-through if reached | Keep canonical renewal/access conditions route | Pass-through/render by content owner | Preserve exact request URL and query | Same as `/sigil/membership` | Slash variant must not redirect to SIGIL start or payment. |

## PR #94 Production Completion Note

Status: completed in production.

Deployed worker:

```text
mmd-redirect-worker
version: c7f66eb2-0d3f-4984-b5df-121a2be3768d
```

Production smoke confirmed the final canonical redirects below. Every redirect
preserves the full query string, including `t`, `code`, `promo`, `payment_ref`,
`session_id`, and unknown params, and returns
`x-mmd-front-gate: mmd-redirect-worker`.

```text
/member -> /member/dashboard
/member/ -> /member/dashboard

/membership -> /member/membership
/membership/ -> /member/membership
/membership/benefits -> /member/membership
/membership/benefits/ -> /member/membership

/member/membership/benefits -> /member/membership
/member/membership/benefits/ -> /member/membership

/renew -> /sigil/membership
/renew/ -> /sigil/membership
/renewal -> /sigil/membership
/renewal/ -> /sigil/membership
```

Production smoke also confirmed these protected routes stayed stable:

```text
/trust/inme -> /sigil/start
/sigil/apply -> sigil-worker
/sigil/api/private-model/apply -> sigil-worker
/member/dashboard = member home / status hub
/member/membership = package selection
/pay/* not redirected to SIGIL/member pages
/webhooks/line not redirected
```

Deployment guardrails honored:

- No Webflow publish.
- No `sigil-worker` deploy.
- No payment logic changes.
- No membership rendering logic changes.
- No points, Black Card, webhook processing, admin auth, or unrelated logic
  changes.

## PR #96 SIGIL Membership Canonical Page Owner Audit

Live audit after PR #93, PR #94, and PR #95 found one remaining identity issue:

```text
/renew -> /sigil/membership
/renewal -> /sigil/membership
/sigil/membership -> 404 Kontrix - Not Found / Thai 401-style access heading
```

The redirect mapping is correct and must not be reverted to `/sigil/start`.
The missing piece is a valid page owner/render path for `/sigil/membership`.

Owner audit:

| Question | Finding |
| --- | --- |
| Does `member-pages-worker` already support `/sigil/membership`? | No. Before PR #96, `member-pages-worker` only recognized `/member/membership`, `/pay/membership`, `/pay/pending-verification`, and `/member/profile`. |
| Does `mmd-redirect-worker` pass `/sigil/membership` through to origin because `/sigil/*` is in `NEVER_TOUCH_PREFIXES`? | Yes. Before PR #96, `/sigil/membership` had no explicit handler, so it reached generic `/sigil/` never-touch pass-through. |
| Is Webflow/origin returning Kontrix 404 for `/sigil/membership`? | Yes. Live GET/HEAD audit showed `HTTP 404`, title `Kontrix - Not Found`, and a Thai 401-style heading when the route passed through. |
| Which worker should own the rendered page? | `member-pages-worker` should own the content for the renewal/access conditions page. `mmd-redirect-worker` remains the front route/proxy owner. |

Target ownership:

| Route | Front route/proxy owner | Content owner | Page identity | Behavior |
| --- | --- | --- | --- | --- |
| `/sigil/membership` | `mmd-redirect-worker` | `member-pages-worker` | `x-mmd-page: sigil-membership` | Delegate/proxy before generic `/sigil/*` pass-through; return `200` content, not origin 404. |
| `/sigil/membership/` | `mmd-redirect-worker` | `member-pages-worker` | `x-mmd-page: sigil-membership` | Same as non-slash variant, preserving query string. |

Page content policy:

- Thai primary copy with concise English labels where useful.
- Renewal/access conditions page, not checkout.
- Trial, Standard, and Premium are the only customer-facing sold packages if
  package context appears.
- VIP and SVIP must not appear as customer-facing purchase/upgrade options.
- Payment slip/proof must not imply membership confirmation.
- Confirmation happens only after official verification.
- Black Card may be described only as private consideration/review, not
  automatic approval.

## PR #96 Production Completion Note

Status: completed in production.

PR:

```text
PR #96: Fix SIGIL membership canonical page owner
Merged commit: 3ba7a4cd271efaf3360f54d7cac3dae514541d66
```

Deployed workers:

```text
member-pages-worker
version: 2ac598b6-6307-4065-b600-1a1f5aaf8642

mmd-redirect-worker
version: 716aaa2b-4eca-4b41-a834-9ccdbff82d59
```

Production smoke confirmed the canonical SIGIL membership page owner:

```text
/sigil/membership -> 200, x-mmd-page: sigil-membership, x-mmd-worker: member-pages-worker
/sigil/membership/ -> 200, x-mmd-page: sigil-membership, x-mmd-worker: member-pages-worker

/renew -> /sigil/membership with full query preserved
/renewal -> /sigil/membership with full query preserved
```

Following `/renew` and `/renewal` now reaches final `HTTP 200` SIGIL
membership content:

```text
title: MMD Privé | sigil-membership
h1: Renewal / Access Conditions
```

Protected route stability remained confirmed after the PR #96 production
deploy:

```text
/trust/inme -> /sigil/start
/sigil/start -> 200 stable
/sigil/apply -> sigil-worker, x-mmd-page: sigil-private-model-setup
/sigil/api/private-model/apply OPTIONS -> 204, sigil-worker, x-mmd-page: sigil-private-model-apply-api
/member/dashboard -> immigrate-worker, x-mmd-page: member-dashboard
/member/membership -> member-pages-worker, x-mmd-page: member-membership
/pay/membership -> member-pages-worker, x-mmd-page: pay-membership
/pay/pending-verification -> member-pages-worker, x-mmd-page: pay-pending-verification
/webhooks/line -> 200, no redirect
```

Forbidden checks passed:

```text
PASS: /sigil/membership no longer shows Kontrix/404 content
PASS: /renew reaches SIGIL membership content
```

Deployment guardrails honored:

- No Webflow publish.
- No `sigil-worker` deploy.
- No real payment submission.
- No payment verification logic change.
- No membership update logic change.
- No points logic change.
- No Black Card logic change.
- No webhook processing change.
- No admin auth change.

## PR #99 Production Completion Note

Status: completed in production.

PR:

```text
PR #99: Polish member membership page
Merged commit: b3caba82dcf17e41d9ee517c6f2f54cdd1f1264c
```

Deployed worker:

```text
member-pages-worker
version: e5cdac95-cc15-40d8-ae1a-dccd156f1bd6
```

Scope:

- Visual/content polish for `/member/membership` only.
- `/member/membership` remains owned by `member-pages-worker`.
- `x-mmd-page` remains `member-membership`.
- No route ownership change.
- No `mmd-redirect-worker` deploy.
- No `sigil-worker` deploy.
- No Webflow publish.
- No payment verification, membership update, points, Black Card, webhook,
  admin auth, or unrelated logic changes.

Validation:

```text
node --check member-pages-worker/src/index.js passed
node --test member-pages-worker/test/membership.test.mjs passed, 5 tests, 0 failed
```

Live smoke:

```text
/member/membership -> HTTP 200, x-mmd-page: member-membership, x-mmd-worker: member-pages-worker
/membership -> 301 /member/membership with query preserved
Protected routes remained stable
Trial, Standard, Premium present
VIP absent
SVIP absent
Black Card copy remains review/private consideration only
Proof/slip is not payment truth
Verified funds are payment truth
Points follow verified funds only
```

## `/pay/renewal` Route Ownership Audit and Decision Record

Audit date: 2026-06-23.

Scope: audit-only. No production deploy, no Webflow publish, no runtime code
change, and no payment submission.

Live route finding:

| Route | Live status | Live owner headers | Content identity | Finding |
| --- | --- | --- | --- | --- |
| `/pay/membership` | `200` | `x-mmd-front-gate: mmd-redirect-worker`, `x-mmd-worker: member-pages-worker`, `x-mmd-page: pay-membership` | `MMD Privé | pay-membership` | Owned through the front gate and delegated to `member-pages-worker`. |
| `/pay/membership/` | `200` | Same as non-slash route | `MMD Privé | pay-membership` | Slash variant is stable. |
| `/pay/pending-verification` | `200` | `x-mmd-front-gate: mmd-redirect-worker`, `x-mmd-worker: member-pages-worker`, `x-mmd-page: pay-pending-verification` | `MMD Privé | pay-pending-verification` | Owned through the front gate and delegated to `member-pages-worker`. |
| `/pay/pending-verification/` | `200` | Same as non-slash route | `MMD Privé | pay-pending-verification` | Slash variant is stable. |
| `/pay/renewal` | `200` | No `x-mmd-front-gate`, no `x-mmd-worker`, no `x-mmd-page`; includes `x-mmd-route-source: member-dashboard-chat-worker:mmd-renewx` and `x-mmd-route-revision: MMD_RENEWX_20260620b` | `Renewal Payment | SĪGIL`, `mmd-renewx` | Not Webflow leakage, not Kontrix, not 404. It is served intentionally by `member-dashboard-chat-worker:mmd-renewx`, outside the front gate. |
| `/pay/renewal/` | `200` | Same as non-slash route | `Renewal Payment | SĪGIL`, `mmd-renewx` | Slash variant has the same owner/identity behavior. |

Cloudflare Worker route ownership:

| Pattern | Production Worker route owner | Route ID | Note |
| --- | --- | --- | --- |
| `mmdbkk.com/pay/renewal*` | `member-dashboard-chat-worker` | `7cb14a4bc55c4356b9fcda33b8a3579b` | More specific than `mmdbkk.com/*`, so it wins before `mmd-redirect-worker`. |
| `www.mmdbkk.com/pay/renewal*` | `member-dashboard-chat-worker` | `9e0a707421314b0cb70b2224435b4efa` | More specific than `www.mmdbkk.com/*`, so it wins before `mmd-redirect-worker`. |
| `mmdbkk.com/pay/*` | Not found | n/a | No generic `/pay/*` Worker route was found. |
| `www.mmdbkk.com/pay/*` | Not found | n/a | No generic `/pay/*` Worker route was found. |
| `mmdbkk.com/*` | `mmd-redirect-worker` | `cb57c678c4e14bd2ab02990cc3ba7bef` | Broad front-gate route for routes without a more-specific owner. |
| `www.mmdbkk.com/*` | `mmd-redirect-worker` | `a506e82ce6174da1af40230aee0dcb12` | Broad front-gate route for routes without a more-specific owner. |

Repository/code ownership finding:

- Current tracked `main` does not include a tracked
  `member-dashboard-chat-worker` implementation or route config.
- The local exported production snapshot under
  `tmp/cloudflare-member-dashboard-chat-worker/` and the local
  `member-dashboard-chat-worker/wrangler.toml` show that `/pay/renewal*` and
  `/sigil/pay/renewal*` are declared for `member-dashboard-chat-worker`.
- The exported worker snapshot handles `/pay/renewal` and `/pay/renewal/` in
  the renewal page path set and returns the `mmd-renewx` renewal payment page.
- The snapshot also includes tests for `/pay/renewal` and `/pay/renewal/`,
  confirming the page is an active production flow rather than a stale 404 or
  origin leak.
- The rendered page points proof submission at
  `https://sigil.mmdbkk.com/api/pay/renewal/proof`.
- The broader worker contains LINE and Telegram webhook/admin/payment-review
  logic. Moving `/pay/renewal*` behind another front-gate route without a
  separate migration could disturb that coupled renewal/payment proof surface.

Payment safety doctrine observed:

- The renewal/payment ecosystem includes proof/slip language as supporting
  evidence only.
- LINE slip intake records notes including: "Supporting evidence; do not
  confirm payment from slip alone."
- Payment records remain pending/pending review or pending match; the audit did
  not find evidence that a public proof/slip alone confirms membership,
  awards points, or grants Black Card approval.

Decision recommendation:

Option A is the recommended near-term canonical decision:

```text
Keep /pay/renewal and /pay/renewal/ owned by member-dashboard-chat-worker:mmd-renewx.
Document it as an intentional payment-route exception.
Do not move it through mmd-redirect-worker until the payment proof endpoint,
LINE/Telegram review dependencies, and any route-config source-of-truth are
explicitly migrated together.
```

Recommended follow-up PR if code change is approved:

- Bring the active `member-dashboard-chat-worker` route/source config under a
  tracked source-of-truth if it is not already tracked elsewhere.
- Add or standardize response identity headers for `/pay/renewal` and
  `/pay/renewal/`:

```text
x-mmd-worker: member-dashboard-chat-worker
x-mmd-page: pay-renewal
x-mmd-route-source: member-dashboard-chat-worker:mmd-renewx
x-mmd-route-revision: MMD_RENEWX_...
```

- Add regression tests proving `/pay/renewal` and `/pay/renewal/` return `200`,
  preserve query params, keep proof/slip as evidence only, and do not imply
  automatic membership confirmation, points award, or Black Card approval.
- Do not add broad `/pay/*` redirects.
- Do not change payment verification, membership activation, points, Black
  Card, webhook processing, admin auth, Webflow, or `sigil-worker` behavior.

Option B is not recommended without a separate explicit migration approval:

```text
Move exact /pay/renewal and /pay/renewal/ through mmd-redirect-worker,
delegate to an approved content owner, and preserve all query params.
```

Risk assessment:

- Current user-facing content is not wrong-origin content, but the missing
  standard identity headers make `/pay/renewal` harder to audit alongside
  `/pay/membership` and `/pay/pending-verification`.
- Moving ownership prematurely could break an active renewal payment proof
  flow, especially because the current flow is coupled to proof submission,
  LINE slip intake, Telegram/admin review, and `member-dashboard-chat-worker`
  routes.
- The safest minimal next step is documentation plus a later header-only
  `member-dashboard-chat-worker` PR, not a route move.
