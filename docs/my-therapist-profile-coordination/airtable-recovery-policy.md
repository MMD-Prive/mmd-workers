# Airtable outcome and recovery policy — REVIEW POLICY

Decision prepared 2026-11-03, Asia/Bangkok. This policy is local; it neither grants production access nor unlocks an account. No production operation was inspected or changed.

## Chosen policy

**Fail closed for an ambiguous dispatched PATCH. Resume only a provably safe recorded operation.** Elapsed time, an equal GET, a screenshot, a healthy status page, a generic HTTP 4xx, a rate-limit backoff interval, or operator approval alone does not prove that the original attempt cannot still apply later. No automatic unlock or blind PATCH retry is permitted.

The policy favors data integrity over availability for the affected owner. Other owners remain available. Current directory behavior returns an unavailable response if a selected owner's snapshot cannot be read; it does not present a partial entry. Reducing that directory-wide availability impact is a separate UX decision, not an excuse to bypass the pending guard.

## Outcome table and current implementation

| Durable state / evidence | Permitted behavior | Forbidden behavior |
|---|---|---|
| Transient failure before a durable plan exists; no external mutation was issued | Exact same operation ID, payload fingerprint and unchanged revision may prepare again. Preserve identity; reject changed payload or later revision. | Caching this transient failure forever; rebasing silently onto a newer revision |
| `prepared` intent, no dispatched PATCH marker | Resume the same bounded intent under owner coordination | Starting a different operation or recomputing a stale whole-profile payload |
| Complete, recognized validation rejection: HTTP 422, JSON, `error.type` exactly `UNKNOWN_FIELD_NAME` or `INVALID_REQUEST_BODY` | Persist terminal rejection; atomically store failure receipt and clear pending. A later deliberate submission uses a new operation ID and fresh state. | Treating the rejected intent as successful or writing its R2 manifest on recovery |
| `airtable_inflight` / `airtable_unknown`; transport loss, timeout, nonmatching/malformed success, HTML, unrecognized errors, or non-whitelisted response | Quarantine the owner; retain journal and intended fields. Same-ID retry may return diagnostic uncertainty but must not issue PATCH. GET/media/directory and later writes stay fail closed. | Release after a timer; infer failure/success from GET; delete pending; replay a newer or older success receipt |
| `airtable_saved`: exact provider response acknowledged and persisted | Resume original R2 intent with recorded ETag/conditional creation, never PATCH again | Replacing it with newly read/stale full-profile data |
| R2 acknowledgement unknown | Read exact intended serialized value or use its original conditional write; same operation only | Unconditional overwrite or an unrelated operation overtaking it |
| `manifest_saved`, byte cleanup incomplete | Same delete operation resumes idempotent cleanup; tombstone stays durable | Reattaching the deleted upload identity |
| `rejected` persisted but receipt cleanup interrupted | Terminal failure before any effects; finish failure receipt cleanup | Falling through to manifest persistence / 200 |
| Unknown/corrupt phase or owner/record mismatch | Quarantine and investigate | Guessing a safe phase or moving the operation to a new record/owner |

Before replay or recovery, the coordinator checks the persisted journal envelope: owner, bounded integer revision, pending identity/fingerprint/revision, and the phase/plan relationship. Only `validating` may lack a plan. A missing plan in any later phase, an unknown phase or inconsistent revision returns `503 PROFILE_JOURNAL_INVALID` without replacing the journal, starting effects or initializing a new owner over it. A structurally valid `validating` intent may still prepare the exact same request after a crash. This is an integrity guard, not a proof that arbitrary out-of-band storage edits can be repaired safely.

The two rejection identifiers are a deliberately narrow allowlist, not an exhaustive claim about Airtable errors. Other definitive categories may be added only after documented review and a regression proving their semantics. Error bodies are not logged or sent to the browser.

Official reference checked 2026-11-03: Airtable distinguishes status codes from JSON error identifiers and documents validation failures; it also documents request timeouts separately from rate limiting. Those pages do not provide this implementation with an operation-correlated terminal-status/fencing contract. The no-blind-retry policy is our conservative consistency rule, not a claim that Airtable's general retry guidance mandates permanent quarantine.

- https://support.airtable.com/articles/2111090641-airtable-api-common-troubleshooting
- https://support.airtable.com/articles/7735693959-managing-api-call-limits-in-airtable

## Operational procedure for an unknown outcome

1. Keep the owner frozen. Preserve pending intent, fingerprint, revision, record identity, phase and receipts. Do not change Matching, availability, Hidden, account links or other business gates.
2. Open a reconciliation case with minimal identifiers: opaque owner/operation references, fingerprint, phase, expected revision, target record reference and an approved evidence reference. No cookies, tokens, LINE subjects, raw response headers, full profile contents or real chat text in logs. Real inspection/support submission needs its own authorization; none occurs in this local task.
3. Obtain authoritative evidence correlating the **exact original attempt** and establishing a terminal result **and that no delayed effect from that attempt can still occur**. A readback or human assertion is insufficient. Provider support/audit evidence is only acceptable if its scope and guarantees actually establish this; do not assume such evidence is obtainable.
4. If no such proof is available, the case remains `QUARANTINED_UNRESOLVED`. There is no timeout-based escape. If this availability tradeoff is unacceptable, redesign the authority/fencing boundary separately; do not weaken the journal.
5. A separately implemented, reviewed and authorized settlement mechanism may propose one of the following, but **cannot be invoked in current code**:
   - **Confirmed applied:** confirm owner/record/operation/fingerprint/revision still match, no competing external writes, current intended Airtable fields match and original R2 precondition remains valid. Transition only that pending intent to `airtable_saved` inside the owner queue, audit the proof digest, and resume its original conditional R2 stage. Never PATCH again.
   - **Confirmed rejected with no effects:** record a terminal failed operation and atomically clear only its pending marker. Require fresh read/new operation identity for another attempt. Do not commit its R2 payload.
   - **Conflict / different values / uncertain correlation:** retain quarantine. Never “repair” unrelated fields or silently roll back data.
6. Settlement must be mediated by the existing owner coordinator with compare-and-check of the pending identity. Direct Cloudflare storage edits, `pending=null` scripts and generic `force_unlock` endpoints are forbidden. Boss Per's approval authorizes an action; it is not evidence that the provider operation has settled.

## What exists and what is still only a plan

Implemented and tested locally: the outcome table's automatic safe paths, persistent quarantine, same-intent R2 recovery, terminal rejection recovery and pre-intent transient retry.

**Not implemented:** provider evidence verifier, operator reconciliation UI/API, production inspector, external support transmission or a live settlement action. This task defines the requirements; it does not grant admin permissions or claim unknown Airtable outcomes can already be cleared. Release remains NO-GO until this operating model is explicitly accepted or an authorized settlement design is implemented and validated.

Journal/tombstone retention: no silent expiry. Do not delete the only identity record that prevents replay/resurrection. A future compaction policy may remove private result payloads for superseded receipts only while preserving the immutable identity/fingerprint/outcome needed to reject their reuse. No compaction was added or run.
