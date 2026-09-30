# SIGIL Booking SKB26 page code

Canonical route: `/sigil/booking`

## Webflow placement

These files are the repository source for the page-level custom code on Webflow page `69dfc48bf362a5a92612f00a`.

- `sigil-booking-head.html` → **Page Settings → Inside <head>**
- `sigil-booking-footer.html` → **Page Settings → Before </body>**
- The page Section `#sigil-booking-compact[data-skb25-root]` is the render root.

Do not paste the combined head + footer runtime into the legacy HtmlEmbed. The combined code can exceed Webflow's HtmlEmbed character limit and, more importantly, duplicates the page-level script. The legacy HtmlEmbed should stay a harmless placeholder only.

Before a Webflow update, compare the current page freeform code with the repo source for drift. Publishing and production verification are separate steps.

## Authority

SKB26 is presentation only. Entitlement, Model visibility, customer rate, approved media, protected Model access, payment, and final booking authority stay on the existing backend contracts.

The frontend must preserve query parameter `t`, use the canonical `/sigil/api/*` contract, and must not create a second search/booking authority path.
