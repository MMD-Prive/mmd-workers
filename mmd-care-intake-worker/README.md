# mmd-care-intake-worker

Dedicated MMD Private Care / SĪGIL Complaint Evidence intake Worker for the Webflow page `/sigil/recovery/complaint`.

This Worker exists so complaint evidence submissions can run through a fresh `workers.dev` Worker first, without touching the older `sigil-worker`. The old `sigil-worker` currently has a Cloudflare route conflict where Wrangler deploy logs show `PUT /workers/scripts/sigil-worker/routes` returning `Conflict 409`, so this Worker intentionally has no custom routes.

Workers.dev API base:

```txt
https://mmd-care-intake-worker.malemodel-bkk.workers.dev
```

Webflow should call:

```html
data-api-base="https://mmd-care-intake-worker.malemodel-bkk.workers.dev"
data-endpoint="/member/api/recovery/complaint-evidence"
```

## Endpoints

- `GET /ping`
- `GET /health`
- `POST /member/api/recovery/complaint-evidence`

The complaint endpoint accepts only `multipart/form-data`. It stores metadata only in KV and does not store raw evidence file bytes in KV.

Optional future bindings and secrets may be added later, but they are not required for a basic workers.dev deploy:

- `SIGIL_COMPLAINT_KV`
- `COMPLAINT_GOOGLE_DRIVE_WEBHOOK_URL`
- `COMPLAINT_TELEGRAM_WEBHOOK_URL`

## Deploy

```bash
git pull
cd mmd-care-intake-worker
npm install
npm test
npx wrangler deploy --config ./wrangler.toml
```

Do not add custom routes to this Worker unless the Cloudflare route ownership plan is explicitly approved later.

## Health Test

```bash
curl -i "https://mmd-care-intake-worker.malemodel-bkk.workers.dev/ping"
```

## Webflow Config

```html
data-api-base="https://mmd-care-intake-worker.malemodel-bkk.workers.dev"
data-endpoint="/member/api/recovery/complaint-evidence"
```

## Full Curl Smoke Test

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
