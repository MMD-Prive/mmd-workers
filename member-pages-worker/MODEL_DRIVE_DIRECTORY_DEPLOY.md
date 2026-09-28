# Model Drive Directory deployment marker

The member-pages-worker hosts the backend-only Google Drive directory used by `/internal/admin/model-link` for approved model-folder discovery.

Production verification is handled by `.github/workflows/model-drive-directory-production-smoke.yml` after `Deploy member-pages-worker` succeeds. The smoke must verify:

- unsigned workers.dev access fails closed;
- a signed backend request can search the current owner-reviewed approved inventory;
- the current stable `EMs16 Gohan` model root resolves under the reviewed Exclusive root;
- nested operational folders such as `Review EMs16 Gohan` are not promoted as model candidates;
- exact server-side re-resolution preserves the approved lane and `folder_scope_key`.

`Book EI` remains a useful non-blocking diagnostic because its historical Drive folder placement can drift independently of the canonical Airtable Model. A missing legacy Book EI Drive folder must not mark the whole Drive directory unhealthy when current approved inventory search and exact resolution are passing.

This file intentionally lives under `member-pages-worker/` so a smoke-workflow correction causes a fresh member-pages-worker deployment and production verification.
