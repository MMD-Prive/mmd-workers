# TMIB ACT 001 Access Lock — 2026-09-16

- Eligible active verified membership spans MMD Public Member (690 THB) through Black Card, including canonical active intermediate/private tiers.
- Guest, trial, checking, pending review, expired, blocked, suspended and revoked states fail closed.
- Single Episode price is locked at 299 THB for ACT 001.
- Browser-side payment amount, package and verification state are never authoritative.
- `payments-worker` remains payment authority; only Paid + Verified/Approved canonical records can materialize a purchased-episode entitlement.
- Protected frames 04-20 are private R2 media and are delivered through identity-bound, five-minute signed same-origin URLs.
- Common browser copying is deterred; operating-system screenshots cannot be guaranteed impossible on the web.
