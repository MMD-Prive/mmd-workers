# MMD AI Ops Layer V1 — 2026-09-07

## Goal

Provide one shared intelligence layer across canonical owner/admin surfaces instead of separate page-specific AI widgets.

MMD owner mode assumes **Per is the single human operator**. The AI layer therefore helps Per read, summarize, detect missing evidence, and prepare the next action without inventing a second admin/reviewer role.

Canonical human pattern:

`AI reads context → AI summarizes / checks → Per confirms → canonical backend acts`

## Operating model

Every canonical page receives the same five capabilities:

1. **Context Intelligence** — identify the current page, selected client/model/job/payment context, and relevant canonical IDs.
2. **AI Brief** — compress the current operational state into a short brief for Per.
3. **Next Best Actions** — surface up to three recommended actions in priority order.
4. **Anomaly / Missing Detector** — call out missing identity, unresolved authority, stale evidence, incomplete assets, payment-context gaps, and route/runtime health issues.
5. **Supervised Action** — prepare navigation or safe read-only actions while keeping final payment, membership, entitlement, Telegram/Drive grant, protected model-access authority, and explicit owner decisions with their canonical backend / Per confirmation.

## Single-owner UX lock

Normal owner UI must not create a fictional multi-admin workflow.

Prefer:

- `Per · Owner Mode`
- `สรุป`
- `สิ่งที่ขาด`
- `ทำต่อ`
- `สรุปก่อนยืนยัน`
- `ยืนยัน / ใช้จริง`
- `History / Advanced`

Review, QA, audit, version and policy gates may remain internally for safety, but they should run automatically behind one Per confirmation when no second human decision adds value.

See `MMD_SINGLE_OWNER_ADMIN_CEO_V1_20260907.md` for the owner-mode canon.

## Shared frontend contract

Canonical Webflow pages load a single site-level layer guarded to `/internal/admin/*` paths. CEO receives the same client through its Worker route. The layer must:

- stay visually compact and mobile-first;
- render a floating `PER · AI OPS` button and a slide-up/side panel;
- identify the experience as `Per · Owner Mode`;
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
  "owner_mode": {
    "mode": "single_owner",
    "human_operator": "Per",
    "second_human_review_required": false
  },
  "context": {},
  "brief": [],
  "anomalies": [],
  "next_actions": [],
  "authority": {
    "money": "payments-worker",
    "entitlement": "my_mmd_entitlement_resolver_v1",
    "telegram_drive": "observed_state_only",
    "human_operator": "Per"
  }
}
```

## Canonical surface map

- `/internal/ceo` → what Per needs to know / decide now.
- `/internal/admin/control-room` → what Per needs to do next.
- `/internal/admin/dashboard` → business/system summary.
- `/internal/admin/jobs/create-job` → client/model/job creation copilot.
- `/internal/admin/payments` → payment-evidence triage; no direct paid-state inference.
- `/internal/admin/payments/historical-backfill` → backfill progress/anomaly guidance.
- `/internal/admin/membership-access` → expected vs observed access reconciliation.
- `/internal/admin/member-intelligence` → verified customer brief and next-best-action support.
- `/internal/admin/access/invite` → invitation preparation; Per confirmation required.
- `/internal/admin/owner/setup` → setup/runtime health guidance only.
- `/internal/admin/studio` and canonical Studio subpages → model asset/readiness copilot.
- `/internal/admin/mms` → MMS operating brief. Partner permissions may remain separate where the MMS access model requires them.
- `/internal/admin/customer-data` → HOLD surface; AI may explain missing wiring but must not pretend controls work.
- `/internal/admin/kenji` → single-owner Teach/Edit → Summary → Use Live flow with technical history under Advanced.

Legacy/retired surfaces do not receive new AI dependencies.

## Authority locks

The AI Ops layer is advisory and preparatory. It must not:

- mark payment paid;
- change membership truth;
- grant/revoke protected entitlement;
- infer VIP/SVIP/Black Card from aliases, old folders, labels, or renamed LINE chat names;
- grant/revoke Telegram or Drive access directly;
- bypass model eligibility or private access checks;
- write destructive state without explicit Per action handled by the canonical backend.

## UX rule

Per should not need to remember routes, backend ownership, or review choreography. AI may recommend the correct canonical destination, explain why, run automatic safety checks, and prepare the change. Per should normally see one meaningful confirmation point, while canonical backends retain authority.
