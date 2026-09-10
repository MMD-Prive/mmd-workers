# Create Job and payment contract

The active route is `POST /v1/admin/job/create` through the credential-bound admin wrapper. The nested Create Job form is normalized at ingress before canonical identity validation, private-access checks and payment issuance.

| Context | Client requirement | Result |
| --- | --- | --- |
| `/internal/admin/jobs/create-job` | Canonical Client record selected and validated server-side | Normal Session, Job and pending Payment with confirmation links |
| SIGIL explicit `pending_client_link`, no canonical Client | Name snapshot allowed | Session and Job saved; no Payment, confirmation token, notification or reconfirm schedule |
| Linked private job | Canonical identity plus authoritative private-access gate | Existing access policy remains authoritative |

Strict lookup returns no canonical records when only a manual or staging candidate exists. LINE suggestions are separate evidence requiring an operator Link/Reconcile decision. Names never auto-link a Client.

Pending creation sends a `held_job` envelope to the issuer. An older issuer sees no required top-level client fields and rejects before writing. The new issuer persists a hold marker in Session notes and returns `payment_ref: null`. This makes staggered admin/payments deployments fail safely. It does not automatically release an existing held job when a Client is later linked; release must separately validate identity and applicable access before issuing links.

The form's Client, LINE identity, Model, schedule, location and notes map to the legacy core contract. Model payout is stored on Sessions only. For a combined membership renewal, Session amount and Job Budget contain service money, while Payment contains the customer total. The membership marker stays on its own line so verification can parse it. Creation never grants membership, points or rewards; official payment verification is still authoritative.

The UI prevents repeated submission while creating and after success. Notification failure reports a successful create requiring attention. An uncertain partial write returns available session/payment references and blocks automatic retry. This is not a global idempotency guarantee across tabs, reloads or other clients; inspect existing records before submitting an uncertain create again.

`admin-worker/job-create-flow.test.mjs` executes the active admin and payment workers against in-memory Airtable/KV and notification fixtures. It covers linked creation, pending public/private creation, strict rejection, overnight times, model payout, combined renewal, notification failure and partial writes. UI behavior is covered by `immigrate-worker/test/create-job-canonical-client.test.mjs`.

The earlier authorization to probe the diagnostic with `{}` without creating payments or Job 1/Job 2 applied to that diagnostic operation. It is not a permanent prohibition on normal payment/job functionality. Tests for this patch use fixtures and do not create production business records.
