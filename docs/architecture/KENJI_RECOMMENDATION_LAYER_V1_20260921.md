# Kenji Recommendation Layer V1

Status: implementation candidate / draft PR only  
Date: 2026-09-21  
Production state: not mounted, not deployed, no customer copy change

## Goal

Give Kenji a deterministic recommendation layer that can shortlist up to three customer-safe Models from current authoritative data without turning history, chat text, or AI inference into access, pricing, availability, booking, payment, or entitlement authority.

The layer is designed for the MMD requirement:

- remember reviewed customer preferences and prior Model touches;
- understand the current request, lane, area, budget, and operational requirements;
- re-check which Models that exact customer may see;
- re-check the current customer-facing sell rate;
- require a fresh sanitized availability snapshot before a candidate is customer-ready;
- surface a New Release only when it is relevant to the request or reviewed history;
- return a bounded safe next action rather than claim that a booking is confirmed.

## Authority chain

```text
Published Model Keyword Profiles
  -> shortlist discovery only
  -> KENJI_MODEL_ACCESS_V1 exact per-Model recheck
  -> model_sales_control_v1_20260921 current offer recheck
  -> SIGIL Availability Snapshot V1 sanitized freshness check
  -> Kenji Recommendation Layer V1 deterministic ranking
  -> owner/operator preview or later shadow consumer
```

No earlier source may override a later authority. In particular:

- Customer Memory affects ranking context only.
- Model Access decides whether a candidate may exist in the result.
- Model Sales Control decides whether the Model is sellable and which customer-facing rate may be exposed.
- SIGIL Availability Snapshot decides whether a candidate may be marked customer-ready.
- No recommendation output confirms a booking, payment, entitlement, calendar hold, or Model assignment.

## Prepared modules

### Shared policy core

`shared/kenji-recommendation-layer-v1.mjs` orchestrates the policy. Supporting modules keep the contract reviewable:

- `shared/kenji-recommendation-contract-v1.mjs`
- `shared/kenji-recommendation-context-v1.mjs`
- `shared/kenji-recommendation-candidate-v1.mjs`

Responsibilities:

- validate a fresh `KENJI_MODEL_ACCESS_V1` permission gate;
- require `model_sales_control_v1_20260921` for every sellable candidate;
- validate `sigil_availability_snapshot_v1`, state TTL, `updated_at`, and `expires_at`;
- apply lane, city, zone, budget, and `burn` / `mk` / `live` filters;
- use only reviewed Conversation Matrix context when all boundaries are present:
  - `schema_version=mmd.kenji_conversation_matrix.v1`
  - `context_only=true`
  - `live_truth_wins=true`
  - exact known identity with high confidence
  - `may_personalize=true`
- exclude reviewed negative preferences and negative prior Model relationships;
- cap customer-ready recommendations at three;
- remove source rate, margin, raw note, raw rule ID, contact, payment proof, and private identifier fields.

### Service-only adapter candidate

`admin-worker/src/kenji-recommendation-rpc.js` with bounded source adapters:

- `admin-worker/src/kenji-recommendation-profile-source.js`
- `admin-worker/src/kenji-recommendation-context-adapter.js`

Proposed internal path:

```http
POST /v1/internal/kenji/recommendations
```

The handler is restricted to the `member-dashboard-chat-worker` service-binding contract and the shared internal token. It:

1. reads published/active Model Keyword Profiles for discovery only;
2. builds a bounded shortlist of at most 12 profiles;
3. calls `resolveKenjiModelAccess(...)` for every shortlisted Model;
4. accepts only exact `status=match` results;
5. uses the Model Sales Control projection returned by that authority;
6. reads `availability:v1:{model_key}` only from the future sanitized `SIGIL_AVAILABILITY_SNAPSHOTS` binding;
7. passes only bounded Conversation Matrix fields to the shared ranking core.

The adapter is intentionally not mounted into the active Admin Worker entrypoint in this preparation PR. Mounting, configuring the availability binding, deploying, and enabling a consumer remain separate explicit production actions.

## Recommendation output

Customer-ready output is limited to safe fields:

- Model key and approved display name;
- approved summary and HTTPS image URL when safe;
- lane;
- sanitized availability state, city, zones, and freshness timestamps;
- customer-facing rate only when `price_visible=true`;
- safe matching reasons;
- `continue_to_booking_review` or `per_review_before_offer`.

Candidates with missing, stale, expired, future-dated, or untrusted availability do not enter the customer-ready list. They may enter a bounded review list with `verify_live_availability_before_offer`.

Candidates with a hidden customer price while a budget is part of the request enter review with `verify_customer_price_before_offer`.

## New Release policy

`New Release` is not a general sales boost.

A new Model is eligible for the New Release boost only when at least one of these is true:

- the current request explicitly matches approved safe keywords; or
- a reviewed positive preference in the bounded Conversation Matrix matches approved safe keywords.

A new Model that is unrelated to the request/history is excluded rather than inserted merely because it is new.

## Fail-closed cases

The layer returns no customer-ready recommendation when:

- the permission gate is missing, stale, or has a different policy version;
- Model Access is silent, renewal-only, unresolved, or unavailable;
- the canonical offer is absent, draft, off, expired, conflicting, or non-sellable;
- lane, city, zone, budget, or explicit operational filters do not match;
- the availability source is raw/untrusted, missing, expired, stale, or malformed;
- Customer Memory lacks its context-only/live-truth-wins boundary;
- a reviewed negative preference or negative prior relationship applies.

## Test gates

Prepared test suites cover:

- exact fresh permission-gate enforcement;
- Model Access and Sales Control authority locks;
- availability schema and TTL enforcement;
- lane, location, budget, and operational filters;
- reviewed-vs-unreviewed history;
- context-only/live-truth-wins memory boundary;
- negative preference and complaint/block exclusions;
- relevant-only New Release behavior;
- deterministic top-three limit;
- source-rate, margin, raw-note, contact, and identifier redaction;
- service-binding auth, method, and content-type constraints;
- upstream source degradation returning 503 rather than a misleading empty result;
- zero booking/payment/entitlement mutation and zero customer auto-send authority.

## Explicit rollout gates

No production rollout is authorized by this document or draft PR.

A later explicit owner command must cover the intended actions, for example:

```text
merge/deploy Kenji Recommendation Layer
```

Before customer-visible use, the rollout still requires:

1. mount the service-only route in the active Admin Worker entrypoint;
2. configure a real sanitized `SIGIL_AVAILABILITY_SNAPSHOTS` source;
3. deploy behind a default-off feature flag;
4. run authenticated synthetic shadow smoke with no customer delivery;
5. verify telemetry contains metadata only, not recommendation context or private identifiers;
6. separately approve any operator-draft or customer-copy consumer;
7. keep `auto_send_allowed=false` until a later explicit owner decision.

## Non-goals

- no LINE auto-reply;
- no booking creation or confirmation;
- no payment verification;
- no entitlement or membership mutation;
- no Model availability writeback;
- no raw Model Console read;
- no source-rate, payout, margin, or private-note exposure;
- no Webflow or LIFF publication;
- no Worker deployment in this preparation phase.

Related: #757, #1427, `KENJI_MODEL_ACCESS_V1`, `model_sales_control_v1_20260921`, `SIGIL Availability Snapshot V1`.
