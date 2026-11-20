# CODEXMIN V10 — Approval / Published Revision Gaps

**Status:** BLOCKED_BY_PUBLICATION_AUTHORITY. This document defines what is missing; it does **not** authorize new promotional copy or customer eligibility.

## Required source-of-truth chain

```text
Owner approved copy bytes + approval receipt
  → immutable approved copy SHA-256
  → channel-specific publication receipt, URL and published copy SHA-256
  → channel revision / observed public state / revoked? / display window
  → canonical campaign ID + policy source SHA + public audience
  → trusted read-only registry projection (authenticated producer)
  → Kenji BFF verifies exact contract; only then deterministic public reply
```

`status=published` on an old card, a site-wide Webflow `lastPublished` timestamp, a Promo Code, a coupon wallet row, and December payment honor are individually insufficient.

## Existing `mmd.public_promotion_evidence.v1`

The V1 validator checks owner field, copy digest, source revision, date and URL and requires one campaign. It is **only a parser/validator**: `authority:'mmd_promotion_evidence_registry'` is a field **reported by the response**, not independent cryptographic attestation. Trust depends on the separately provisioned restricted service binding and a producer that actually verifies upstream approval/publication. The live BFF has neither `KENJI_PROMOTION_EVIDENCE_WORKER` nor `KENJI_PUBLIC_PROMOTIONS_ENABLED` configured.

**Therefore:** Do not create a synthetic "approved" snapshot to pass the validator. The correct present state is 423.

## Provenance gaps

| Field | CARE BACK November | Double Moment |
|---|---|---|
| Canonical ID | `6-years-care-back` vs `care_back` requires owner-approved mapping | `promo_double_moment_sep2026` financial vs advertising manifest ID |
| Approved customer copy | Current Nov/Season 2 exact bytes + signoff receipt not proven | HYPE manifest pins ad captions/hash; verify owner receipt and exact channel revision |
| Public channel | Webflow page known, per-page revision/hash not verified | Webflow page plus Telegram Preview reference |
| Real delivery | Webflow publish/readback per-page not verified | Telegram Preview message 135 referenced, original receipt/bytes not independently fetched |
| Effective display window | November policy ends before 1 Dec; needs approved customer copy alignment | Continuous ad availability / monthly posting cadence; cannot treat as perpetual daily publication |
| Revocation/unpublish | Not independently verified | Not independently verified |
| Financial validity | Cannot infer from marketing | v2 120-day vs v3 calendar-month semantics, historical purchases locked to recorded policy |
| Member-specific eligibility | MUST NOT leave member-owned wallet/entitlement service | MUST NOT infer from public advertising |

## Preferred integration

1. Reuse HYPE approved manifest / audited publication log as *candidate* public advertising evidence; never use marketing manifest as payment truth.
2. Build a dedicated read-only, scoped evidence adapter with no customer identity, no coupon instance and no writes.
3. Cross-check the owner-approved copy hash with exact Webflow channel revision or Telegram posted bytes; verify revocation/expiry.
4. Require canonical Campaign ID mapping, public audience and language, explicit `starts_at`/`ends_before`.
5. Fail closed on missing, stale, ambiguous, revoked, wrong-domain or conflicting evidence. Never let LLM generate campaign benefits.
6. Add revocation/withdrawal tests and staged readback; expose only public fields.
7. Require independent owner approval before enabling feature flag and binding in any real environment.

**Do not** route `/api/member/app/coupons` into Kenji: its endpoint is authenticated wallet state with read-repair/reconciliation. Use the static handoff URL only.

## Manual evidence needed to close

- Current Owner sign-off for CARE BACK November exact Public text and target channel.
- Exact Webflow published page content/revision/hash (not site-level lastPublished).
- Exact Telegram Preview message 135 / delivery receipt + posted copy hash or proven absence, and associated channel.
- Clear policy choice by purchase generation for Double Moment publicity, compatible with active payment ledger.
- Owner-approved canonical ID mapping, revocation/source-wins rule and audit trail.

**No Public Kenji promotion answer may be unlocked just because Code CI passes.**
