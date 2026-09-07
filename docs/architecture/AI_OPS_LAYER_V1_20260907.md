# MMD AI Ops Layer V1 — 2026-09-07

## Goal

Provide one shared intelligence layer across canonical `/internal/admin/*` operator surfaces instead of separate page-specific AI widgets.

## Operating model

Every canonical page receives the same five capabilities:

1. **Context Intelligence** — identify the current page, selected client/model/job/payment context, and relevant canonical IDs.
2. **AI Brief** — compress the current operational state into a short operator brief.
3. **Next Best Actions** — surface up to three recommended actions in priority order.
4. **Anomaly / Missing Detector** — call out missing identity, unresolved authority, stale evidence, incomplete assets, payment-context gaps, and route/runtime health issues.
5. **Supervised Action** — prepare navigation or safe read-only actions while keeping final payment, membership, entitlement, Telegram/Drive grant, and protected model-access authority with backend owners.

## Shared frontend contract

Canonical Webflow pages load a single site-level layer guarded to `/internal/admin/*` paths. The layer must:

- stay visually compact and mobile-first;
- render a floating `AI OPS` button and a slide-up/side panel;
- infer context from URL/query/body data attributes without mutating page state;
- request `/v1/admin/ai-ops/context` with the current path plus discovered IDs;
- show verified facts separately from suggestions;
- never imply that a suggested action has already happened;
- fail closed when the context endpoint is unavailable.

## Shared backend contract

`GET /v1/admin/ai-ops/context`

Supported query parameters:

- `path`
- `client_id`
- `member_id`
- `model_id`
- `job_id`
- `session_id`
- `payment_ref`
- `record_id`

Response shape:

```json
{
  "ok": true,
  "schema_version": "mmd_ai_ops_layer_v1",
  "page": { "path": "/internal/admin/jobs/create-job", "surface": "create_job" },
  "context": {},
  "brief": [],
  "anomalies": [],
  "next_actions": [],
  "authority": {
    "money": "payments-worker",
    "entitlement": "my_mmd_entitlement_resolver_v1",
    "telegram_drive": "observed_state_only"
  }
}
```

## Canonical surface map

- `/internal/admin/control-room` → daily operating overview and queue triage.
- `/internal/admin/dashboard` → business/system summary.
- `/internal/admin/jobs/create-job` → client/model/job creation copilot.
- `/internal/admin/payments` → payment-evidence triage; no direct paid-state inference.
- `/internal/admin/payments/historical-backfill` → backfill progress/anomaly guidance.
- `/internal/admin/membership-access` → expected vs observed access reconciliation.
- `/internal/admin/member-intelligence` → verified customer brief and next-best-action support.
- `/internal/admin/access/invite` → invitation preparation; operator confirmation required.
- `/internal/admin/owner/setup` → setup/runtime health guidance only.
- `/internal/admin/studio` and canonical Studio subpages → model asset/readiness copilot.
- `/internal/admin/mms` → MMS operating brief.
- `/internal/admin/customer-data` → HOLD surface; AI may explain missing wiring but must not pretend controls work.
- `/internal/admin/kenji` → Kenji knowledge/QA/publish support.

Legacy/retired surfaces do not receive new AI dependencies.

## Authority locks

The AI Ops layer is advisory and preparatory. It must not:

- mark payment paid;
- change membership truth;
- grant/revoke protected entitlement;
- infer VIP/SVIP/Black Card from aliases, old folders, labels, or renamed LINE chat names;
- grant/revoke Telegram or Drive access directly;
- bypass model eligibility or private access checks;
- write destructive state without an explicit operator action handled by the canonical backend.

## UX rule

The operator should not need to remember routes or system ownership. The layer may recommend the correct canonical destination and explain why, but backend owners remain authoritative.