# Job-specific partner model selections

The Webflow page at `/partner/model-selection` displays one reviewed shortlist through a temporary link. It contains no model inventory or job data before validating that link.

The owner workspace is `/internal/admin/model-selections`. Its existing `mmd_admin_gate_v1` session is verified by the deployed admin worker through a service binding; this Worker holds no copy of the admin login secret. The owner reviews Airtable job history, selects exact photos, confirms they contain no private contact or payout details, and explicitly grants preview/download permissions for this job.

## Runtime

- `ADMIN`: service binding to `admin-worker`.
- `SHORTLIST_STORE`: existing private `mmd-private-model-media` R2 bucket, exclusively using `partner-shortlists/v1/` keys.
- `IMAGES`: Cloudflare Images binding, used once per imported photo to store an aspect-preserving preview bounded by 720 × 960 pixels. Import fails if the preview cannot be prepared.
- `BUILD_SHA`: release commit identifier for response verification.
- `src/worker.js`: entry point and owner-page gate.
- `src/index.js`: record, token, media, brief and selection API.
- `src/owner-page.js`: owner workspace.

The six narrow routes in `wrangler.toml` own only the shortlist APIs and owner workspace. Webflow continues to own the partner page. Existing Partner, Booking, payment, session, LINE and customer-discovery contracts are unchanged.

## Access and storage

The link uses `#s=<opaque-id>&t=<random-token>`. The page captures it before loading the app, removes the fragment from browser history, and keeps access only in that tab's session. API requests put the token in an Authorization header. Tokens are 256-bit random values; storage contains only SHA-256 hashes.

Every view, write, image preview and download rechecks the current record, token, state and expiry. Revocation and token rotation invalidate old access. Partner previews use private resized snapshots; original bytes are served only through the explicitly permitted download or owner route. Original source images and review flags remain unchanged. A previously downloaded file or screenshot cannot be recalled by closing its link.

Partner JSON has an explicit field allowlist. Owner payout caps, source/canonical IDs, contacts, slips and customer history are not included. Image approval must also inspect text inside the image itself: preserving authorized bytes cannot automatically remove printed private details.

Owner changes and partner submissions use R2 conditional ETags and revision numbers. Repeated identical selection submissions reuse their receipt. Replacing/removing selected photos clears the current selection while retaining private idempotency receipts.

## Validation and release

Run `npm test --prefix partner-shortlist-worker` and the adjacent Webflow DOM tests. The GitHub `Partner shortlist` workflow runs backend, owner and customer-page tests. Read back deployed bindings/version and verify the routes before publishing the Webflow page.

Generate the Webflow head/footer from the source in `webflow/partner/model-selection`. Update only page `6ae5a6835ffcb4a3740e0fdd` on site `68f879d546d2f4e2ab186e90`; use page-only publication when available. A full-site publish would include unrelated pending changes and is a separate decision.

Initial record provisioning may use exported `buildRecord(input)` through authenticated Cloudflare R2 management. Persist only its `record` at `PREFIX + 'records/' + record.id + '.json'`; return the separate raw token to the owner through the private delivery channel. Never commit job records, tokens or image bytes. There is no unauthenticated seed route.

### Explicit management import encoding

Authenticated owner-management tooling may import authorized image snapshots when its R2 transport supports ASCII bodies but cannot set custom metadata. This path is explicitly selected by `storageEncoding: "base64"` on each private original-photo or preview variant. Existing browser imports remain binary and retain all their size, content-type, hash-metadata and shortlist-association checks.

For this explicit encoding, store canonical padded RFC 4648 base64 with no whitespace at the existing private media or preview key and set R2 `httpMetadata.contentType` exactly to `application/x-mmd-base64`. The private variant's `bytes`, `contentType` and `sha256` describe the **decoded image**, not the transport text. Originals allow JPEG, PNG or WebP up to 10 MiB; partner previews require a separately prepared WebP image up to 2 MiB. Prepare previews with the same aspect-preserving 720 × 960 bound. The read path checks physical size, bounded input, canonical encoding, decoded length, image signature and actual SHA-256 before serving bytes, including for HEAD requests. Missing or invalid previews never fall back to originals.

Keep source provenance, the source-content hash, the basis for model identification, and the owner's job-specific photo/download grant in the private record. Preserve the actual review state; a supplied photo alone does not establish job history, availability, orientation or price. Upload and verify both variants before publishing the corresponding record change, and use the current revision/ETag to prevent overwriting concurrent updates. Neither provenance nor encoding details are projected to the partner. This compatibility adds no HTTP import route, authentication alternative or public asset URL.

## Operating the page

Create the job with the known brief, budget, private payout cap and expiry. Unknown time, location and duration remain empty until the partner supplies them. The partner may submit a brief while the owner reviews photos. Available model photos alone do not establish current availability, orientation, service scope or price.

From the owner workspace, select the job, search its reviewed model, select permitted images and display fields, and save. The existing temporary link receives those reviewed choices. Closing the link stops future access to its information and images.
