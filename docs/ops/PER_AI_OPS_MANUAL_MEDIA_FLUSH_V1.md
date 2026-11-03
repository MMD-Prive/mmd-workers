# PER · AI OPS / FLUSH ALL MEDIA — manual

Owner: Per · MMD Privé
Source account: **malemodel.bkk@gmail.com only**
Source contract reviewed: **3 November 2026**. This document describes current handlers; it does not assert a fresh production ingestion or publication.

## Entry and actions

Use the existing **PER · AI OPS** panel, including its FLUSH control. Do not create a second intake console.
Authenticated owner POST /v1/admin/ai-ops/media/flush proxies to POST /v1/admin/model-media/flush-preview. Each action has a different effect:

| Action | Effect | Publication |
| --- | --- | --- |
| preview_all | Bounded Drive metadata inventory; returns preview_only | None |
| stage_all | Downloads eligible media into private staging and writes receipts/registry; resumable run_id | None |
| review_queue / review_models | Reads scoped media/model review data | None |
| review_media | Reads protected media bytes for owner inspection | None |
| review_draft_queue / review_draft_detail | Reads inspection drafts/history | None |
| review_save | Writes review draft/registry through saveReviewDraft | None |
| review_draft_save | Writes durable inspection history through saveDraftInspection with revision and operation_id | None |

Do not describe FLUSH as entirely read-only. Clicking intake/staging or saving inspection is a write. Browser-local drafts are separate from server persistence. A saved inspection remains pending review and must not be described as a published or approved model.

The handler defaults to the **eight Catalogue roots**. MMD NOW roots listed below are known source mappings, not proof that stage_all processes them. The synthetic test root is available through explicit test dependencies only.

## Source mapping

| Destination | Category | Folder ID |
| --- | --- | --- |
| Model Catalogue | Standard | 1xKuBP9TFNXtT93rP7VUMhKlgmKPWYLm7 |
| Model Catalogue | Premium | 1vkOuwdLXc0jAOHmg9UWEIhkT5apUsVOH |
| Model Catalogue | EMs | 146uQLhgyul_1dmEayC5JqOmL9OivQ5KD |
| Model Catalogue | GWs | 1y3CjdMIj_BvLTpJY-9YIaLBZZUgTE_Pl |
| Model Catalogue | Travel | 1I_qK-6opK7KKF4iF7Pg2ZZaM6JcXsYxj |
| Model Catalogue | Extreme | 1-naIuYuuwWtXQT4SIysFAUQpjMzVv-0c |
| Model Catalogue | Farang | 1QNEEdwIokYxooXOf5IdW-GS75V5_Z5si |
| Model Catalogue | Up Country | 1VaX4eAgbOMJrizmB4h1p6_RN2SAvANhL |
| MMD NOW | New Entry = New Release | 1pULVWINaICROMQ3ozBvPh5SG1N5RH2Db |
| MMD NOW | Hot Cha | 1kzEAekqrtbjd4SDa-SyzKv4kCYbI8sRe |

The first six Catalogue folders plus two MMD NOW folders are under MMD HYPE COMPCARD INTAKE. Farang and Up Country are under MMD Variety. The source account owns each checked root. Folder ownership does NOT confer approval to publish.

MMD Recommend: Telegram Standard → MMD Recommended Topic is the owner-preferred editorial source, but its thread ID remains unresolved. Do not scrape or read the whole group, do not silently fall back to the similarly named Google Drive folder, and do not make Telegram a blocker for Drive preflight. Hot Call is distinct and excluded.

## Safety

- Review and Hidden folders may enter the private review pipeline with their visibility retained. Archive/Rejected/Pending/Draft/private-reference exclusions follow the handler. Inclusion in a private queue never grants public visibility.
- Scan limits are explicit; truncated results say incomplete_scan. Unknown file ownership is excluded.
- Inventory JSON does not expose original media bytes. The separate owner-only review_media action serves protected bytes for inspection.
- The existing disabled metadata-sync flag stays false. This phase does not create new canonical Model identities, bind models by name, or change private/public approval flags.

## Operation and remaining verification

1. Confirm production OAuth account and owner-controlled preflight results.
2. Resolve duplicate or missing canonical Models Drive folder IDs and scope keys; never infer identity by name or face.
3. Verify the active private staging R2 bucket/prefix, retention, access, audit and rollback contracts before operating writes.
4. Verify idempotent version receipts, private R2 staging, registry and inspection readback. Do not assume every review status is stored in Airtable.
5. Verify double clicks, resume, conflict, edited/deleted media and failed writes using fixtures. For review_draft_save, retry the same operation_id without duplicating history; after save-next failure retry navigation, not the save.
6. Verify Telegram MMD Recommended topic ID separately.

Tests:
- node --test admin-worker/model-media-flush-preview.test.mjs
- node --test admin-ai-ops-worker/test/manual-media-flush.test.mjs

GitHub PR and read-only preflight are NOT equivalent to a deployed, verified media sync.
