# HYPE_JOB_DAILY — Design Document

> Status: repo-agnostic design. Written without repo access.
> Save as: `docs/HYPE_JOB_DAILY_DESIGN.md`
>
> Convention: anything marked **verify in repo** is an unknown that must be resolved by reading the real code. Do not fill it in from assumption. Identifiers that appear here without that marker (`review_required`, `rate_review_required`, `customer_review_required`, `model_job_app_url`, `customer_confirmation_url`, `admin_job_url`) come from the owner brief and are output/label names, not confirmed storage field names.

---

## 1. Purpose

`HYPE_JOB_DAILY` is a guarded, once-per-ICT-day Telegram digest for Boss Per. It tells the owner what needs attention today across:

- Jobs today
- Upcoming jobs in the next 72 hours
- Pending payments
- Model readiness
- Customer follow-up risk
- Refund / credit / cancellation cases
- System blockers that affect real jobs

It is an **owner action digest**, not a dashboard. Every item ends in exactly one clear `Next:` action. When nothing is urgent, it still sends a short "no P0 today" digest. Silence must never be ambiguous between "nothing to do" and "the job did not run".

## 2. Non-goals

- Not a general dashboard, report, or analytics view.
- Not a customer-facing or model-facing message.
- Not an automation layer: it never sends rates, confirmations, reminders, or payment requests to customers or models.
- Not a source of truth. It reads truth; it never stores or overrides it.
- Not a refactor of Telegram, scheduling, payment, booking, entitlement, or identity code.
- Not a new Telegram destination. It reuses the existing canonical HYPE destination.
- Not a replacement for existing owner alerts. Do not duplicate them unless verified as intended.

## 3. Safety rules

1. **Read-only.** No writes to booking, payment, entitlement, model, customer, or pricing truth. No status transitions, no "mark as notified" flags on those records.
2. **Only permitted write:** the digest's own idempotency/run record (section 11), and only if a safe, project-consistent storage pattern exists.
3. **No guessing.** Ambiguous, missing, stale, or conflicting data is surfaced as `review_required`, never resolved silently.
4. **No invented data:** rates, model availability, payment status, customer identity, entitlement, confirmation status.
5. **No private/SIGIL exposure** in any public or customer-facing context. The digest is owner-only; still, do not print more private detail than the action requires. Verify in repo how SIGIL/private data is classified and which fields are safe for owner-thread display.
6. **Isolation.** A failure in the digest must not block or degrade other workers, routes, or scheduled handlers.
7. **No production deploy** (`wrangler deploy` is never run as part of this work). No production secrets read, printed, committed, or logged.
8. **No real Telegram sends from tests.** All sends are mocked.
9. **Do not alter** payment verification, booking confirmation, model approval, entitlement resolver, or customer identity resolver logic.

## 4. Data sources to look for once inside the repo

None of these are assumed to exist under any specific name. For each, record the file/module, the read interface, and its freshness guarantees.

| Need | What to find | Notes |
|---|---|---|
| Telegram send | Existing send helper(s) | Verify in repo. Reuse; do not add a second client. |
| HYPE destination | Canonical HYPE chat/thread routing constants or config | Verify in repo. Reuse only. |
| Scheduling | Existing scheduled/cron handler pattern and trigger config | Verify in repo. Include how multiple crons are dispatched and how errors are isolated. |
| Owner/daily summary precedent | Any existing digest or summary code | Reuse formatting helpers if they exist. |
| Jobs / bookings | Canonical job record and read path | Verify in repo. Includes job reference format, schedule fields, status vocabulary. |
| Payments | Canonical payment record and read path | Project rule: the payments service is the money source of truth; admin service and browser UI are not authoritative for payment. Verify in repo which module/route exposes read access and whether reading via service binding, API, or datastore is the sanctioned path. |
| Payment proof / review state | Where "proof uploaded" and "reviewed" are represented | Verify in repo. |
| Refund / credit / cancellation | Refund routes, "refund completed pack" shape | Verify in repo. Confirm how `customer_confirmation_url`, `admin_job_url`, `model_job_app_url` are produced. |
| Model readiness | Model confirmation state, connection state, Job App link helper | Verify in repo. Confirm how `model_job_app_url` is built or stored. |
| Customer identity + display | Identity resolver, Per Rename display logic | Verify in repo. Read-only use only. |
| Rate / quote history | Any record of base rates quoted by Per, historical payment/customer behavior | Verify in repo. May not exist. |
| Stale picker / recovery | Recovery case record, case reference, canonical refresh path | Verify in repo. |
| Idempotency storage | Existing KV/DB/queue/lock patterns | Verify in repo. |
| System blockers | Existing health/error/queue-failure signals | Verify in repo. Only include blockers that affect real jobs. |
| Test conventions | Runner, mocking approach, fixture style, file layout | Verify in repo. |

**Source priority:** follow the repo's existing canonical source priority. If two sources disagree, the higher-priority source wins only if the repo already defines that priority; otherwise flag `review_required` (see section 6).

## 5. Digest sections and priority rules

### 5.1 Section order (fixed)

1. `P0 NEEDS PER`
2. `JOBS TODAY`
3. `UPCOMING 72H`
4. `PAYMENT WATCH`
5. `MODEL WATCH`
6. `CUSTOMER WATCH`
7. `SYSTEM WATCH`
8. `HYPE SUMMARY`

Every section header always appears, even when empty (render an explicit "none" line with a `Next:` such as "no action"). Every item has exactly one `Next:`.

### 5.2 Message header

`🧾 HYPE JOB DAILY — <date ICT>` where the date is the ICT (UTC+7) calendar date used for the idempotency key. Verify in repo how ICT dates are currently derived, and reuse that.

### 5.3 Windows

- **Today:** jobs whose scheduled time falls within the current ICT calendar date.
- **Upcoming 72H:** jobs after today's window and within 72 hours of run time. Define the boundary once, document it, and test it (jobs exactly at the edge, jobs spanning midnight ICT). If the job time field is missing or unparseable, do not place the job in a window by guess; surface as `review_required`.
- Jobs already completed or cancelled are excluded from JOBS TODAY / UPCOMING 72H, but cancellation/refund cases needing owner action appear in PAYMENT WATCH or CUSTOMER WATCH. Verify in repo the status vocabulary before defining "completed" and "cancelled".

### 5.4 Priority ranking (P0 selection)

An item is **P0** if it threatens a real job today or moves real money without an owner decision. Candidate P0 classes, highest first:

1. Job today where money state blocks the job (unpaid or unconfirmed deposit, unreviewed payment proof).
2. Job today where the model is not confirmed or not connected.
3. Refund/credit/cancellation case awaiting owner action or with an incomplete pack.
4. Stale picker / recovery case with an unresolved owner decision.
5. System blocker preventing job-critical flows (payments, confirmations, notifications).
6. `review_required` on any job today.

Rules:

- Rank by proximity of job time first, then by class order above.
- Cap `P0 NEEDS PER` at a small fixed number (target 3, matching the format template). Overflow items remain in their own sections and are counted ("+N more in sections below"). The cap value is a design choice to confirm with the owner.
- An item appears in P0 **and** in its home section. P0 is a pointer list, not a move.
- If there are no P0 items, `P0 NEEDS PER` contains a single line: "no P0 today" with a `Next:` of no action (or the lowest-effort watch item).

### 5.5 Item content

- **JOBS TODAY:** job ref, customer display, model display, time, money summary (deposit/balance/status as read from payment truth), status, `Next:`.
- **UPCOMING 72H:** job ref, customer display, model display, time, status, `Next:`.
- **PAYMENT WATCH:** payment ref or job ref, amount (exactly as read, with currency), status, `Next:`.
- **MODEL WATCH:** model display, issue, `Next:`. Include `model_job_app_url` when the model is not connected and the URL is available.
- **CUSTOMER WATCH:** customer display, context/risk, `Next:`. Includes rate-review items and follow-up risk.
- **SYSTEM WATCH:** issue, job impact, `Next:` (owner/system action). Only job-affecting blockers.
- **HYPE SUMMARY:** up to three Thai-language priorities under "วันนี้ควรเคลียร์ก่อน:", derived from the P0 list. Summary text must not introduce facts absent from the sections above.

### 5.6 `Next:` action rules

- Exactly one action per item, imperative, owner-oriented (for example "review payment proof", "confirm with model", "decide on refund", "resolve recovery case").
- A `Next:` may recommend; it never claims something was done.
- Never phrase `Next:` as an instruction that would cause a mutation by HYPE itself.

### 5.7 Length and splitting

Telegram has a per-message size limit. Verify in repo whether an existing helper already handles splitting. If the digest can exceed the limit, split at section boundaries only, never mid-item, and keep the header on the first part. Idempotency covers the whole digest, not each part (see section 11).

## 6. `review_required` rules

Use `review_required` whenever HYPE cannot state a fact with confidence. Triggers:

- A required field is missing, null, or unparseable.
- Two authoritative sources disagree (for example job status vs payment status implying different states).
- Data is stale beyond the repo's defined freshness threshold (verify in repo; if none is defined, do not invent one silently — flag the gap in the implementation report).
- An identity, model, or payment cannot be uniquely matched to a job.
- A status value is not in the known vocabulary.
- A read from a source fails or times out.

Behavior:

- Render the affected item with the literal token `review_required` and a short reason, for example `review_required (payment source unreachable)`.
- The item still gets a `Next:`, typically "verify in admin" or "check source".
- A `review_required` item on a job today is P0-eligible (section 5.4).
- Specialized tokens: `customer_review_required` (identity ambiguity, section 9) and `rate_review_required` (rate context, section 9.3). These are `review_required` variants and count as such for P0 purposes.
- Partial failure: if one source fails, still send the digest, mark the affected items `review_required`, and add a SYSTEM WATCH entry. Do not skip the whole digest for one failed read, unless every source failed (then send a minimal digest whose only content is the SYSTEM WATCH failure).

## 7. Payment truth rules

- Payment status, amounts, deposit/balance, and proof-review state are read **only** from the project's payment source of truth. Project rule: the payments service is canonical money truth; admin service and browser UI are not authoritative. Verify in repo the exact module and sanctioned read path.
- HYPE must not derive payment state from job status, UI state, chat text, or customer claims.
- HYPE must not compute or "fix" amounts. Display what the source returns, with its currency. If deposit/balance cannot be read, show `review_required`.
- Distinct states that must not be conflated (verify in repo the real vocabulary and map, do not rename):
  - No payment requested/recorded
  - Payment requested, unpaid
  - Proof uploaded, not yet reviewed
  - Reviewed and accepted
  - Reviewed and rejected
  - Refund pending / refund completed
- "Proof uploaded but not reviewed" is an owner action (`Next:` review the proof). HYPE must not treat uploaded proof as paid.
- Refund completed pack: when present, include `customer_confirmation_url` and `admin_job_url`, plus `model_job_app_url` when relevant. If any expected URL is missing, flag `review_required (refund pack incomplete)` rather than constructing a URL. Verify in repo how these URLs are generated and whether they may be built at read time.
- Money is never inferred from absence: no record means "no record", not "unpaid" unless the source explicitly says so.

## 8. Model readiness rules

- Readiness is reported from the repo's model confirmation and connection state. HYPE does not infer availability.
- Distinguish (verify in repo which of these exist and how they are stored):
  - Model confirmation pending
  - Model confirmed
  - Model not connected (no Job App link established)
  - Model declined / unavailable
- If a model is **not connected**, include `model_job_app_url` when available. If unavailable, write `model_job_app_url: unavailable` and `Next:` should state that the link must be generated through the existing flow (not created by HYPE).
- If the model is unavailable or declined, HYPE does not suggest a replacement candidate. `Next:` is an owner decision.
- Model display uses the repo's existing model display convention. Verify in repo. Do not expose private/SIGIL attributes.

## 9. Customer display / Per Rename rules

### 9.1 Display

- Prefer the project's existing Per Rename display logic. Where available, show the value in the form `<Per Rename + date after name>`.
- Reuse the existing helper. Do not reimplement or approximate it. Verify in repo.
- If Per Rename is not available for a customer, use only whatever fallback the repo's existing logic already defines as safe. If no such fallback exists, or identity cannot be uniquely resolved, show `customer_review_required`.
- Never fall back to guessed, partial-match, or first-match names.

### 9.2 Ambiguity

Show `customer_review_required` when:

- More than one customer record could match the job.
- The job's customer reference is missing or dangling.
- Display data conflicts between sources.

`Next:` for these is an owner action (for example "confirm customer identity"). HYPE never resolves ambiguity itself and never calls the identity resolver in a mode that writes or merges.

### 9.3 Single model name / rate context

Applies when a customer asks about a single model name, or a job references a model with rate context.

1. If the model rate is **not over 20,000 THB**, look for historical payment/customer behavior where available and whether Per has previously quoted a base rate.
2. **Never quote or surface a rate higher than what Per has already quoted.**
3. If no reliable prior quote exists, mark `rate_review_required`.
4. HYPE only surfaces this as an owner action (for example "confirm base rate with Per before replying"). It never sends or drafts-and-sends a rate to a customer.
5. Where the model rate is over 20,000 THB, the same no-invention rule applies: display only a rate read from the canonical source, otherwise `rate_review_required`.
6. "Reliable prior quote" needs a definition from the repo: what record counts as a quote made by Per, and how recent. Verify in repo. If no such record exists, always `rate_review_required` and document the gap.

Open decision for owner: whether the rate itself may appear in the digest at all, or only the flag. Default to flag only, since the digest goal is action, not rate display.

## 10. Stale picker / recovery case rules

- A recovery case has a case reference. HYPE must **preserve that same reference** in every mention. It must not open, rename, or replace a case.
- Before reporting on a recovery/stale picker case, **refresh canonical truth first** through the repo's existing read path (job, payment, model state). If the refresh fails, report `review_required (refresh failed)`. Do not present pre-refresh state as current.
- HYPE must **not point to a new candidate** (a new model, slot, or job) unless the owner has taken that action. `Next:` is an owner decision such as "review recovery case <ref> and choose candidate".
- If the refreshed truth shows the case is already resolved, drop it or list it once as resolved. Verify in repo the resolution vocabulary.
- If the case record and canonical truth conflict, `review_required`.
- Stale detection: use the repo's existing definition of "stale picker". Verify in repo. Do not invent a time threshold.

## 11. Idempotency design options

**Requirement:** exactly one digest per ICT date, safe to retry, no duplicate sends, no blocking of other handlers.

**Key:** `HYPE_JOB_DAILY` + ICT date (`YYYY-MM-DD`). Derive the ICT date with the repo's existing ICT helper, not by ad-hoc offset math. Verify in repo.

**Run states:** `claimed` → `sent` | `failed`. Store timestamps and a small error summary on failure. Nothing else (no digest body, no PII beyond what the repo already stores in similar records).

### Option A — Claim-before-send in existing KV/DB (preferred if a suitable store exists)

1. Attempt an atomic create of the key with state `claimed`. If it already exists in `sent`, exit (no-op). If `claimed` and recent, exit. If `claimed` and stale, or `failed`, follow retry rules below.
2. Build digest (read-only).
3. Send to Telegram.
4. On success, set `sent` (with Telegram message id if returned). On failure, set `failed` with error summary.

Caveat: many KV stores are not strictly atomic. Verify in repo whether the store offers a true compare-and-set/conditional put. If not, document the residual race window and treat Option B as the stronger choice.

### Option B — Durable Object or equivalent single-writer lock

Serializes claim/send/mark per date. Strongest guarantee, but adds a new binding and class. Only use if the repo already uses this pattern or the owner explicitly approves adding it.

### Option C — Existing queue with dedupe key

If the repo already uses queues with message dedupe/idempotency keys, enqueue one message per ICT date. Verify in repo whether dedupe is supported and its window.

### Option D — Fallback when no safe persistent store exists

Do not silently invent a risky store. Implement the safest project-consistent version (for example relying on a single cron trigger plus in-memory guard), and **document the gap explicitly** in the implementation report, including what duplicate-send scenarios remain possible (cron double-fire, manual re-run, deploy overlap).

### Retry rules

- `sent` for today: never resend, including on manual re-run. A deliberate force-resend, if wanted, must be a separate, explicit, owner-only path (out of scope by default).
- `failed`: eligible for retry on the next trigger the same ICT day. Bound the number of attempts (value to confirm; do not invent a hidden default).
- `claimed` but stale (process died mid-run): define a claim timeout and treat as retryable. The timeout value is a design choice to confirm.
- Crossing midnight ICT: a retry after midnight for the previous date must not send under the new date's key silently. Decide explicitly whether late retries for yesterday are dropped or sent with a "late" marker.
- Multiple crons or environments must not share a key namespace incorrectly. Verify in repo how environments are separated.

## 12. Telegram send safety

- Reuse the existing send helper and canonical HYPE destination constants/config. Verify in repo. No new chat/thread IDs, no hardcoded IDs in the digest module.
- Owner-only destination. Confirm the destination is not a customer or model-visible chat.
- Message content: plain, compact, no secrets, no tokens, no full payment identifiers beyond what the owner needs. Follow the repo's existing escaping/parse-mode conventions (Markdown/HTML escaping of customer- and model-supplied strings). Verify in repo; unescaped names can break sends or inject formatting.
- **Failure handling:**
  - Catch send errors locally. Never let them propagate to the scheduler in a way that affects other handlers.
  - Log enough for retry/debugging: run key (date), attempt number, stage (build vs send), error class/message, HTTP status if available, message length, and whether the failure looks retryable. Do **not** log the bot token, full message body, or unnecessary customer PII.
  - Mark the run `failed` (Option A/B/C) so the next trigger can retry.
  - Distinguish build failure from send failure in logs.
- Rate-limit and timeout handling: respect the existing helper's behavior. Do not add unbounded retry loops inside a single invocation.
- **Tests:** the send function is always mocked/stubbed. Tests must fail loudly if any code path attempts a real network call to Telegram (for example by stubbing global fetch to throw). Verify in repo how the existing tests stub network calls.

## 13. Test matrix

Test paths, runner, and fixture style: **verify in repo**. Every test mocks Telegram. Assertions below are behavioral, not tied to any schema.

| # | Case | Setup (abstract) | Expected |
|---|---|---|---|
| 1 | Job today, pending model confirmation | Job today; model state = confirmation pending | Appears in JOBS TODAY and MODEL WATCH; P0-eligible; `Next:` asks owner to obtain/confirm model; no assumption of availability |
| 2 | Job today, unpaid deposit | Job today; payment source shows deposit unpaid | Appears in JOBS TODAY (Money shows unpaid) and PAYMENT WATCH; P0 ranked high; `Next:` is owner payment action |
| 3 | Payment proof uploaded, not reviewed | Payment source shows proof present, review pending | PAYMENT WATCH item; status shown as awaiting review, not paid; `Next:` review proof |
| 4 | Refund completed pack | Refund case with completed pack | Includes `customer_confirmation_url`, `admin_job_url`, and `model_job_app_url` when relevant; if any expected URL missing → `review_required (refund pack incomplete)`; no URL fabricated |
| 5 | Model not connected, URL available | Model not connected; `model_job_app_url` present | MODEL WATCH shows issue and the URL; `Next:` owner action |
| 5b | Model not connected, URL unavailable | Same, URL absent | Shows URL unavailable; `Next:` generate via existing flow; no constructed URL |
| 6 | Ambiguous customer identity | Multiple/no unique customer match | Shows `customer_review_required`; no guessed name; CUSTOMER WATCH entry; `Next:` confirm identity |
| 6b | Per Rename available | Rename data present | Display uses Per Rename with date after name, via existing helper |
| 7 | Stale picker / recovery case | Recovery case exists, stale | Canonical truth refreshed before reporting; same case reference preserved; no new candidate pointed to; `Next:` owner decision |
| 7b | Refresh fails | Recovery refresh errors | `review_required (refresh failed)`; pre-refresh state not presented as current |
| 8 | No active jobs | No jobs in either window, no watch items | All 8 headers present; "no P0 today"; each section has explicit none line + `Next:`; digest is still sent |
| 9 | Idempotency prevents duplicate | Run twice for same ICT date | Exactly one send; second run no-ops; state = `sent` |
| 9b | Retry after failure | First run send fails, second run same date | State `failed` then retried; single successful send; no duplicate |
| 9c | ICT date boundary | Run times around 00:00 ICT (UTC 17:00) | Correct date key on each side; no cross-date suppression or duplication |
| 9d | Stale claim | Claim exists but past timeout | Treated as retryable per chosen design |
| 10 | Telegram send failure logged safely | Mock send rejects/returns error | Error caught; run marked failed; log has date key, stage, attempt, error summary; log excludes token and full message body; other handlers unaffected |
| 11 | Telegram always mocked | Whole suite | No real network call possible (global network stub throws); send mock asserted with destination from existing constants |
| 12 | No mutation | Snapshot all source stores before/after generating digest | Booking, payment, customer, model, entitlement, pricing data byte-identical; only permitted write is the digest run record |
| 13 | Rate: no prior quote | Model rate context, no reliable prior quote | `rate_review_required`; no rate shown to be sent; owner action only |
| 14 | Rate: prior quote exists | Prior quote by Per exists | Nothing higher than prior quote is surfaced; no auto-send |
| 15 | Source failure isolation | One source (for example payments) throws | Digest still sends; affected items `review_required`; SYSTEM WATCH entry; no exception escapes |
| 16 | Conflicting sources | Job status and payment status conflict | `review_required` with reason; no silent resolution |
| 17 | Section order and `Next:` | Any digest | Sections appear in the required order; every item has exactly one `Next:` |
| 18 | Length splitting | Very large digest | Split only at section boundaries; header on first part; single idempotency record |
| 19 | Escaping | Names containing formatting characters | Output safe under the repo's parse mode |

## 14. Implementation checklist for the real repo session

**Before any edit**

- [ ] `pwd`, `git status`, then create branch `feat/hype-job-daily`.
- [ ] Confirm no `wrangler deploy` will be run, and no production secrets will be read or logged.
- [ ] Run repo discovery (Telegram, HYPE, cron, job, payment, refund files; `scheduled(` handlers; `[triggers]`/`crons` in `wrangler.toml`).
- [ ] Locate every row in the section 4 table and record findings. Mark anything not found as unknown.
- [ ] Report to owner: files/modules found, integration points, 5–8 bullet plan, test plan, list of unknowns to handle as `review_required`.
- [ ] Wait for plan approval before editing.

**Design decisions to confirm with owner**

- [ ] P0 cap (target 3) and overflow behavior.
- [ ] Whether rates may appear in the digest or only the `rate_review_required` flag.
- [ ] Idempotency option (A/B/C/D), claim timeout, retry attempt cap, and late-retry-after-midnight behavior.
- [ ] Send time (ICT) for the daily run.
- [ ] Definition of "stale picker" and "reliable prior quote" (must come from existing repo logic).

**Build**

- [ ] Read-only collectors per source, each returning data or an explicit failure result (no throwing across module boundaries).
- [ ] Pure builder that turns collected data into digest items with priority and `Next:`, applying `review_required` rules.
- [ ] Formatter producing the fixed section order, escaping, and splitting.
- [ ] Idempotent runner: claim → build → send → mark. Wrapped so failures are logged and isolated.
- [ ] Wire into the existing scheduled handler using the repo's dispatch pattern. Do not change unrelated handlers or routes.
- [ ] Reuse the existing Telegram helper and HYPE destination. No new destinations.

**Guardrails during build**

- [ ] No writes to booking/payment/customer/model/entitlement/pricing.
- [ ] Do not modify payment verification, booking confirmation, model approval, entitlement resolver, or customer identity resolver code.
- [ ] No invented field names, route shapes, or constants; every identifier traced to a repo file.

**Verify**

- [ ] Implement tests from section 13 following existing test conventions.
- [ ] Global network stub in tests; Telegram send mock asserted.
- [ ] Run the relevant test suite and the type/lint checks the repo already uses.
- [ ] Confirm no `wrangler deploy` was run.

**Report back**

- [ ] Branch name
- [ ] Files changed
- [ ] Behavior added
- [ ] Tests added/updated
- [ ] Test command and results
- [ ] Confirmation: no `wrangler deploy`
- [ ] Confirmation: Telegram sends mocked in tests
- [ ] Remaining gaps and manual config (for example cron trigger entry, storage binding, environment variables)

---

*End of design document.*