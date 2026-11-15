# MY PARTNER · Completion increment · 14 November 2026

This extends the existing LV Max application. It does not claim that every historical request is now implemented.

## Implemented in this increment

- LINE verification returns the canonical `https://mmdbkk.com/partner/dashboard`, replacing the stale Pages destination. Redirect validation rejects other origins, paths, duplicate tokens, and extra query parameters.
- New authenticated `GET /v1/partner/jobs/detail` reads the assigned Session, checks Partner scope, reads canonical Jobs ETA events, rechecks assignment/appointment, and returns an allowlisted projection. No chat payloads, identities, private notes, raw events, or attachments leave the API.
- UI shows the recorded lifecycle and a countdown only for a valid ETA during travel. Missing, expired, failed, and ambiguous dependencies remain distinguishable. Arrival does not follow countdown expiration.
- The prior-day 12:00 reminder and 19:00 owner-review time are schedule information in Asia/Bangkok. No automatic acknowledgement, actual delivery claim, or new notification automation is introduced. A recorded acknowledgement is labelled separately from unverified current-revision acknowledgement.
- Job-specific problem, wrong-place, and cancellation-review buttons prepare the existing Console request. The user must explicitly submit/share it. Requests do not mutate arrival, cancellation, payment, work completion, or model acknowledgement.
- PN/VIP work-lane proposals persist canonical `offer_type`, separately from customer audience. Default and specific-lane approved configurations are shown separately. An approved configuration is not an unconditional currently available offer.
- Null/empty/boolean rates are rejected. Missing projected rates stay null. Revoked/transferred/archived/inactive relationships cannot propose rates. A replay key bound to different rates, model, lane, visibility, audience, or schedule returns conflict. The UI retains its retry key and entered data on failure, and clears the key only after confirmed success so a later request remains possible.
- Returning to the browser refreshes current account data even when Telegram is already linked. Revoked account access clears private UI. Console drafts keep the selected job across refreshes and are not silently moved to a different job.

## Existing app surfaces retained and regression checked

| Surface | Actual operation |
|---|---|
| Our Mission | Upcoming jobs first; time conflicts, filtering, private encrypted calendar, job response where allowed |
| MY CO MODELS | Per-Partner Top order, search, roster history, profile requests, uploads, cover/review history |
| Agreements | Bridge / Co-Partner / Profit Share requests and approved records |
| Earnings | Verified ledger projections, separate transfer states, CSV and browser PDF export |
| Console | Scoped requests associated with a job; optional verified Telegram connection |
| Private Vault | Browser encryption, conflict-controlled storage, private notes/calendar/contacts, encrypted backup/import |
| Activity | Request history and recorded status |

## Explicit remaining boundaries

- **Immediate global visibility OFF/ON is not enabled.** Current Partner API produces review proposals. Discovery/booking/recommendation enforce separate policies. The control says “ขอเปลี่ยน”; it must not claim immediate global suppression. A coordinated canonical deny override plus tests/deploys for all consumers is still required. Never substitute `available_now`, a hidden UI card, or an unreviewed price rule for actual access control.
- Profile/rate/media requests retain their existing owner-review contract. Upload success does not imply approval or public publication.
- LINE/Telegram combined conversations, confirmed cross-channel photo deduplication, incoming/outgoing answered/missed call counts, and Jay/Uri/Kendo history are not connected. No fictional history is shipped as real data.
- Partner does not impersonate the model/customer to acknowledge, start, finish, release HOLD, approve payment, or confirm receipt. The existing neutral model link remains available under its current contract.
- Lovable integration disconnection has not been verified. Changing the LINE redirect removes the stale runtime destination; it is not a claim of GitHub app disconnection.
- No changes to the isolated QA staging gateway, authentication configuration, or notification schedules.

## Evidence and verification

- Automated Partner suite: 144 passed after job detail, lane, replay, and UI tests (final CI is authoritative for the final commit).
- TypeScript check passed locally.
- No live job, rate, model, image, or notification mutations were used as test data. Integration tests use the existing synthetic fixture with captured messages.
- Production rollout uses the repository's existing `Deploy partners-worker` workflow, including both canonical domains and unauthenticated API smoke. This increment adds `/jobs/detail` to fail-closed smoke.
- Visual mobile QA is **not verified in this turn**: the cloud browser could not reach the local preview. Previous LV Max layout checks do not prove the new expanded panels. The generated synthetic preview is labelled and disables real workflow writes.
- Authenticated production ETA/session data has not been verified with a live Partner account in this turn.

Source: `partners-worker/src/index.ts`, `partner-control-room.ts`, `partner-operations.ts`, `partner-lvmax.ts`; canonical read helpers `shared/model-travel-{eta,lifecycle}.mjs`.
