# Payments Worker — Acceptance checks

This folder contains a simple test runner (`run-checks.sh`) to validate the payments flow endpoints
on your worker dev domain.

## Quick start
Install dependencies:
- curl
- jq

Run (example):
```bash
BASE_URL="https://payments-worker.malemodel-bkk.workers.dev" \
WEBFLOW_URL="https://mmdprive.webflow.io" \
JOB_ID="sample-job-123" \
./run-checks.sh
```

## Sprint 2C handoff

- Sprint 2C-1 dry-run baseline passed.
- Sprint 2C-2A commit guard passed.
- No production paid/verified mutation has been run.
- Controlled fixture commit smoke remains pending.
