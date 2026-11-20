# CODEXMIN V10 — Release GO/NO-GO Gate

**Current decision: PRODUCTION NO-GO.** Source-only Draft PRs can be reviewed and tested; no automatic merge, publish, routing or rollout is approved.

## Review readiness versus Production readiness

| Gate | State | Required evidence to close |
|---|---|---|
| Source root causes | CONFIRMED_SOURCE / CONFIRMED_RUNTIME | See `KENJI_ROOT_CAUSE_V10.md`; source and active deployment evidence included |
| Minimal source patch | REVIEW_CANDIDATE | Source PR diff, CI result at exact final SHA, no unrelated changes |
| Campaign publication authority | BLOCKED | Owner-approved exact copy + digest + per-channel publication revision, revocation and time window |
| Double Moment payment/public copy reconciliation | BLOCKED | Deployed payments-worker policy version, purchase generation, approved ad revision; no historical entitlements rewritten |
| Knowledge old-content quarantine | SOURCE_ONLY | Exact code/tests reviewed, then separately deployed by authorized release |
| Synthetic staging Kenji BFF | BLOCKED | Dedicated BFF/service binding + explicit QA flag, synthetic session contract, safe origin marker |
| Protected `my-mmd-qa` environment | NOT_VERIFIED | Owner verifies required reviewers, branch protections and least-privileged secret |
| QA deploy preflight | SOURCE_ONLY | Exact main SHA, candidate config/bindings compare, dry-run and sanitized readback in future owner-run manual workflow |
| Production deployment, route, live LINE/iOS | NOT_RUN | Separate owner authorization + exact version/route/status + authenticated test acceptance |

## Operational invariants

1. Public Kenji: General Q&A only, or verified Public published promotions; no member/account/Points/payment/Private action.
2. Promotion absent/ambiguous/revoked → 423, never AI-generated offer.
3. Member-specific coupon/eligibility → 403 with MY MMD handoff.
4. QA must not contact Production Kenji BFF or send live browser Cookie/Authorization.
5. Legacy operator Knowledge history remains readable; published retrieval excludes unverified campaign cards.
6. Nothing issues, consumes or adjusts campaign claims, coupons, membership or credits from this patch.
7. Production source must be proven from **actual deployed Worker version**, not GitHub PR merge.
8. No Public/Private assets or access scopes mixed.

## Manual future owner steps (NOT authorized in this task)

- Review both Draft PRs, tests and release branch SHA, explicitly approve merges if desired.
- Approve exact Public CARE BACK/Double Moment copy, validity and channel receipts in one trustworthy evidence registry.
- Configure a synthetic-only Kenji QA BFF with test identity and a verified service binding; do not reuse Production session service.
- Verify `my-mmd-qa` GitHub Environment protection and a short-lived scoped Cloudflare QA token privately. Do not paste secrets in chat.
- Invoke manual QA workflow **only** from current reviewed main with exact 40-character `expected_sha`; verify all preflight checks before any cloud write.
- Later use a separate reviewed narrowly scoped Production release, with exact source/artifact/deployment/route/live readback and rollback plan.
- Obtain explicit consent for authenticated LINE/iOS testing, never use real customer accounts by default.

## Definition of done

**Code-review-ready** means focused regression and CI results at exact PR head plus owner review. **Production-ready** additionally requires authoritative campaign receipts, isolated acceptance, and a separate production deployment approval. If a source is inaccessible, mark NOT_VERIFIED rather than guessing.

**No merge, no Production deploy, no Webflow publish, no GitHub→Lovable sync, no customer records changed.**
