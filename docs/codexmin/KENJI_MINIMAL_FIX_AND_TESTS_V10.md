# CODEXMIN V10 — Minimal Fix & Regression Plan

**Scope:** Source-only changes in two new review branches; no Production mutation.

## Patch 1 — `MMD-Prive/mmd-workers`

Branch: `codexmin/v10-kenji-promotion-quarantine-20261120`

| File | Owning behavior | Minimal change |
|---|---|---|
| `shared/kenji-retired-promotion-knowledge.mjs` | Legacy published Knowledge classification | New `isUnverifiedKenjiPromotionKnowledge`; exclude unverified campaigns based on campaign category, dated September IDs, source paths and campaign-specific copy; preserve historical two-ID helper. |
| `admin-worker/src/kenji-public-knowledge-runtime.js` | Public Knowledge response | Exclude all unverified campaign cards from Airtable and static fallback; no changes to admin listing/editing. |
| `admin-worker/src/kenji-knowledge-runtime.js` | Internal published read/retrieval | Exclude same unverified campaign cards from published/retrieval only, leaving operator list/detail/audit available. |
| `member-dashboard-chat-worker/src/kenji-public-capability-policy.js` | Server capability boundary | Named CARE BACK / Double Moment and discount questions are promotion requests, not free-form Q&A. |
| Tests | Source acceptance | Helper negative/positive, mock active September cards, no AI for bare campaign names. |
| `package.json` | CI | Add campaign classifier test to existing `npm test` pathway. |

**What stays unchanged:** `KENJI_PUBLIC_PROMOTIONS_ENABLED` is not enabled; no evidence binding, member wallet, Points, payment or campaign claim is changed.

## Patch 2 — `MMD-Prive/my-mmd-member-profile`

Branch: `codexmin/v10-my-mmd-kenji-qa-isolation-20261120`

| File | Owning behavior | Minimal change |
|---|---|---|
| `staging/kenji-qa-chat.mjs` | QA POST proxy | Remove implicit global `fetch` to Production and browser Cookie forwarding. Require opt-in synthetic-only service binding `KENJI_QA_BFF`; absent binding/flag → 503; missing/untrusted authority → 503. |
| `staging/gateway.mjs` | QA entry | Explicitly supply QA Worker `env`; mark status as requiring isolated synthetic binding. |
| `src/lib/mmd/kenji-chat.ts` | UI defense-in-depth | Classify named campaigns and personal coupon queries consistently with server. |
| `staging/assert-qa-release-gate.mjs` | Manual deploy preflight | Verify full reviewed main SHA, exact QA Worker config and existing ASSETS/SIGIL_BOOKING bindings before any cloud write. |
| `.github/workflows/my-mmd-lv15-preview.yml` | Manual-only QA | Limit dispatch to exact `main` SHA with `expected_sha`, run config/binding validation + dry-run, redact settings artifact. Does not run deploy for PR. |
| Tests + staging README | QA evidence | Verify no Production URL/Cookie/Authorization, synthetic authority markers, 403/423/503, origin/method, config SHA/binding drift. |

## Focused test commands (on the actual checked-out branches)

```sh
# mmd-workers, Node-compatible source
node --test shared/kenji-retired-promotion-knowledge.test.mjs \
  member-dashboard-chat-worker/test/kenji-public-capability-policy.test.mjs \
  member-dashboard-chat-worker/test/kenji-member-app.test.mjs \
  admin-worker/kenji-public-knowledge-runtime.test.mjs \
  admin-worker/kenji-knowledge-runtime-storage.test.mjs
node knowledge/kenji/validate.mjs
npm test

# my-mmd-member-profile, after bun install --frozen-lockfile
node --test staging/policy.test.mjs staging/kenji-qa-chat.test.mjs \
  staging/test-prefix-rewrite.test.mjs staging/assert-qa-release-gate.test.mjs
bunx vitest run src/lib/mmd/kenji-chat.test.ts
bunx tsc --noEmit
bun run build
```

CI PASS/FAIL must be copied from the actual PR run at the final exact HEAD SHA; no mocked test output is acceptable as a claim that a real member session works.

## Acceptance matrix

| Case | Expected |
|---|---|
| `CARE BACK`, `Double Moment`, `แคร์แบ็ก`, `ส่วนลดล่าสุด` | Public BFF `published_promotions`; without verified registry returns 423; AI calls 0 |
| Personal coupon / booking / Points | 403; no AI or publication reads |
| Legacy Knowledge campaign `active/published` | Excluded from published public and internal retrieval; still readable by authorized operator history |
| General Q&A with verified session | Existing canonical BFF contract unchanged |
| QA general Q&A without synthetic service | 503; **no production network call** |
| QA synthetic internal BFF with wrong authority or no marker | 503 |
| QA internal BFF with correct synthetic marker | Sanitized general response, no browser credentials forwarded |
| Manual QA dispatch wrong source SHA/extra route/binding drift | Block before deployment |
| Actual production customer E2E | NOT_RUN / not authorized |

## No fake completion

These patches fix proven *source-level* gaps. They do not provide the missing owner-approved publication evidence or active Production version. Release remains NO-GO until independent approval and readback.
