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
