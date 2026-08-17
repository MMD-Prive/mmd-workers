# Kenji AI In LINE Official

Kenji LINE OA is the member-facing concierge entry for MMD Privé. It is not the admin board, not Worker Control Console, and not a production write surface beyond the existing safe Console Inbox / Airtable inbound logging already present in the LINE webhook.

## Surface Map

- `/member/dashboard`: Member Home / Status Hub
- `/member/kenji-ai-20`: Kenji AI member-facing concierge surface
- `/sigil/board`: internal system/admin/rules/control layer
- LINE OA Kenji: member-facing conversational entry

## Production Webhook Route

LINE Official uses the stable MMD domain route:

\`\`\`text
https://mmdbkk.com/webhooks/line
\`\`\`

The Cloudflare owner is \`member-dashboard-chat-worker\`, which handles the signed LINE event directly. The public MMD URL remains stable, and no Netlify or legacy upstream is used.

\`LINE_WEBHOOK_UPSTREAM_URL\` is retired and must remain unset. \`immigrate-worker\` is not a LINE upstream and must remain migration-only.

## Required Env

Cloudflare secrets only:

\`\`\`text
LINE_CHANNEL_SECRET=...
LINE_CHANNEL_ACCESS_TOKEN=...
INTERNAL_TOKEN=...
AIRTABLE_API_KEY=...
AIRTABLE_BASE_ID=...
\`\`\`

Cloudflare runtime flags:

\`\`\`text
LINE_AUTO_REPLY_ENABLED=true
LINE_KENJI_AI_ENABLED=true
LINE_KENJI_KNOWLEDGE_ENABLED=true
AIRTABLE_KENJI_KNOWLEDGE_TABLE_ID=tblsLd1uVOtG2kHoU
\`\`\`

\`LINE_KENJI_KNOWLEDGE_ENABLED\` lets the webhook load only Knowledge Board cards that are \`active\`, \`auto_reply_allowed\`, and approved for \`LINE_OFC\`. If the card source is unavailable or fails the Per Voice guard, the Worker uses the safe local fallback instead.

## Test Phrases

\`\`\`text
Hi Per
สวัสดี เปอร์
สวัสดีครับ
คุยกับ Per AI
จอง
ส่งสลิปแล้ว
ต่ออายุสมาชิก
VIP
SVIP
Black Card
Rich Menu: Hi Per
Rich Menu: สวัสดี เปอร์
\`\`\`

Expected behavior:

- LINE replies use Per Voice; the customer must not see Kenji’s name.
- Rich Menu wake-up messages remain navigation only and continue to enter \`talk_to_per_ai\`.
- The Worker verifies every LINE signature, dedupes events before sending a reply, and writes the inbound event to the existing Console Inbox flow.
- When \`LINE_KENJI_KNOWLEDGE_ENABLED=true\`, the Worker may use only an Active, auto-reply-approved \`LINE_OFC\` Knowledge Card. It must reject unsafe copy and use the safe fallback.
- Payment/slip replies treat evidence as supporting evidence only; MMD verifies before any status can be confirmed.
- VIP, SVIP, and Black Card are review-only; chat cannot grant access.
- Booking, price, model availability, and membership confirmation remain subject to verified status and Per/MMD review.

## Safety Notes

- No secrets in Webflow or frontend code.
- No allowlist user ID, probe flag, or diagnostic user identifier is used by the webhook.
- The route is Cloudflare-only: do not set \`LINE_WEBHOOK_UPSTREAM_URL\` and do not reintroduce Netlify or \`immigrate-worker\` as a LINE upstream.
- LINE customer copy must use Per Voice and must not introduce Kenji, reveal internal identifiers, or use “ทีม”.
- Payment slips/proof are supporting evidence only.
- Payment confirmation requires official verification and fund matching.
- SVIP is Per’s private decision only.
- Black Card is private review only.
- LINE OA does not enable real Worker Control POST actions.
- Deduped LINE events must not reply twice.
