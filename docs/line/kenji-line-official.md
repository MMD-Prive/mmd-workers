# Kenji AI In LINE Official

Kenji LINE OA is the member-facing concierge entry for MMD Privé. It is not the admin board, not Worker Control Console, and not a production write surface beyond the existing safe Console Inbox / Airtable inbound logging already present in the LINE webhook.

## Surface Map

- `/member/dashboard`: Member Home / Status Hub
- `/member/kenji-ai-20`: Kenji AI member-facing concierge surface
- `/sigil/board`: internal system/admin/rules/control layer
- LINE OA Kenji: member-facing conversational entry

## Two-worker lock

Kenji LINE is locked to two workers:

```text
immigrate-worker = LINE intake and handoff bridge
ai-worker = intelligence and answer support
```

`mmd-redirect-worker` may be used only as an optional public bridge/front gate when healthy. It is not the Kenji brain and must not be treated as the LINE answer owner.

## Production Webhook Route

Preferred stable route when the front gate is healthy:

```text
https://mmdbkk.com/webhooks/line
```

This route may bridge through `mmd-redirect-worker` to the configured LINE webhook implementation through:

```text
LINE_WEBHOOK_UPSTREAM_URL=https://<your-site>.netlify.app/.netlify/functions/webhook
```

If `mmd-redirect-worker` is unstable, LINE Official may temporarily bypass it and point directly to the existing `immigrate-worker` / Netlify-compatible webhook:

```text
https://<your-site>.netlify.app/.netlify/functions/webhook
```

Do not ask LINE Official to point directly to Netlify as the long-term production URL unless there is an intentional migration decision. The public LINE OA URL should remain stable on `mmdbkk.com`; the upstream can be changed behind the gate.

## Required Env

For the active `immigrate-worker` LINE webhook implementation:

```text
LINE_AUTO_REPLY_ENABLED=false
LINE_KENJI_AI_ENABLED=true
LINE_KENJI_AI_DEBUG=true
LINE_CHANNEL_SECRET=...
LINE_CHANNEL_ACCESS_TOKEN=...
AIRTABLE_API_KEY=...
AIRTABLE_BASE_ID=appsV1ILPRfIjkaYg
AIRTABLE_SYNC_TABLE=MMD — Console Inbox
```

For the optional `mmdbkk.com/webhooks/line` bridge in `mmd-redirect-worker`:

```text
LINE_WEBHOOK_UPSTREAM_URL=https://<your-site>.netlify.app/.netlify/functions/webhook
```

For `ai-worker`, keep it as intelligence support only. It should not hold public LINE webhook ownership:

```text
FEATURE_RETRIEVAL=true
FEATURE_SUMMARIZATION=true
AI_MAX_RESULTS=...
AI_TIMEOUT_MS=...
```

## Test Phrases

```text
Hi Per
สวัสดี เปอร์
สวัสดีครับ
เคนจิ
คุยกับ Per AI
จอง
ส่งสลิปแล้ว
ต่ออายุสมาชิก
VIP
SVIP
Black Card
Rich Menu: Hi Per
Rich Menu: สวัสดี เปอร์
```

Expected behavior:

- Replies use warm, concise Kenji voice.
- Booking reply says Kenji can guide booking but must check member status, conditions, and availability first.
- Payment/slip reply says proof is supporting evidence only and confirmation requires official verification / fund matching.
- SVIP reply says Boss Per manual decision only, never points-based.
- Black Card reply says private review, not automatic approval.
- Pricing messages keep the existing pricing review acknowledgement path.
- Model availability messages keep the existing model lookup / Per confirmation path.
- If `LINE_AUTO_REPLY_ENABLED=false`, inbound events should still log/draft/handoff without public auto reply.

## Safety Notes

- No secrets in Webflow or frontend code.
- Do not use a query/body field named `token`; use `t` only for tokenized public/member links.
- Payment slips/proof are supporting evidence only.
- Payment confirmation requires official verification and fund matching.
- SVIP is Boss Per manual decision only.
- Black Card is private review only.
- LINE OA Kenji does not enable real Worker Control POST actions.
- Deduped LINE events must not reply twice.
- Netlify / immigrate-worker can be an upstream compatibility target, but should not become the canonical long-term LINE route owner.
- `admin-worker` must not be the public LINE webhook owner.
- `telegram-worker` must not be the public chatbot owner.
- `himai-chat-worker` is pattern reference only and must not be used as MMD production LINE.
