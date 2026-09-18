# Kenji LV5 P2 — Live Context Fan-in

Status: implementation candidate
Date: 2026-09-16

## Goal

Kenji LV5 resolves current operational context before choosing a next action:

`Per Rename / Canonical Client -> Client 360 -> Entitlement -> Job + Calendar -> Payment + Client Credit -> HYPE -> LV5 Planner`

## Endpoint

Service-binding only:

`POST /v1/internal/kenji/operational-context/live`

Allowed callers stay the same as the LV5 P1 RPC. Browser/public access is not added.

## Source ownership

- Canonical identity: reviewed Client + authoritative Per Rename index.
- Client continuity: Client Intelligence / Customer 360 projection.
- Membership/access: `my_mmd_entitlement_resolver_v1` over canonical entitlement rows.
- Job / Session / Calendar: existing read-only Admin Calendar projection over canonical Session, Job, Model and Cal-link data.
- Money: canonical payment projection; verified Client Credit uses the existing payment-authority-backed ledger invariant.
- HYPE: notification/access observation only. HYPE never becomes payment, membership, Job or entitlement truth.
- Protected mutation: canonical backend + Per confirmation.

## Fail-closed rules

P2 does not proceed as fully ready when any essential live source is unresolved or unavailable:

- Canonical Client unresolved or Per Rename ambiguous.
- Client 360 unavailable.
- Entitlement resolver unavailable/invalid.
- Calendar/Job/Payment read projection unavailable.

Payment proof uncertainty never becomes paid-state. Calendar conflict never becomes availability. Verified Client Credit only includes ledger rows backed by payment authority.

## P3 handoff

P3 may call this endpoint from LINE/Kenji after it has normalized a customer intent. P3 must use the returned `reply_strategy`, `next_actions`, `fan_in.blockers`, and live domain projections rather than rebuilding business truth in the chat worker.
