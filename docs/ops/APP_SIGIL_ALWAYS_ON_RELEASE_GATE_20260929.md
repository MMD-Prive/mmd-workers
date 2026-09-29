# APP + SIGIL Search Always-on Campaign Release Gate

Owner intent: performance and UI work are not enough to call the APP campaign ready. The campaign can become always-on only after genuine production acceptance proves the customer and Model paths that the ad will send traffic into.

## Required order

1. Production route/deploy smoke is green.
2. A genuine LINE -> LIFF -> verified session chain completes without synthetic identity.
3. MY MMD reads the same customer's current history, Points and Customer Requests from canonical backend truth.
4. MMD APP preserves a real Job Board/job handoff into the exact authenticated Model job.
5. SIGIL Search returns the expected Models with approved public-safe media linked to those exact canonical Model records.
6. SIGIL Search proves that private/pending/unapproved media is not exposed.
7. The actual campaign destination is smoke-tested from the ad entry URL through the intended app surface.
8. Only then may the release manifest move from `hold` to `ready` and `campaign_enabled=true`.

## Evidence rule

Real-event gates must use genuine production evidence. Unit tests, staging fixtures, synthetic LINE IDs, fake payments, or fabricated media cannot satisfy the gate.

Record each proof in `ops/release-gates/app-sigil-always-on.json`. A `pass` row must include an evidence reference. The checker rejects a ready/enabled decision if any required proof is missing.

## Final gate verifier

Use the manual workflow `APP SIGIL final gate verifier` to close only the two remaining final gates:

- `mmd_app_job_handoff` passes only when the workflow reads a production durable receipt from `https://sigil.mmdbkk.com/public/api/jobs/internal/handoffs` for the exact `handoff_model_record_id` and `handoff_job_id`. The receipt must be schema `mmd_public_job_board_v2.model_handoff_receipt`, source `validated_model_handoff`, and must not expose the raw handoff token, LINE ID, cookies, authorization, payment, or customer payload.
- `campaign_destination_smoke` passes only when the same workflow smoke-tests the actual ad entry URL. If an exact URL is not supplied, the workflow builds the canonical MMD APP Job Board campaign URL through `/sigil/model/login?intent=job_board&return_to=public_job_board&next=https://sigil.mmdbkk.com/public/api/jobs`.

The workflow writes an artifact named `app-sigil-final-gate-evidence`. Copy that artifact evidence into `ops/release-gates/app-sigil-always-on.json` before changing the manifest to `ready` or `campaign_enabled=true`.

Required workflow inputs:

- `handoff_model_record_id`: canonical Model record ID from the real post-LIFF handoff.
- `handoff_job_id`: exact Job ID reached by that handoff.
- `campaign_destination_url`: optional exact ad URL; leave blank to use the canonical generated MMD APP Job Board URL.
- `campaign_id` and `campaign_source`: campaign metadata for the destination smoke.

Required workflow secret:

- `PUBLIC_ACCESS_INTERNAL_TOKEN` preferred, or `INTERNAL_TOKEN` fallback, matching the production public-access-worker internal owner token.

## Current status

`HOLD`.

The historical SIGIL Search hardening work proved renderer/privacy behavior but did not itself attach approved public-safe media to the currently returned Models. That data condition has since been addressed for the currently accepted Atom IX and Book EI production search path, but the final always-on decision still requires the real MMD APP Job handoff receipt and real ad destination smoke evidence.

## Non-goals

This gate does not create customer data, upload media, approve payment, grant entitlement, or manufacture acceptance evidence. It only prevents the launch decision from outrunning production truth.
