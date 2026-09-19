# Model Drive Directory deployment marker

The member-pages-worker hosts the backend-only Google Drive directory used by `/internal/admin/model-link` for approved Public/Private model folder discovery.

Production verification is handled by `.github/workflows/model-drive-directory-production-smoke.yml` after `Deploy member-pages-worker` succeeds. The smoke must verify:

- unsigned workers.dev access fails closed;
- a signed backend request can search the approved Private Models tree;
- the current `Book EI` folder resolves by exact Drive folder ID;
- exact server-side re-resolution preserves the Private lane before any canonical Model materialization.

This file intentionally lives under `member-pages-worker/` so a smoke-workflow correction also causes a fresh member-pages-worker deployment and production verification.