# Create Job V11 reconstruction for review

The owner selected **LV11 Owner Composer**, PR [1908](https://github.com/MMD-Prive/mmd-workers/pull/1908), merge commit [`351ce1ade98ef5c8ce6749c6f29016255e82a70b`](https://github.com/MMD-Prive/mmd-workers/commit/351ce1ade98ef5c8ce6749c6f29016255e82a70b), as the baseline where customer and model lookup previously worked. Keep this explicit pin; do not replace it with the latest version automatically.

This folder reconstructs a complete review form from that commit's runtime DOM contracts. **It is not a byte-identical backup of the original Webflow page.** The original full form HTML, base stylesheet, root configuration and script installation order were not recovered. `template.html`, `base.css`, bootstrap configuration and the chosen order (runtime → v8 model alias fallback → owner composer) are new reconstruction work. No production route or backend is changed by this folder.

## Exact recovered source

The four `source/` files are unmodified Git blobs from the selected commit. `review.test.mjs` verifies their Git blob hashes.

| File | Git blob SHA |
| --- | --- |
| lv10-runtime-v11.js | 10af5235ae079f06664e4d01f554bbe145b7e431 |
| lv11-owner-composer-v1.css | c447358e65c0f730b71fe9d7ee285a889bc9e7eb |
| lv11-owner-composer-v1.js | 14ac3793c837e7025bbb641b83d043aa5deb217f |
| model-search-case-alias-fix-v8.js | 0dc98a4074f39c675ef0ee193e706ecefee23f20 |

The complete canonical owner-composer mirror is described in [the architecture note at the pinned commit](https://github.com/MMD-Prive/mmd-workers/blob/351ce1ade98ef5c8ce6749c6f29016255e82a70b/docs/architecture/CREATE_JOB_LV11_OWNER_COMPOSER_20260928.md).

## Run locally

From this folder with Node 20+:

```sh
npm install
npm test
npm run build
npm run serve
```

Open `http://127.0.0.1:4187/internal/admin/jobs/create-job`. Search `Synthetic` for the customer; choose Private / Exclusive / Straight / PN; search `Synthetic Model`; enter a location, start time, price and model payout; continue to Review. The local server uses synthetic records only, never forwards requests, and blocks every creation, publish, photo-sync or unknown endpoint. It can safely demonstrate a failed create request without creating records. `review.html` is generated and ignored.

The Board handoff points to `/internal/admin/jobs/job-board`, with Public and Private handled by the separate existing Board. The local review server deliberately returns an explanatory response for that handoff because the Board is outside this reconstruction.

## Acceptance and remaining live gate

Synthetic tests cover canonical customer request flags and selection, private model request scope and canonical ID, navigation through Review, absent Admin session, manual-client blocking, empty results, guarded exact-alias inventory fallback, denied access and draft restoration without trusting stored identities. They do not assert that a specific real customer exists, that membership eligibility passes, or that production creation works.

The owner previously accepted V11 lookup behavior. That historical acceptance plus exact source provenance identifies the baseline; it does not establish current live behavior. A current authenticated Admin session was unavailable. The next live verification must use the pinned reconstruction, approved existing authentication and read-only customer/model searches, then stop before submitting. Do not create or merge identities, grant membership, infer a missing customer's tier, or change backend eligibility to make lookup pass.

Known inherited behavior: the archived composer can select the first returned row when resuming a draft if its stored identity hint does not match. This has not been changed to maintain source fidelity; production integration should review it separately. The archived gallery includes a photo-sync request, so live lookup validation must avoid gallery/photo-sync actions. Only the local mock transport is a write barrier; do not install this review artifact on production without a separately reviewed integration.
