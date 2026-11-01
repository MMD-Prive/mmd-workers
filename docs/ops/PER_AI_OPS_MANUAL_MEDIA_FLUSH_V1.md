# PER · AI OPS / FLUSH ALL MEDIA — manual V1

Owner: Per · MMD Privé
Source account: **malemodel.bkk@gmail.com only**
Status: **source preflight only; no production media ingestion or publication**

## What this change implements

- Single **FLUSH · ตรวจรายการล่าสุด** control inside PER · AI OPS, not a new admin page.
- Owner-only POST /v1/admin/ai-ops/media/flush, proxied by the authenticated admin service binding to POST /v1/admin/model-media/flush-preview.
- Bounded Drive metadata inventory on owner click; **no cron, scheduler, auto-sync, media download, Airtable write, R2 put, or Webflow publish**.
- Fail-closed checks for authenticated owner, same-origin POST, hard-pinned Google account, source root owner, returned file owner, and bounded pagination.
- Results explicitly say preview_only. They never say synced or published.

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

- Hidden/Review/Archive/Rejected/Pending/Draft work folders are excluded from the inventory.
- Scan limits are explicit; truncated results say incomplete_scan. Unknown file ownership is excluded.
- No media original bytes or private profile text enter the API response.
- The existing disabled metadata-sync flag stays false. This phase does not create new canonical Model identities, bind models by name, or change private/public approval flags.

## Requirements for a later real ingestion and website update

1. Confirm production OAuth account and owner-controlled preflight results.
2. Resolve duplicate or missing canonical Models Drive folder IDs and scope keys; never infer identity by name or face.
3. Approve private staging R2 bucket/prefix, retention, access, audit and rollback contracts.
4. Add idempotent file version receipts with verified R2 and Airtable persistence; preserve review and takedown policy.
5. Test double clicks, conflict, edited/deleted photo, failed writes, and repeat dry-runs before live rollout.
6. Verify Telegram MMD Recommended topic ID separately.

Tests:
- node --test admin-worker/model-media-flush-preview.test.mjs
- node --test admin-ai-ops-worker/test/manual-media-flush.test.mjs

GitHub PR and read-only preflight are NOT equivalent to a deployed, verified media sync.
