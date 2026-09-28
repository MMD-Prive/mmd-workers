# Internal Owner Snapshot V1

`GET /v1/internal/owner/snapshot`

Fast App Runtime V1 read model for MMD Internal OS.

## Purpose

A lightweight, read-only projection for owner-facing app-shell surfaces. It lets Internal OS show menu, shortcuts, and bounded counts without loading the full dashboard payload on every page.

## Authority

- Projection only: `read_only: true`, `no_business_truth: true`.
- Source remains `admin-worker` canonical dashboard serialization.
- `immigrate-worker` only bridges the credential-bound browser request and strips the heavy payload into fixed fields.
- No payment, entitlement, session, model, access, payout, or job-board action may use this snapshot as business truth.

## Auth and routing

- Same credential-bound admin browser session as `/v1/admin/dashboard`.
- Browser credentials such as `Authorization` and `X-Confirm-Key` are stripped before the ADMIN_WORKER service binding call.
- Public hosts only: `mmdbkk.com` and `www.mmdbkk.com`.
- Routes are narrow: `mmdbkk.com/v1/internal/owner/snapshot*` and `www.mmdbkk.com/v1/internal/owner/snapshot*`.

## Response shape

```json
{
  "ok": true,
  "schema": "mmd.internal.owner.snapshot.v1",
  "source": "admin-worker",
  "projection": "immigrate-worker",
  "read_only": true,
  "no_business_truth": true,
  "generated_at": "...",
  "dashboard_generated_at": "...",
  "counts": {
    "payment_slip_inbox": 0,
    "money_control": 0,
    "model_assets_pending": null,
    "jobs_need_confirm": 0,
    "membership_review": 0,
    "historical_recovery": 0
  },
  "sections": {
    "payment_slip_inbox": { "label": "Payment Slip Inbox", "href": "/internal/ceo/payment-slip-inbox", "count": 0, "authority": "payment-review-runtime", "read_only": true },
    "money_control": { "label": "Money Control", "href": "/internal/admin/payments", "count": 0, "authority": "payment-review-runtime", "read_only": true },
    "create_job": { "label": "Create Job", "href": "/internal/admin/jobs/create-job", "count": null, "authority": "admin-worker", "read_only": true },
    "model_assets": { "label": "Model Assets / Studio", "href": "/internal/ceo/models", "count": null, "authority": "model-owner-review-queue", "read_only": true },
    "hype_henna": { "label": "HYPE + HENNA", "href": "/internal/admin/telegram-brief", "count": null, "authority": "telegram-router-health", "read_only": true }
  },
  "status": { "payments": "พร้อม", "telegram": "พร้อม", "data": "ok", "reconfirm": "พร้อม", "control_room_phase": "CLOSED" },
  "unavailable_sections": []
}
```

Missing or unbounded counts are `null`, not fake zero. A returned `0` is allowed only when it is a bounded value from the canonical dashboard.
