# MMS Therapist workspace v1

The existing MMS Therapist Mini App uses LINE LIFF `2011425652-YqK1F6y8` and stays on `/male-massage/therapists/login`, `/me`, and `/app`. The work app is called **MY THERAPIST**. MY MMS is the separate customer app.

## Behavior implemented

- Native same-origin LINE entrance, with explicit linking/approval errors; invite fragment is removed only after successful authentication.
- Work page checks the canonical MMS session and approved entitlement. No fake identity, status, or approval is introduced.
- Access response includes safe display name, availability, matching switch and verified skills. Internal notes and LINE hashes remain private.
- Therapist can update only their own Availability Status through `PUT /male-massage/therapists/api/app/availability`. Origin, session, canonical Active status, linked LINE identity and Approved app access are required. Matching, identity and approval are unchanged.
- Offer list and exact job detail use existing MMS APIs. First accept, decline, start and complete stay owned by the existing dispatch coordinator. Retried client actions reuse the request key until confirmed success.
- Profile, intro, courses, profile visibility and private-photo upload/select/delete use existing profile APIs and limits.
- Empty, expired, forbidden, missing-price and backend-error states have explicit copy. Completed work never implies a verified payout.
- Internal legacy dispatch may supply `course_amount_thb` and explicit `travel_amount_thb`. Full amount is course plus travel; MMS 30% and Therapist the remainder are calculated in satang. A conflicting supplied Therapist payout is rejected. Quotes do not verify payment or payout. Existing unpriced/canonical-zone dispatch stays unpriced until real amounts are provided; travel is never guessed.
- Invalid job transitions return HTTP 409 rather than an apparent success.

## Presentation and rollout

`MMS_THERAPIST_UI_SOURCE=native` in the member front gate selects the standalone workspace. This removes the work app's presentation dependency on Lovable. Keeping the existing API contract allows Lovable to style the app later. A non-native value retains the previous presentation path.

Login and profile routes are declared in the front-gate config. The existing production route-sync/Lovable smoke workflow is unchanged: automatic approval review rejected the proposed alignment because its future Cloudflare route mutation needs explicit owner authorization. The workflow alignment remains a release blocker; no route-sync or production deployment was executed. The read-only unit CI has no production credentials or mutations.

Deploy **mms-worker first**, then the member front gate. Otherwise the new availability UI will encounter the old unsupported API. Do not claim release acceptance before iPhone/Android LINE login + invite + one approved test-job cycle passes.

## Current live prerequisites observed on 4 October 2026

The configured MMS Therapists table contains three records. One is Active but Unlinked; two are Review with no active auth state. They have Approved app access, but that does not replace linking or operational approval. Jobs, Offers and Prebookings are empty. The owner reports a ready team of 4–5; reconcile that roster separately with stable Therapist IDs and real LINE linking.

This change does not activate or link those people, send invites, create live jobs, merge, or deploy. No real-device acceptance was run. The separate MY MMS customer APIs for Therapist directory, payments, after-service and support remain checking and need their own authoritative integrations. The Therapist work surface and supporting contracts are implemented; release still requires the workflow alignment and real-device acceptance. The entire MMS business rollout is not claimed live.

## Validation

MMS backend suite: 84 tests pass. Native workspace plus existing customer front-gate tests: 13 pass. Includes a simulated offer → accept → start → complete journey, invalid action failure, retry request-key reuse, session/entitlement denial, availability ownership and 30/70 arithmetic. Browser rendering and LINE webview behavior still require real-device acceptance.
