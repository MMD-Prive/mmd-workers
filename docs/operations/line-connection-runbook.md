# MMD LINE Connection Runbook

Purpose: connect LINE Official Account traffic through the existing MMD front gate without creating a new Worker.

## Ownership

- Front gate: `mmd-redirect-worker`
- Public domain: `mmdbkk.com`
- Existing LINE upstream: existing LINE handler with Kenji member memory
- Customer-facing route: `https://mmdbkk.com/webhooks/line`

## Required routing rule

LINE Developers should point to:

```txt
https://mmdbkk.com/webhooks/line
```

Do not point LINE directly to Webflow, Memberstack, or a page script.

## Cloudflare setting

Set the non-public upstream value on `mmd-redirect-worker`:

```txt
LINE_WEBHOOK_UPSTREAM_URL=<existing LINE handler URL>
```

The value must be configured in Cloudflare Worker settings. Do not expose it in Webflow.

## Safe launch flags on the upstream

Start with:

```txt
LINE_AUTO_REPLY_ENABLED=false
LINE_KENJI_AI_ENABLED=true
LINE_KENJI_AI_DEBUG=true
```

This keeps Kenji in receive, log, draft, and handoff mode before any broader auto reply is enabled.

## Production rule

Kenji may acknowledge safe low-risk requests only after review. Payment proof, final price, model availability, VIP or Black Card, refund, complaint, and private access must remain human or owner review.

## Route lock

Cloudflare Worker Router owns routing. Webflow displays pages only. Memberstack checks login and permission only. Page scripts must not perform global redirects. Unknown routes must not be sent to `/default` or `/autodirect`.
