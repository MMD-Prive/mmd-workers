# SIGIL Start Route Migration Audit

Last updated: 2026-06-23

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
| `/webhooks/*` | `mmd-redirect-worker` never-redirect prefix; `/webhooks/line` may bridge to configured LINE upstream | unchanged: webhook owner/upstream by path | Preserve full query string exactly | POST pass-through or existing webhook bridge; no redirect | `x-mmd-front-gate: mmd-redirect-worker`, `x-mmd-front-version: 20260622T071500Z`; no `location` |
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
