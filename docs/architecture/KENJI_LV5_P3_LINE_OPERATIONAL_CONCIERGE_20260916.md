# Kenji LV5 P3 — LINE Operational Concierge

Status: implementation candidate
Date: 2026-09-16

## Goal

Convert strong customer operational requests in MMD LINE OA from generic route guidance into a safe live concierge flow:

`LINE text -> Canonical LINE Client -> Model Access Gate -> P2 Live Context Fan-in -> bounded customer reply -> telemetry -> HYPE exception`

Example:

`จอง Rossi วันที่ 20 ก.ย. สองทุ่ม ที่สุขุมวิท`

P3 extracts the model, date, time and location, resolves the canonical customer, checks that the named Model is visible to that exact member, then asks P2 for live Client 360 / entitlement / Job / Calendar / Payment / Credit / HYPE context.

## Safety / authority

P3 does not confirm a booking, payment, credit application, membership change, Model assignment, calendar hold or Telegram access.

- Model visibility: `KENJI_MODEL_ACCESS_V1`
- Membership/access: `my_mmd_entitlement_resolver_v1`
- Job/Session: canonical Job/Session backend
- Calendar: live read projection; conflict is never represented as availability
- Money: payments-worker / verified Client Credit projection
- HYPE: notification only
- Final protected action: canonical backend + Per

## Runtime behavior

P3 is evaluated inside the existing Kenji LINE redelivery/recovery wrapper. Therefore existing LINE signature verification, ack-first outer runtime, redelivery protection, Runtime Controls, customer-memory linking and telemetry remain in place.

Only a single active direct-user event with a reply token may be handled by P3. Multi-event, standby and redelivery payloads stay on the existing path.

## Customer reply rules

- Reuse known model/date/time/location; ask only for missing inputs.
- Never expose a private Model's existence or schedule when Model Access returns silent/unverified.
- Never say payment is paid until canonical payment truth says so.
- Never say booking is confirmed from a calendar availability read.
- If a live truth source is unavailable, preserve the customer's brief and explain that confirmation is pending live verification.
- LINE OA copy remains Per-facing / MMD-facing and does not expose internal system vocabulary.

## HYPE exceptions

Only exception/handoff cases create a HYPE notification:

- payment review -> Payment thread
- membership/model entitlement review -> Membership thread
- Canonical Client / identity failure -> Alerts thread
- live fan-in degradation -> Alerts thread

HYPE remains `notification_only`; it cannot change domain truth.
