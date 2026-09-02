# Kenji Folder Mention → Customer History Assessment v1

Status: **PROPOSED / INTERNAL-ONLY / NOT A CUSTOMER-FACING DECISION**

## Goal

When a customer mentions a model Folder name, Kenji should:

1. resolve the mention to one canonical model record;
2. read only the same customer's bounded prior conversation history;
3. redact personal/payment/location data;
4. classify explicit intent and safety signals;
5. choose a safe next action;
6. return only customer-safe wording, or route to a human.

A Folder name is a lookup signal. It is **not** proof of membership, payment, permission, availability, consent, or access.

## Existing boundaries

- LINE/chat-worker remains the public Kenji Voice.
- Console Inbox remains the source for raw inbound/outbound message records.
- member snapshot remains a sanitized summary layer.
- admin-worker/payments-worker remain the authority for membership, payment, availability, and access.
- Raw history must not be copied into the assessment record.
- The evaluator must not read model-private notes, admin notes, hidden availability, bank data, signed URLs, tokens, LINE IDs, Telegram IDs, phone numbers, or customer data from another identity.
- Kenji must not claim that a booking, payment, membership tier, or access right is confirmed from chat text.

## Request flow

```text
LINE message
  -> detect possible Folder mention
  -> exact canonical Folder resolution
  -> same-customer + same-channel history query (bounded)
  -> redact and normalize messages
  -> deterministic assessment
  -> verified backend check when required
  -> customer-safe reply OR internal human review
```

The worker adapter is responsible for authentication and scoping before calling the pure module in `src/kenji-folder-history-assessment.mjs`.

## Folder resolution

- Normalize Unicode, case, separators, and a leading `#`.
- Match against canonical `folder_name`, `model_key`, `display_name`, and approved aliases.
- Zero matches: ask for the exact Folder name.
- More than one match: ask a clarification question.
- One match: continue.
- Never fuzzy-match a customer message directly to a model, and never treat an alias collision as a match.

## History window

Default: the last 50 messages from the **same authenticated customer and same channel**, or the configured shorter retention window. The adapter must exclude:

- other customers;
- unverified forwarded text;
- admin/model internal notes;
- hidden availability;
- payment artifacts and identifiers;
- raw contact/location identifiers.

The assessment receives redacted message text only. The raw messages stay in the existing Console Inbox retention policy.

## Assessment output

The pure evaluator returns structured labels:

- `signals`: explicit booking, price, availability, preference, complaint, payment claim, privacy boundary, or safety concern.
- `readiness`: `actionable_request`, `interested_needs_clarification`, `no_clear_intent`, or `human_review`.
- `decision`: `clarify_model`, `safe_general_reply`, `backend_check_required`, or `internal_review`.
- `next_action`: the operational next step.
- `confidence`: low/medium/high based on exact match and explicit signals only.

The module is deterministic and side-effect-free. It does not call an LLM. A later LLM step, if approved, may summarize already-redacted text into these labels but may not grant access or make a final approval.

## Customer-facing behavior

Allowed:

- ask for an exact Folder name;
- give general, already-approved information;
- say that a verified availability/price check is needed;
- route a complaint or safety issue to the human team.

Not allowed:

- disclose customer history;
- reveal internal scores, risk labels, evidence, IDs, or private model data;
- confirm payment, membership, booking, availability, or access based on chat text;
- mention Airtable, worker names, internal tables, or hidden routing.

## Persistence proposal

When the adapter is implemented, persist only a redacted assessment record, for example in a dedicated table named `MMD — Kenji Customer History Assessments`:

- assessment_id
- request_id
- customer_id_hash
- conversation_id_hash
- model_key
- folder_status
- history_window
- history_message_count
- signals
- readiness
- decision
- next_action
- confidence
- policy_version
- review_status
- reviewed_by
- created_at
- expires_at

Do not store raw message text in this table. Do not store raw customer IDs or model-private notes.

## Rollout gates

1. Unit tests for normalization, collision handling, redaction, deterministic labels, and safe replies.
2. Adapter tests proving same-customer/same-channel scoping and no raw PII persistence.
3. Canary on one internal test conversation with customer-facing auto-reply disabled.
4. Human review of false positives/negatives.
5. Enable customer-facing general replies only after the above gates pass.

Current change implements only the pure policy module and unit tests. It does **not** wire an automatic history read, create Airtable tables, or change live LINE behavior.
