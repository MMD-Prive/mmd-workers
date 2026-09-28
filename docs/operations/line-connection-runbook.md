# MMD LINE Connection Runbook

Purpose: connect LINE Official Account traffic using the current MMD memory lock without creating another public LINE Worker and without reviving legacy migration ownership.

## Current MMD memory lock

The production LINE OFC route remains:

```txt
https://mmdbkk.com/webhooks/line
```

The runtime ownership lock is:

```txt
member-dashboard-chat-worker = current production LINE webhook owner / Kenji member-facing entry
ai-worker = intelligence and answer support
```

Long-term architecture may rename or consolidate the LINE surface into `chat-worker`, but the current deployed production owner from MMD memory is `member-dashboard-chat-worker`.

## Explicit exclusions

Do not revive or retarget LINE OFC to `immigrate-worker` unless there is a separate, explicit migration decision.

Do not use `mmd-redirect-worker` as Kenji brain. It must not own `/webhooks/line`; it may only pass through or front-gate routes that are not owned by a more specific worker.

Do not use `admin-worker` as public LINE webhook owner.

Do not use `telegram-worker` as public chatbot owner.

Do not use `himai-chat-worker` for MMD production LINE. It is a pattern reference only.

## Preferred live flow

```txt
LINE Official Account
→ https://mmdbkk.com/webhooks/line
→ member-dashboard-chat-worker
→ ai-worker when answer intelligence is needed
→ Airtable / Console Inbox / Admin handoff
```

## Route requirement

LINE Developers should point to:

```txt
https://mmdbkk.com/webhooks/line
```

Do not point LINE directly to Webflow, Memberstack, page script, Telegram, admin-worker, or a generic redirect route.

## Current safety mode

Start or keep safe mode unless owner review confirms low-risk behavior:

```txt
LINE_AUTO_REPLY_ENABLED=false
LINE_KENJI_AI_ENABLED=true
LINE_KENJI_AI_DEBUG=true
```

If production has already enabled auto reply, only allow low-risk acknowledgement flows. Payment proof, final price, model availability, VIP, Black Card, refund, complaint, and private access remain human or owner review.

## ai-worker role

`ai-worker` should hold only intelligence-side responsibilities:

- search
- retrieval
- ranking
- summarization
- answer support for approved knowledge/context

It must not verify LINE signatures, own LINE public routing, grant access, confirm payment, or make owner-level decisions.

## member-dashboard-chat-worker role

`member-dashboard-chat-worker` owns the LINE entry while this MMD memory lock is active:

- `POST /webhooks/line`
- LINE signature verification
- `Hi Per` / Kenji trigger handling
- safe LINE reply behavior
- Airtable Console Inbox logging
- member-facing LINE continuity

This worker may call `ai-worker` for answer intelligence, but public LINE webhook ownership stays here.

## Route lock

Cloudflare Worker Router owns routing. Webflow displays pages only. Memberstack checks login and permission only. Page scripts must not perform global redirects. Unknown routes must not be sent to `/default` or `/autodirect`.

## Final lock statement

For Kenji LINE, lock runtime responsibility as:

```txt
member-dashboard-chat-worker = LINE webhook owner and Kenji member-facing entry
ai-worker = intelligence and answer support
mmd-redirect-worker = not LINE owner; no Kenji brain role
immigrate-worker = legacy/migration only; do not revive for LINE OFC without explicit decision
```
