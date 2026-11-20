# CODEXMIN V10 — Kenji Public AI Root Cause Report

**As-of:** 2026-11-20 · Asia/Bangkok | **Mode:** Source + connected Cloudflare/Airtable/Drive readback | **Production mutation:** NONE.

## Source baseline

- `MMD-Prive/mmd-workers` current main at investigation start: `164fb286d7ac363c575177fe9377097c07838dea` (merged PR #3229).
- `MMD-Prive/my-mmd-member-profile` current main: `2223dcd34c64f172832de8686de5e32bdc3a0f03` (PR #31).
- PR #3227 implemented Public server capabilities; PR #3229 added a strictly gated promotion validator and retired **two** known Knowledge Card IDs.
- Existing campaign source and customer-account source are different authorities. No customer data was queried or modified in this investigation.

## Causal graph

```text
Customer /member/kenji or /my-mmd/kenji
  → canonical Worker route /api/member/kenji/chat
  → production deployment source / session admission
  → server capability classification
       ├─ general_qna → AI_WORKER (identity-only context)
       ├─ published_promotions → evidence service/owner-approved publication
       └─ restricted member data → 403 (MY MMD handoff)
Separate QA route /my-mmd-next-test/... → QA Worker
  → [PRE-PATCH UNSAFE] URL rewritten to canonical production chat + forwarded Cookie
  → [THIS DRAFT FIX] 403/423 or synthetic-only internal QA binding (unconfigured → 503)
Legacy Knowledge Board: Airtable active/published → admin-worker fallback
  → [PRE-PATCH] two retired IDs excluded, other September campaign cards still eligible
  → [THIS DRAFT FIX] all unverified campaign knowledge excluded from published paths
```

## Ranked causes

| Priority | Classification | Root cause and evidence | Fix / owner layer |
|---|---|---|---|
| P0 | CONFIRMED_RUNTIME | Cloudflare production `member-dashboard-chat-worker` active version `61a43052-5b1b-4bca-8b71-b45f9508f68b` 100%, deployment 2026-11-11; both PRs merged later. Real zone routes `mmdbkk.com/api/member/kenji/*` and www point to that Worker. Repo/main is **not** active source. | Keep release gate; provide future reviewed, narrowly scoped production artifact and exact live readback. **No deploy in V10.** |
| P0 | CONFIRMED_RUNTIME | Active Worker settings have **no** `KENJI_PROMOTION_EVIDENCE_WORKER` binding and no `KENJI_PUBLIC_PROMOTIONS_ENABLED` flag; PR #3229 validator therefore cannot be enabled from its current design. | Owner-approved, verified, read-only publication registry is a separate future workstream. Preserve 423; no fabricated receipt. |
| P0 | CONFIRMED_SOURCE | `my-mmd-member-profile/staging/kenji-qa-chat.mjs` used the incoming canonical hostname and forwarded `Cookie` to `/api/member/kenji/chat`, owned by production. Cloudflare confirms QA prefix is a separate Worker, but the outgoing URL used Production owner. | Replaced with opt-in synthetic-only service binding, no Cookie/Authorization; absent target → 503. |
| P1 | CONFIRMED_SOURCE + AIRTABLE | 128 Knowledge records; several `active` or `published` records about September CARE BACK/Double Moment exist beyond the two retired IDs. `admin-worker` published readers previously excluded only two IDs. | Separate unverified campaign quarantine from operator history; broaden filter for campaign category, sources, IDs and named campaigns; regression tests. |
| P1 | CONFIRMED_SOURCE | Public BFF and React/QA regex did not recognize bare `CARE BACK` / `Double Moment` without the word promotion. Such questions could bypass the intended promotion classifier into general Q&A. | Route named campaigns to `published_promotions` → evidence/423, never AI when evidence is absent; add tests in both repos. |
| P1 | CONFIRMED_SOURCE / POLICY_DRIFT | Airtable September Double Moment reply says 180 days, HYPE approved advertising manifest says 120 days, payments `double-moment-policy.js` v3 uses 3 calendar months with max 5. Different revisions / purchase generations cannot be conflated. | No promotion promise or modification to historical credits until active payments-worker version and each accepted policy version are reconciled. |
| P1 | CONFIRMED_AIRTABLE | Promo Codes: 12 records, 10 active, **8 active with an expiry before 20 Nov 2026 21:45 ICT**. Active code status is not evidence of public campaign publication. | Keep Promo Code and wallet sources outside Kenji Public evidence registry. |
| P1 | NOT_PROVEN | An exact owner-approved copy digest paired with current channel publication revision and revocation/expiry receipt has not been found for November CARE BACK. HYPE Double Moment has approved manifest metadata but receipt/posted bytes require independent verification. | Evidence producer + approval/publication hash matching, not automatic Knowledge retrieval. |

## Alternative hypotheses and limits

- "GitHub merge means Production was upgraded": disproven by active Cloudflare deployment.
- "Airtable active means published": disproven as an authority claim by expired active codes and dated Knowledge copy.
- "Campaign not publicly visible": **NOT_PROVEN** from Webflow site timestamp or old execution log alone; per-page verified content revision is still needed.
- "Double Moment current credits expire in 120 days": **NOT_PROVEN** from ad manifest alone; payment issuance version and actual canonical credit receipt must be checked separately.
- "Can use `/api/member/app/coupons` read-only": **UNSAFE ASSUMPTION**; its backend path includes read-repair/reconcile behavior. Do not use it as an evidence registry.
- This branch is source-only, no live QA acceptance and no Production effect.

## Reproduction / distinguishes causes

1. Read Cloudflare latest deployment/version and route owner vs PR merge commits.
2. Inspect original `staging/kenji-qa-chat.mjs`: outgoing `new URL(request.url)`, overwritten pathname, forwarded Cookie.
3. Mock historical September card with `status:'active'` in public/internal published readers; ensure it was returned before broad campaign quarantine and excluded after.
4. Classify `CARE BACK` / `Double Moment` with original and patched expressions; original routes to general, patched to promotion 423 without AI.
5. Compare policy version + advertised copy; never test by creating a real customer credit.

## Safe disposition

**CODE_REVIEW_CANDIDATE; PRODUCTION NO-GO.** Safe patches belong in two Draft PRs; new evidence producer, authenticated staging BFF, owner approval, deployment and customer E2E are not part of these PRs.
