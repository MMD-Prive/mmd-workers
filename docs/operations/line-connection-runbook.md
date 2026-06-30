# MMD LINE Connection Runbook

Purpose: connect LINE Official Account traffic through the MMD Kenji two-worker lock without creating another public LINE Worker.

## Two-worker lock

The Kenji LINE route is locked to two workers:

1. `immigrate-worker`
   - Owns LINE intake compatibility.
   - Receives LINE webhook events or receives them behind a stable public bridge.
   - Verifies LINE signature.
   - Writes safe inbound records to Airtable / Console Inbox.
   - Loads Kenji member memory where enabled.
   - Creates draft, log, and handoff before any risky reply.

2. `ai-worker`
   - Owns AI search, retrieval, ranking, summarization, and intelligence support.
   - Does not own LINE public webhook routing.
   - Does not verify LINE signatures.
   - Does not confirm payment, VIP, Black Card, final price, model availability, or private access.
   - May be called by the LINE layer for approved knowledge and safe answer support.

Do not use `mmd-redirect-worker` as Kenji brain. It may only act as front gate / bridge when healthy.

Do not use `admin-worker` as public LINE webhook owner.

Do not use `telegram-worker` as public chatbot owner.

Do not use `himai-chat-worker` for MMD production LINE. It is a pattern reference only.

## Preferred live flow

```txt
LINE Official Account
→ stable public route
→ immigrate-worker
→ ai-worker when answer intelligence is needed
→ Airtable / Console Inbox / Admin handoff
```

## Stable public route option

LINE Developers may point to the stable MMD domain route when the front gate is healthy:

```txt
https://mmdbkk.com/webhooks/line
```

This route may bridge through `mmd-redirect-worker` using:

```txt
LINE_WEBHOOK_UPSTREAM_URL=<existing immigrate-worker LINE handler URL>
```

## Bypass route option

If `mmd-redirect-worker` is unstable, bypass it and point LINE Developers directly to the existing LINE upstream until the front gate is repaired:

```txt
https://<your-site>.netlify.app/.netlify/functions/webhook
```

This is allowed as a compatibility bypass, not as the long-term canonical owner.

## Required env on immigrate-worker LINE upstream

```txt
LINE_CHANNEL_SECRET=...
LINE_CHANNEL_ACCESS_TOKEN=...
AIRTABLE_API_KEY=...
AIRTABLE_BASE_ID=appsV1ILPRfIjkaYg
AIRTABLE_SYNC_TABLE=MMD — Console Inbox
LINE_KENJI_AI_ENABLED=true
LINE_KENJI_AI_DEBUG=true
LINE_AUTO_REPLY_ENABLED=false
```

`LINE_AUTO_REPLY_ENABLED=false` is the safe launch default. Keep it off until owner review confirms low-risk reply behavior.

## Required env on ai-worker

`ai-worker` should hold only intelligence-side settings. It must not hold public LINE webhook ownership.

```txt
AI_MAX_RESULTS=...
AI_TIMEOUT_MS=...
FEATURE_RETRIEVAL=true
FEATURE_SUMMARIZATION=true
```

Add Airtable or knowledge-source bindings only when the AI layer is approved to retrieve from those sources.

## Production rule

Kenji may acknowledge safe low-risk requests only after review. Payment proof, final price, model availability, VIP or Black Card, refund, complaint, and private access must remain human or owner review.

## Route lock

Cloudflare Worker Router owns routing. Webflow displays pages only. Memberstack checks login and permission only. Page scripts must not perform global redirects. Unknown routes must not be sent to `/default` or `/autodirect`.

## Final lock statement

For Kenji LINE, lock runtime responsibility as:

```txt
immigrate-worker = LINE intake and handoff bridge
ai-worker = intelligence and answer support
mmd-redirect-worker = optional bridge/front gate only
```
