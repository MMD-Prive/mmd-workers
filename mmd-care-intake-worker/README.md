# MMD Care Intake Worker

Fresh route-free Cloudflare Worker for MMD Private Care / SIGIL Complaint Evidence intake.

This worker exists because the older `sigil-worker` currently fails route reconciliation with Cloudflare `409 Conflict` at `/workers/scripts/sigil-worker/routes`. This worker does not declare custom routes, so it deploys through `workers.dev` without touching the conflicting SIGIL custom route layer.

## Endpoint

After deploy:

```txt
https://mmd-care-intake-worker.malemodel-bkk.workers.dev/member/api/recovery/complaint-evidence
```

Health check:

```txt
https://mmd-care-intake-worker.malemodel-bkk.workers.dev/ping
```

## Deploy

From repo root:

```bash
git pull
cd mmd-care-intake-worker
npm install
npm test
npx wrangler deploy --config ./wrangler.toml
```

## Webflow config

Use this on the complaint page root element:

```html
data-api-base="https://mmd-care-intake-worker.malemodel-bkk.workers.dev"
data-endpoint="/member/api/recovery/complaint-evidence"
```

## Test request

```bash
printf "fake png test" > test.png

curl -X POST "https://mmd-care-intake-worker.malemodel-bkk.workers.dev/member/api/recovery/complaint-evidence" \
  -H "X-MMD-Client: mmdprive-complaint-page" \
  -H "X-MMD-Route: /sigil/recovery/complaint" \
  -F "lane=client" \
  -F "token=test-token-001" \
  -F "session_id=sid-test-001" \
  -F "client_name=คุณเจต" \
  -F "model_name=Kenji" \
  -F "case_date=2026-07-10" \
  -F "case_time=21:30" \
  -F "case_location=Bangkok" \
  -F "client_statement=ต้องการให้ MMD ตรวจสอบเคสนี้" \
  -F "statement=Smoke test from fresh MMD care intake worker" \
  -F "workflow_status=received_with_evidence" \
  -F "next_step=mmd_assistant_review" \
  -F "final_approver=Boss Per" \
  -F "page=mmd-private-care-complaint-lv16" \
  -F "route=/sigil/recovery/complaint" \
  -F "client_evidence[]=@./test.png;type=image/png"
```

## Current storage behavior

The worker stores complaint metadata in KV and appends a safe board card to `SIGIL_BOARD_KV`.

It does not store raw evidence file bytes in KV. Production evidence archive should use private R2 or a Drive upload webhook.

Optional secrets:

```txt
COMPLAINT_GOOGLE_DRIVE_WEBHOOK_URL
COMPLAINT_TELEGRAM_WEBHOOK_URL
```

Optional dedicated KV:

```txt
SIGIL_COMPLAINT_KV
```

## Later custom route

After Cloudflare route conflict is cleared, add this route manually or in `wrangler.toml`:

```toml
routes = [
  { pattern = "sigil.mmdbkk.com/member/api/recovery/*", zone_name = "mmdbkk.com" }
]
```

Until then, keep this worker route-free.
