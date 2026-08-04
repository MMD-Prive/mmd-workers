# Public World / Private Boundary

Status: approved product and privacy boundary.

## Rule

Every customer-facing page, artwork, message, button, redirect, rich-menu
destination, and browser-visible system response in Public World or MMD Privé
must not:

- mention or advertise Private Models;
- expose a `/sigil/*` path or `sigil.mmdbkk.com` destination; or
- direct a customer from a public surface into a private SIGIL route.

Public customer journeys must use public routes such as `/hall`,
`/member/membership`, `/member/dashboard`, and `/pay/membership`. A public
same-origin API may proxy to its approved backend internally, but the browser
must not receive a private route as its next destination.

## Exception

The only exception is the approved sex-selection control. The exception is
limited to selecting or filtering by sex; it does not permit Private Models
copy, private-model identities, or a `/sigil/*` destination.

## Internal systems

Authenticated admin, model, and SIGIL implementations may keep their direct
private routes. They must not leak those routes, labels, or destinations into
public HTML, artwork, redirects, LINE rich menus, LIFF responses, or member
application flows.

## Change gate

Any future public-surface change must include a focused check showing that its
rendered copy and destinations comply with this boundary. Deployment, Webflow
publication, Cloudflare route changes, and merge remain separate approvals.
