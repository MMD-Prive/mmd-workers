# TMIB Private Story Access v1

Production contract for `/tmib/act-001`.

## Public versus protected

- Frames 01-03 are public teaser media and may stay on Webflow CDN.
- Frames 04-20 are Long Story media. The browser page must not contain their Webflow CDN source URLs.
- Protected frames are stored in private R2 at `mmd-models/tmib/act-001/<frame>.webp` and are served only through short-lived same-origin URLs.

## Access authority

`GET /member/api/liff/tmib/episodes/act-001/access`

The route is owned by `member-pages-worker` behind `member-dashboard-chat-worker`'s existing `/member/api/liff/*` front gate. Access is granted only when either:

1. the current verified LINE/MY MMD session resolves to an active, verified eligible membership; or
2. the same verified LINE identity has a persisted ACT 001 purchase whose canonical Payments record is Paid + Verified/Approved, package `tmib_act_001`, amount 299 THB and stage `tmib_story`.

Blocked, suspended, revoked, expired, guest, trial, unresolved and display-only membership state does not grant story access.

## Single episode payment

`POST /member/api/liff/tmib/episodes/act-001/purchase`

The member-pages Worker creates/reuses a deterministic `payments-worker` intent for the verified LINE identity and returns the canonical signed `/pay/checkout?t=...` URL. The browser never chooses the authoritative amount or package. Payment proof alone is not a grant; access is issued only after canonical Paid + Verified/Approved state is observed.

## Protected media

`GET /member/api/liff/tmib/episodes/act-001/media/<04..20>?exp=<unix>&sig=<hmac>`

Media requests require the same verified LINE session, an unexpired five-minute HMAC URL tied to that identity, and an existing private R2 object. Responses are `no-store`, same-origin and noindex.

## Leak deterrence

The reader uses a per-identity watermark and disables common browser copy, selection, drag, context-menu and print flows. These controls reduce casual copying; no web page can guarantee prevention of operating-system screenshots or external-camera capture.
