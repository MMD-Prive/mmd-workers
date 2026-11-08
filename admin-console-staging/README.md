# Admin Console #3143 staging review

Proposed, inactive URL: `https://mmd-admin-console-3143-staging.malemodel-bkk.workers.dev/internal/admin/console?view=create-job`.

The build extracts PR #3143 head `217a23730c4c70a7f2cb68e550bf7a74227ae424`. Fetch that commit before building from a shallow checkout. The original Create Job page is used byte for byte. Only the generated copy is adapted: the exact staging host is allowed for Owner login, session signing and same-origin frames, and the Per Rename resolver's two Airtable reads are redirected to in-memory fixtures. The resolver still links an authoritative alias row to its canonical Client. Model search and Drive responses are fixture data. This checks the old form's filters and gallery behavior, not the live search index or Drive.

## Connections and boundaries

- Dedicated Worker with no custom routes, service or database bindings, cron, production secrets or production API credentials.
- Only the staging-specific `ADMIN_LOGIN_CREDENTIAL` and `ADMIN_SESSION_SECRET` are passed into the original Owner login. Both must exist; keep them separate from production. The staging session cookie is host-only.
- Approved surfaces are Console, original Create Job and a fixture-backed read-only Payments view for navigation. Unknown routes fail closed. The write gate rejects job creation, payment links and photo sync. The client-lookup POST is a fixture read.
- Browser resource policy confines requests and frames to the staging host. The Per Rename adapter serves synthetic rows locally; it does not call Airtable. Images are generated synthetic SVGs on the staging host.

## Preflight

```sh
node admin-console-staging/build.mjs
node --test admin-console-staging/preflight.test.mjs
cmp admin-worker/src/create-job-worker-page.js admin-console-staging/.build/admin-worker/src/create-job-worker-page.js
```

The last command assumes the checkout still has the pinned version of that file. No network access is needed when Git already has the pinned commit.

Before any separate release approval, verify the Worker name and URL, confirm there are no production bindings or credentials, and restrict access to approved testers. Configure the two staging-only secrets only after approval. After an approved staging release, repeat the authenticated browser checks against the actual Cloudflare URL with the Owner. Report Per Rename and canonical ID, Private/PN and Public/Event model search, five selectable images per gallery, and restored form state via Console Back and browser Back. Stop before creating a job. If any check finds a production target, stop; if staging was activated, isolate only the staging Worker under separate authorization.
