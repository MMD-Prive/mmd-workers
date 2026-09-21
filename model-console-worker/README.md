# MMD Model Console V1.1

Operator surface only. Canonical operational state remains owned by downstream workers and Airtable; R2 owns files; KV is restricted to temporary working memory.

## Security contract

- Browser sends only the server-issued, HttpOnly admin session cookie (`credentials: include`).
- Model Console validates that session through `SESSION_VALIDATOR_BASE_URL` and `/v1/admin/auth/me` before every protected request.
- `ADMIN_BEARER`, `CONFIRM_KEY`, and `INTERNAL_TOKEN` exist only inside Workers and are never accepted from the production UI.
- Generic `/v1/console/proxy` returns `410 generic_proxy_disabled`.
- CORS allows credentials only for exact `ALLOWED_ORIGINS`; auth headers are not allowed from browsers.

## Typed console contracts

- `GET /v1/console/models`
- `GET /v1/console/models/:id` — Model 360 aggregate
- `GET /v1/console/models/:id/availability`
- `GET /v1/console/models/:id/jobs`
- `GET /v1/console/models/:id/payments`
- `GET /v1/console/models/:id/access`
- `GET /v1/console/models/:id/alerts`
- `POST /v1/console/models/upsert`
- `POST /v1/console/models/:id/availability-snapshot` — operator-confirmed, sanitized SIGIL availability producer
- `GET /v1/console/workers/health` — contract-aware health

Model 360 aggregates downstream responses and labels unavailable sections; it does not synthesize or persist canonical identity/status.

## Memory and audit

- KV accepts only `draft:model:`, `view:model:`, `match:`, and `lock:model:` keys, with a maximum TTL of seven days.
- Mutations write a permanent audit event through `ADMIN_EVENT_LOG_BASE_URL` before reporting success. KV audit keys are removed.
- R2 assets stay in R2 and are referenced by canonical object key/URL only.

## Required configuration

Canonical production values are `SESSION_VALIDATOR_BASE_URL=https://mmdbkk.com`, `SESSION_VALIDATOR_PATH=/v1/admin/auth/me`, and `ADMIN_EVENT_LOG_PATH=/v1/admin/model-console/audit`. `ADMIN_EVENT_LOG_BASE_URL` may be the verified admin-worker hostname or an `ADMIN_WORKER` service binding. Configure the remaining verified downstream worker base URLs and the `MMD_MODEL_CONSOLE_MEMORY` KV binding. Keep downstream credentials as Worker secrets.


## SIGIL availability producer

Model Console never writes raw operational context into Kenji's recommendation storage. The availability producer resolves the canonical Model first, forwards only the safe availability state, city, coarse zones, and `burn/mk/live` booleans through the service-only Admin Worker boundary, and stores `sigil_availability_snapshot_v1` in the shared availability KV.

Forbidden values such as customer identity, hotel/room, exact GPS, payment data, contacts, and operator/private notes are not forwarded. `available_now` expires within 15 minutes; other states are TTL-bounded by the SIGIL Availability Snapshot contract.
