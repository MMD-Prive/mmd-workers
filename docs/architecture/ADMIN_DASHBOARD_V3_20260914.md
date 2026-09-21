# MMD Internal Admin Dashboard V3 — 2026-09-14

## Purpose

Keep `/internal/admin/dashboard` as the owner/operator entry point while preserving backend authority boundaries. Webflow is presentation and routing only; same-origin Workers remain the read/write authority.

## Primary owner flow

1. Read the authenticated brief from `GET /v1/admin/dashboard`.
2. Show the actual priority list, today's jobs, payment review, member review, Boss Per escalations, and backend status.
3. Read the protected Calendar summary from `GET /v1/admin/calendar`.
4. Send operators to the canonical owner surface for any action.

The primary creation action is **Create Job** at `/internal/admin/jobs/create-job`.

`/internal/admin/jobs/create-session` remains compatibility/secondary only and must not be presented as the main operator action.

## Calendar state

Calendar is now a protected admin surface at `/internal/admin/calendar` with same-origin authenticated reads. It can show Session + Job + Model + Deposit + Cal mapping state and live Cal diagnostics.

Current safety lock remains:

- MMD Session / Job lifecycle truth stays in MMD Workers.
- `payments-worker` remains payment truth.
- Cal owns scheduling / availability projection only.
- Model Confirm → Internal Hold → waiting deposit → verified deposit → Confirmed Session is the intended lifecycle.
- Cal write/mutation remains fail-closed and shadow-gated until the production E2E live-write gate is explicitly passed.
- No browser secret, API key, bearer token, or confirmation key may be exposed.

## Dashboard Webflow runtime

Canonical runtime source:

`webflow/internal/admin/dashboard/dashboard-runtime-v3.js`

Responsibilities:

- scope itself only to `/internal/admin/dashboard`;
- fetch `/v1/admin/dashboard` using `credentials: include`;
- redirect 401/403 to canonical Admin Login;
- hydrate focus, counts, todos, jobs, payment review, members, Boss Per escalation and backend status;
- fetch `/v1/admin/calendar` for a compact daily scheduling summary;
- keep Create Job as the primary creation route;
- translate owner-facing runtime labels into simple Thai;
- update the Latest Update block to `LIVE READ · SHADOW WRITE` while write-side Cal remains gated.

## Authority map

- Admin dashboard read model: `admin-worker`
- Session lifecycle: events/session runtime authority
- Payments: `payments-worker`
- Membership / entitlement: `my_mmd_entitlement_resolver_v1`
- Back-office record context: Airtable canonical records
- Scheduling / availability projection: Cal.com
- Telegram / Drive: observed downstream state only

## UX

- Mobile-first, compact operational layout.
- Thai task labels first; implementation vocabulary is secondary.
- Owner sees what needs action, not backend jargon.
- Progressive disclosure for debug/system context.
- No duplicated technical control plane when the canonical action surface already exists.
