# Kenji AI In LINE Official

Kenji LINE OA is the member-facing concierge entry for MMD Privé. It is not the admin board, not Worker Control Console, and not a production write surface beyond the existing safe Console Inbox / Airtable inbound logging already present in the LINE webhook.

## Surface Map

- `/member/dashboard`: Member Home / Status Hub
- `/member/kenji-ai-20`: Kenji AI member-facing concierge surface
- `/sigil/board`: internal system/admin/rules/control layer
- LINE OA Kenji: member-facing conversational entry

## Required Env

```text
LINE_AUTO_REPLY_ENABLED=true
LINE_KENJI_AI_ENABLED=true
LINE_CHANNEL_SECRET=...
LINE_CHANNEL_ACCESS_TOKEN=...
AIRTABLE_API_KEY=...
AIRTABLE_BASE_ID=...
```

Optional:

```text
LINE_KENJI_AI_DEBUG=true
```

Use the existing Netlify LINE webhook URL. Do not introduce frontend secrets.

## Test Phrases

```text
เคนจิ
คุยกับ Per AI
จอง
ส่งสลิปแล้ว
ต่ออายุสมาชิก
VIP
SVIP
Black Card
```

Expected behavior:

- Replies use warm, concise Kenji voice.
- Booking reply says Kenji can guide booking but must check member status, conditions, and availability first.
- Payment/slip reply says proof is supporting evidence only and confirmation requires official verification / fund matching.
- SVIP reply says Boss Per manual decision only, never points-based.
- Black Card reply says private review, not automatic approval.
- Pricing messages keep the existing pricing review acknowledgement path.
- Model availability messages keep the existing model lookup / Per confirmation path.

## Safety Notes

- No secrets in Webflow or frontend code.
- Do not use a query/body field named `token`; use `t` only for tokenized public/member links.
- Payment slips/proof are supporting evidence only.
- Payment confirmation requires official verification and fund matching.
- SVIP is Boss Per manual decision only.
- Black Card is private review only.
- LINE OA Kenji does not enable real Worker Control POST actions.
- Deduped LINE events must not reply twice.

