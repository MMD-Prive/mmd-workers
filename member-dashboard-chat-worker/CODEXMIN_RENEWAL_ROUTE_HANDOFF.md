# CODEXMIN — Renewal Route Handoff

Status: ready for minimal source-owner patch, not production-deployed by this document.

## Context

The canonical renewal renderer already exists at:

```text
member-dashboard-chat-worker/src/renderers/single-renewal-renderer.js
```

The canonical test already exists at:

```text
member-dashboard-chat-worker/test/renewal-route.test.mjs
```

The renderer exports:

```js
isRenewalRoute(pathname)
renderRenewalResponse(request, env)
```

## Minimal patch required

Patch only the real production entrypoint for `member-dashboard-chat-worker`.

Do not create a replacement worker entrypoint unless it is confirmed to be the deployed source of truth.

Add this near the top of the production entrypoint:

```js
import {
  isRenewalRoute,
  renderRenewalResponse,
} from "./renderers/single-renewal-renderer.js";
```

Add this before any Webflow fallback, legacy renewal renderer, admin route, or generic catch-all:

```js
const url = new URL(request.url);

if (isRenewalRoute(url.pathname)) {
  return renderRenewalResponse(request, env);
}
```

## Route family to verify

```text
https://mmdbkk.com/pay/renewal
https://www.mmdbkk.com/pay/renewal
https://sigil.mmdbkk.com/pay/renewal
https://mmdbkk.com/sigil/pay/renewal
https://www.mmdbkk.com/sigil/pay/renewal
https://sigil.mmdbkk.com/sigil/pay/renewal
```

## Expected headers

```text
x-mmd-worker: member-dashboard-chat-worker
x-mmd-page: sigil-pay-renewal
x-mmd-route-source: member-dashboard-chat-worker:single-renewal-renderer
x-mmd-upstream-source: local-renderer
```

## Forbidden markers

Runtime HTML and bundle must not include:

```text
Renew with Kenji
Proof enters official review only
mmd-renewal-kenji-public
Ready to Start
data-bank-display
fetchSigilPayRenewalFromWebflow
RENEWAL_WEBFLOW_SOURCE_ORIGIN
RENEWAL_WEBFLOW_SOURCE_PATH
```

## Pre-deploy commands

```bash
node --check member-dashboard-chat-worker/src/renderers/single-renewal-renderer.js
node --test member-dashboard-chat-worker/test/renewal-route.test.mjs
```

## Important safety note

The previous route audit noted that the broader production `member-dashboard-chat-worker` contains LINE, Telegram webhook/admin/payment-review logic. Do not replace that worker with a new minimal index unless the full production source has been reconciled.

This handoff intentionally avoids creating a new runtime entrypoint because doing so could drop coupled production behavior.
