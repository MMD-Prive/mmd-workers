# SĪGIL Payment MINI App ingress

Published LINE MINI App `2010830159-0n1O3ANK` has the endpoint
`https://sigil.mmdbkk.com/sigil/pay` (confirmed in LINE Developers Console on 2026-10-17).
The endpoint returned Cloudflare 522 because the sigil host had no matching page route.
The canonical Webflow presentation at `https://www.mmdbkk.com/sigil/pay` returned 200.

This dedicated Worker owns only the exact `/sigil/pay` and `/sigil/pay/` paths on
the sigil host. It fetches the current unsigned Webflow page, preserves its design,
initializes the published LIFF app in LINE, and repairs the v21 token parser to accept
LIFF state with a path (`/?t=...`). It waits for LIFF initialization before loading
payment details. External signed browser links continue without requiring LINE login.
Relative navigation links point to the working www host; fragment links stay local.

The upstream request contains no incoming query, cookie or authorization headers.
HTML is limited to 512 KiB; an unavailable or changed upstream contract returns 503.
Responses are private/no-store with no-referrer, and observability redacts query strings.

`payments-worker` remains the money authority and owns the existing `/v1/pay/*`,
`/v1/payments/*`, `/v1/confirm/*` routes. This Worker cannot create payment refs,
verify payments, receive slips, modify bank details or grant membership.
Renewal and compatibility routes retain their current owners. DNS is unchanged.

## Validation

`node --test workers/sigil-pay-proxy-worker/index.test.mjs`

Production checks: GET/HEAD for both exact paths; unsigned and invalid signed links
show no payment details; existing API and renewal routes retain their owners.
A valid real customer payment still requires a mobile LINE acceptance check.

## Deployment and rollback

Deploy `index.mjs` as a module Worker using `wrangler.jsonc`, or upload the exact
module through the Cloudflare Workers API and add the two exact routes.
Keep the deployed source SHA in the deployment receipt/description.
Rollback is removal of those two routes and the dedicated Worker. It does not
roll back or redeploy an existing backend Worker.
