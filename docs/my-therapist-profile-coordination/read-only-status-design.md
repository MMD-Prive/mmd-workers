# Read-only status inspector — design only

Implemented locally: private binding RPC `inspect(owner)` on the existing coordinator class. No public HTTP endpoint or new caller permissions are introduced. Only trusted Worker code holding the private binding may select an owner; a future HTTP facade must use the existing internal authorization boundary and must not forward a client-selected storage key. No secret, LINE subject, record contents, photo contents or chat text in output.

The RPC waits for the owner queue, reads owner/revision/pending together using a bounded multi-key get, and returns a redacted summary. Constructor and inspection perform no persistent write. Missing state returns NOT_OBSERVED; corrupt state returns CORRUPT; a stored owner mismatch returns DENIED. An invalid input is rejected before storage access. It never emits DRAINED. Receipt payloads and operation identities are deliberately omitted. The dormant bootstrap does not implement this RPC; callers must treat method absence as UNAVAILABLE, never as an empty successful inventory.

Local rehearsal in artifacts/profile-state-switch uses test-only seed/snapshot routes, never included in product source. Six synthetic states cross bootstrap → active coordinator → paused corrective code with the same persisted SQLite namespace. Thirty checks verify journal, receipts and tombstones remain equal and inspection changes no keys. Source targeted tests pass separately. Cached workerd compatibility 2026-06-11 is not production equivalence with 2026-08-21; real Cloudflare version switching and provider in-flight requests remain unproven.

## Semantics

The existing coordinator GET is not a pure inspector: it initializes a missing owner marker. A future dedicated internal inspection method must read only existing durable keys (owner, revision, pending and the requested receipt), without invoking profile handlers, recovery, fetch-to-Airtable, storage.put/delete, alarms or receipt cleanup. A missing object must return UNKNOWN/NOT_OBSERVED, not create revision zero and not imply idle. Routing to an object may activate an instance; validate the constructor remains storage-write-free before approving implementation. Do not scan unknown owner names or use public HTTP to enumerate accounts.

Return a bounded summary: schema version, opaque operation reference, revision validity, phase, pending-present flag, plan-present flag, protocol version, local pause policy and observed-at timestamp. Mask/hash references under an approved privacy policy; omit intended field values and cached response bodies. If data is corrupt, return CORRUPT without repair. Never clear pending, advance phase, resume a write or unlock an owner on inspection.

Interpretation: pending = unresolved until trusted terminal evidence; absent pending = no local pending marker observed, not proof of external drain. Legacy production has no complete journal, so its external outstanding count is UNKNOWN. Missing binding is UNAVAILABLE, not an empty successful inventory. A read-only observation cannot fence another writer that starts after the observation.

## Release use and required tests before implementation

1. Report each write boundary separately: profile HTTP, Back Office Therapist PATCH, approval/promotion, external/manual writers. Local flag status is not proof all deployed versions/external writers honor it.
2. Prove a no-write storage fake rejects every put/delete/alarm/transaction mutation during inspection, including missing/corrupt state; reject foreign owner and unauthorized caller before inspection.
3. For prepared, inflight, unknown, saved, rejected and completed states, verify inspection preserves storage byte-for-byte, performs no Airtable/R2 mutation and never invokes recovery. Test concurrent writes: report an observation, not a global drain guarantee.
4. Do not declare DRAINED unless every writer is fenced and all older dispatched effects have terminal evidence. Provide UNKNOWN when legacy records or external consumers lack that evidence.

## Local pause patch scope

MMS_PROFILE_WRITES_PAUSED=true gates the profile handler, authenticated internal Back Office Therapist PATCH (all fields), and approval/promotion before even the Applications PATCH. Non-promotion review and read paths retain their existing authorization and behavior. A defensive guard also sits at the promotion function boundary.

This does not pause external Airtable/R2 clients or cancel already-dispatched operations. The previously assembled baseline bootstrap artifacts must be rebuilt with these additional admin guards before they can be used as a complete pause candidate; those earlier artifacts are not updated or approved by this design. No production flag/config/deployment change is made here.
