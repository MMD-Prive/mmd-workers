# MY MODEL LV9 travel — release candidate

Base: `ab8e99af7397a0b96d5386b851c795139e01c9b9` (merged Console V3 #2508; preserves #2509 and the compact V3 home).
This is new runtime functionality, separate from the earlier presentation-only V3 release. It is not a production acceptance receipt.

## Source and contract

| Surface/action | Owner and authority |
| --- | --- |
| MY MODEL Current Job | Existing Webflow skin; read-only compact ETA summary after the verified current-session event |
| Model Console | Existing Console owner; travel panel uses the model cookie and canonical assigned Model relation |
| Set ETA | Existing `send_eta` action → Events Worker → owned Jobs `eta_update`; 1–240 whole minutes |
| ETA clock | Shared absolute timestamp formatter; server-time reference, hour/minute boundaries, expired/arrived/unknown separated |
| Extra text/photos | `/v1/model/session/travel`; prepare → bounded upload → commit, with durable receipt and cancellation |
| Customer reads | `/api/member/app/session/travel` and `/travel/photo`; existing authenticated member-to-Session ownership |
| Customer UI | Existing MY MMD session panel and Worker LIFF Digital Home; no replacement app or duplicate LIFF initialization |
| LINE notice | Existing admin → member-dashboard-chat service binding, internal bearer auth and fresh canonical recipient lookup |

Every travel operation checks the exact canonical Session. Browser model/customer/recipient identifiers do not grant access. Ambiguous Session/Job bindings fail closed. Reassignment changes the binding digest, revokes old image reads and hides previous-owner submissions without resetting lifetime quotas.

The private `mmd-private-model-media` bucket is already bound as `PRIVATE_MODEL_MEDIA` to admin-worker and member-pages-worker. A separate `job-travel/v1/` journal uses atomic R2 conditional writes to reserve at most three messages and three photos per Session. Saved entries never expire or return quota. Reservations expire after ten minutes; deterministic object references allow cleanup on subsequent access after cancellation, timeout or interruption. There is no new database, public portfolio write or private-gallery quota/consent change.

Mixed submission consumes one text slot plus its photo count. Photo-only submissions consume no text slot. Idempotency includes model, Session, payload digest and current booking binding. The browser retains an unresolved receipt key and recovers it before retrying. Plain text uses DOM textContent. Images use the native file input, orientation-aware canvas re-encoding, JPEG structure/size/digest validation, metadata rejection and authenticated private reads. Unsupported HEIC decoding prompts selection of JPEG/PNG/WebP; physical iOS acceptance is pending.

LINE push uses one stable retry key and a durable delivery journal, never a model/MMS channel fallback. Saved data and LINE acceptance are separate. Delivery failure does not roll back a saved message. Countdown ticks never send notifications. Travel states and the existing payment/start-work gates retain their owners.

## Validation

- 152 focused tests passed locally: auth, customer privacy, quotas, concurrent last-slot claims, replay/conflict, upload validation/expiry, XSS, clock skew/boundaries, stale requests, lost-response recovery, original Console/skin/payout/payment regressions and LINE deduplication with mocked transport.
- Generated browser source is checked before bundling; Worker minification cannot rewrite names inside its serialized JavaScript.
- All four changed Workers passed Wrangler minified dry-run builds: admin-worker, events-worker, member-pages-worker, member-dashboard-chat-worker.
- Both Webflow candidates are generated from this source and checked below 50,000 UTF-8 bytes. Their exact size/hash is recorded with the PR evidence.
- No production records, real lifecycle actions, real file uploads or real customer LINE messages were used for testing.
- Connected and cloud browsers could not reach the local fixture server (`ERR_CONNECTION_REFUSED`). Responsive visual QA at 320/390/430/1280, physical LINE/iPhone picker acceptance and authenticated production acceptance remain open; jsdom is not equivalent evidence.

## Release dependencies and open limits

1. PR #2512 was merged as `d36c34d435ae87f990105fc2796c3d8803ce3af8` (tested head `d3db68b4cf97e2abceb83a3487d583b3e99b891f`). Merge is not a deployment/publish receipt. Inspect CI and approve the exact follow-up release separately from the prior V3 graphics save.
2. Deploy the changed backend owners as one reviewed source revision. Two new admin route patterns are prepared in wrangler.toml: both production hosts under `/v1/model/session/travel*`. Customer APIs reuse the existing member-app proxy prefix.
3. Verify the existing private bucket, canonical table mappings, admin → member-dashboard-chat service binding and shared internal authentication without exposing values. Do not invent or copy a token from the model/MMS world.
4. Update the two existing Webflow skin/runtime blocks in place from the generated candidates. Preserve the legacy auth/upload/runtime blocks. Inspect unrelated drafts and confirm the actual publish scope before any full-site publish.
5. Recheck active Worker version/source, route ownership, served markers/hashes on origin and both hosts, then controlled authenticated reads and physical LINE/iPhone acceptance.

Inherited ETA writes still use the existing Jobs events append path. This change does not claim to provide a transaction across all legacy Airtable lifecycle/event writers. The new message/photo quota and timeline do not depend on that capped events array. Notification retries occur through the same saved receipt; no new periodic delivery scheduler is enabled. These limits must remain explicit during release review.

Status: **CODE_READY / LOCAL_CHECKS_PASSED / NOT_PUBLISHED / HUMAN_ACCEPTANCE_PENDING**.

## 19 October follow-up (local source, not release acceptance)

Base `59f31465efcaa030624b15777fb87d32071e69e7` includes #2508/#2509/#2512. Regression-first checks reproduced `payment_status=unpaid` opening MISSION and legacy ETA projection ignoring lifecycle. The follow-up:

- Replaces substring payment matching with exact existing `paid`, `deposit_paid`, `verified`, `official_verified` evidence. Unknown/negative non-empty evidence vetoes conflicting positives; booking state never verifies payment. No payment write, ledger, payout or verification operation is changed.
- Shares #2509's customer lifecycle normalizer with travel reads; equivalent `on_the_way`/`en_route` aliases agree, while unknown/conflicting fields remain `checking`.
- Uses one authorized Jobs ETA resolver for `/current`, signed `/context` and `/travel`. No event on one matching Job is `missing`; missing/duplicate/wrong Job, malformed JSON or failed reads are `unavailable`. Arrived and later/terminal lifecycles cannot return an active countdown. Legacy field names remain available with shared hour/minute copy.
- Preserves signed-cookie-less context and authenticated owner-only travel/photo access. No second store, ETA writer, sender or scheduler is added.

Read-only Cloudflare metadata on 19 October showed these 100% allocations (not source-equivalence proof):

| Owner | Active version | Deployment |
| --- | --- | --- |
| admin-worker | `f09db2e6-c239-4891-b199-c8315dfc3ade` | `0c20988f-ede6-4395-b9c1-4ca829703b19` |
| events-worker | `d66f8b76-dbcb-4710-b8ca-5b45e0e1ddc4` | `d11c135d-e9e2-4c7b-99e5-e470cd656be9` |
| member-pages-worker | `a18a4c83-b0df-4d4a-b213-f58763721dd5` | `ce7b59a1-fd4a-40f5-9d0f-c5173b587356` |
| member-dashboard-chat-worker | `c49b5a43-5720-4a47-afe5-4b38cb091ca0` | `1349c377-6b45-403b-9232-01b7dc96aa73` |

The admin/member-pages allocations predate #2512. Do not claim that all four owners serve LV9 or overwrite the historical admin bundle without source pairing. Existing Console Footer staging has a separately identified composition defect (`$$` replacement); its corrected local artifact has not been saved/published. This follow-up does not retry that mutation. Production, responsive visual acceptance and physical LINE/iPhone acceptance remain open.
