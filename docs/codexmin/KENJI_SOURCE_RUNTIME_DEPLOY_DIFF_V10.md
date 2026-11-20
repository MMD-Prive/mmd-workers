# CODEXMIN V10 — Source / Runtime / Deployment Diff

**Read-only snapshot:** 20 November 2026 ICT, connected GitHub and Cloudflare APIs. Do not confuse source/CI with traffic.

## GitHub accepted main

| Repository | Verified main SHA at branch creation | Meaning |
|---|---|---|
| `MMD-Prive/mmd-workers` | `164fb286d7ac363c575177fe9377097c07838dea` | Includes merged #3227/#3229 |
| `MMD-Prive/my-mmd-member-profile` | `2223dcd34c64f172832de8686de5e32bdc3a0f03` | Includes merged #28–#31, full-cast isolated QA visual candidate |

Two new V10 branch heads must be read from their Draft PRs, not inferred from these main SHAs.

## Cloudflare latest active deployments (read-only)

| Worker | Deployment ID | Active version | Deployment creation (UTC) | Traffic |
|---|---|---|---|---|
| `member-dashboard-chat-worker` | `58587941-bf15-499b-b152-785095b57812` | `61a43052-5b1b-4bca-8b71-b45f9508f68b` | 2026-11-11T09:19:53Z | 100% |
| `my-mmd-skin-qa-20261117` | `53c1eb84-d2bf-4d49-8523-c2d28b206d87` | `de433392-da2c-41a2-bae7-cee5cb25c117` | 2026-11-18T06:49:05Z | 100% |
| `admin-worker` | `c54ecaeb-5df0-440b-9541-f02186d2d914` | `262ad04b-c2cf-44eb-b203-abef55cb49db` | 2026-11-16T15:56:55Z | 100% |
| `payments-worker` | `9f3a887b-745e-4346-b072-484391f37a72` | `3afd621f-a850-4e4c-a5ab-14156c97eab8` | 2026-11-14T17:32:10Z | 100% |

The latest uploaded `member-dashboard-chat-worker` version `3072d4de-fd2c-41ae-8518-a3b2f9693de2` (13 Nov, #813) is **not** the active deployment and is also earlier than #3227/#3229. No new Worker was deployed by this V10 investigation.

## Cloudflare zone route evidence

`mmdbkk.com` zone `2d62396174fa2ddadbbcd0e8cf0f3367`, exact route search:

- `mmdbkk.com/api/member/kenji/*` and `www.mmdbkk.com/api/member/kenji/*` → `member-dashboard-chat-worker`.
- `mmdbkk.com/member/kenji*` and www equivalent → same Production Worker.
- `mmdbkk.com/my-mmd*` and www equivalent → same Production Worker.
- `mmdbkk.com/my-mmd-next-test*` → `my-mmd-skin-qa-20261117`.
- Existing `staging.mmdbkk.com/api/member/kenji/chat*` belongs to `chat-worker-staging`, but **no compatibility or synthetic session contract was verified**, so this must not be assumed safe to bind to QA.

Active Worker `member-dashboard-chat-worker` settings list **no** `KENJI_PROMOTION_EVIDENCE_WORKER` binding or `KENJI_PUBLIC_PROMOTIONS_ENABLED` flag. QA Worker has only ASSETS and SIGIL_BOOKING, and no synthetic Kenji BFF/flag.

## Precise remaining readback

- Source commit → exact deployed Worker version module bytes/hash: cannot be concluded from merge event.
- Active payments-worker `double-moment` actual issuance policy/recorded purchase revisions: not verified by a single Git filename.
- Webflow custom domain page revision and posted HTML copy hash: not independently verified.
- Telegram message 135 exact payload and channel delivery receipt: referenced, not fetched.
- Real LINE first-party signed-in acceptance: NOT_RUN.

## Release safety

No work done in this branch changes deployed script/route allocation, account settings, Worker flags, Webflow, Lovable or Telegram. Only source branches and Draft PRs are authorized.
