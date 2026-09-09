# MMD Model Pre-job Reconfirm V1

Status: implementation PR baseline. The job/session lifecycle remains authoritative in the existing Workers; reconfirm is acknowledgement metadata only.

## Ownership

- `/internal/admin/jobs/create-session` is the operator UI that supplies the canonical service date/time.
- `POST /v1/admin/job/create` remains the canonical create endpoint and is the source event for reconfirm scheduling.
- Cloudflare Workers compute all reconfirm times. Lovable/Webflow must not submit or calculate reconfirm timestamps.
- MMD MODEL / Model Dashboard displays backend reconfirm state and sends acknowledgement only.
- `events-worker` owns the existing 15-minute scheduled clock used to send due notifications/escalations.
- Customer UI is read-only for reassurance. It must never infer acknowledgement from local state.

## Canonical policy — Asia/Bangkok

For a job on day D:

1. **D-1 16:00** — notify the assigned Model about tomorrow's job and ask them to tap `รับทราบงานแล้ว`.
2. **D-1 18:00** — send a second reminder if acknowledgement is still missing.
3. **D-1 19:00** — if still missing, create an internal MMD/Per/Ops Amber escalation: `Reconfirm Overdue`.

The 19:00 event is an internal risk signal only. It does not cancel the job, does not mark the Model as no-show, and must not alarm the customer by saying the job has failed.

## Lifecycle rule

Reconfirm does **not** add another canonical job lifecycle state.

The job remains `confirmed` while reconfirm is scheduled/pending/overdue/acknowledged. The existing lifecycle continues separately:

`confirmed -> en_route -> nearby -> arrived -> met_customer -> final_payment_pending -> final_payment_confirmed -> work_started -> work_finished -> separated`

The Model action is additive metadata only:

`POST /v1/model/session/action`

```json
{
  "action": "acknowledge_reconfirm",
  "session_id": "..."
}
```

The handler must authenticate the real Model session, re-read the canonical current session, require lifecycle `confirmed`, and must not write a lifecycle transition.

## API response contract

`POST /v1/admin/job/create` may return:

```json
{
  "ok": true,
  "session_id": "...",
  "reconfirm": {
    "status": "scheduled",
    "required_at": "2026-09-05T16:00:00+07:00",
    "reminder_at": "2026-09-05T18:00:00+07:00",
    "overdue_at": "2026-09-05T19:00:00+07:00",
    "notified_at": null,
    "reminder_notified_at": null,
    "acknowledged_at": null,
    "ops_alerted_at": null,
    "followup_status": "none",
    "risk_level": "normal",
    "backup_required": false
  }
}
```

`GET /v1/model/session/current` exposes the same `session.reconfirm` object and flat compatibility keys required by the current Lovable Model Hub. While the lifecycle is still `confirmed` and reconfirm is open, `allowed_actions` includes `acknowledge_reconfirm`.

## Session storage fields

The implementation uses additive fields on the canonical Sessions record. They can be remapped by env vars.

| Default field | Env override |
| --- | --- |
| `reconfirm_status` | `AT_SESSIONS__RECONFIRM_STATUS` |
| `reconfirm_required_at` | `AT_SESSIONS__RECONFIRM_REQUIRED_AT` |
| `reconfirm_reminder_at` | `AT_SESSIONS__RECONFIRM_REMINDER_AT` |
| `reconfirm_overdue_at` | `AT_SESSIONS__RECONFIRM_OVERDUE_AT` |
| `reconfirm_notified_at` | `AT_SESSIONS__RECONFIRM_NOTIFIED_AT` |
| `reconfirm_reminder_notified_at` | `AT_SESSIONS__RECONFIRM_REMINDER_NOTIFIED_AT` |
| `reconfirm_acknowledged_at` | `AT_SESSIONS__RECONFIRM_ACKNOWLEDGED_AT` |
| `reconfirm_followup_status` | `AT_SESSIONS__RECONFIRM_FOLLOWUP_STATUS` |
| `reconfirm_risk_level` | `AT_SESSIONS__RECONFIRM_RISK_LEVEL` |
| `reconfirm_backup_required` | `AT_SESSIONS__RECONFIRM_BACKUP_REQUIRED` |
| `reconfirm_ops_alerted_at` | `AT_SESSIONS__RECONFIRM_OPS_ALERTED_AT` |

If these fields are not ready, successful job creation must remain successful. The response reports `reconfirm: null` plus `reconfirm_schema_not_ready`; the system must never roll back or duplicate a real booking only because the additive reconfirm layer is unavailable.

## Notification prerequisites

The scheduled sweep is deliberately feature-gated:

`MODEL_RECONFIRM_ENABLED=false` by default.

Before enabling it on `events-worker`, provision/verify:

- `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID`, `AIRTABLE_TABLE_SESSIONS`, `AIRTABLE_TABLE_MODELS`
- canonical Session field mappings, including `AT_SESSIONS__JOB_DATE` and `AT_SESSIONS__MODEL_RECORD_ID`
- `MODEL_LINE_CHANNEL_ACCESS_TOKEN` or `LINE_CHANNEL_ACCESS_TOKEN` for Model LINE push
- `TELEGRAM_INTERNAL_SEND_URL`
- `AUTH_SERVICE_EVENTS_TO_TELEGRAM` (preferred) or the established studio-to-Telegram service auth
- an internal booking/admin Telegram chat id

The scheduler does not notify customers.

## Change / cancellation semantics

A canonical future job-date update must recompute the D-1 schedule. A cancellation or assigned-Model replacement must invalidate the previous reconfirm schedule before a new one is issued. The current Create Session route is wired in this PR; any later canonical session-update endpoint must call the same reconfirm policy rather than implementing its own browser timing.

A job created after D-1 16:00 is eligible for the next scheduler sweep immediately; it must not wait until another calendar day.

## Safety / acceptance

- No browser timer is authoritative.
- No acknowledgement in localStorage/sessionStorage.
- No customer alarm at 19:00.
- No automatic cancellation from missing acknowledgement.
- No Model-side action may mark final payment confirmed.
- Reconfirm acknowledgement must not change `confirmed` to another lifecycle state.
- Scheduler is idempotent through persisted notification/ack/escalation timestamps.
