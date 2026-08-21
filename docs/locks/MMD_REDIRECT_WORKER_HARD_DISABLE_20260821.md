# MMD Redirect Worker — HARD DISABLE LOCK

Effective: 2026-08-21 (Asia/Bangkok)
Status: ACTIVE OWNER LOCK

## Owner directive

`mmd-redirect-worker` is frozen and must not perform any routing behavior until a new explicit owner directive is issued.

Forbidden until further notice:
- redirects
- rewrites
- proxies
- recovery shells
- inline pages
- route classification
- canonical-host enforcement
- service bindings
- catch-all ownership
- route-owner headers
- membership routing
- SIGIL routing
- LINE webhook bridging
- admin routing
- model routing
- API routing
- fallback routing

## Required runtime state

- Worker code is transparent pass-through only if invoked.
- Wrangler config contains no production routes and no service bindings.
- Normal deployment workflows must not deploy `mmd-redirect-worker`.
- No new route, binding, handler, proxy, redirect, or recovery behavior may be added without a new explicit owner directive.

## Ownership after this lock

This lock does not assign replacement route ownership. Each route must be owned explicitly by its real destination surface or Worker under a later owner directive.

Webflow customer pages should be reached directly when their routing is otherwise valid. API/application namespaces remain the responsibility of their actual dedicated owners; this lock does not migrate them automatically.

## Change control

Any future reactivation requires a new explicit owner instruction that states what exact routes or responsibilities may return. Broad restoration of the previous front-gate behavior is prohibited by default.
