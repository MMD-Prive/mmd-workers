# `/pay/checkout` — Signed Public Payment surface

Created: **2026-09-19**

Webflow page ID: `6aae319cc7f3706031a84e4d`

Canonical signed payment renderer for:
- Public Membership: `mmd_member`, `elite`, `red_card`
- TMIB single-episode purchases such as `tmib_act_001`

## URL contract

Only:
`/pay/checkout?t=<signed token>`

No browser amount/package/account/QR/payment-ref query value is authoritative.

The backend chooses this public surface from server-owned package/stage context. Private Membership, Black Card and service/job payments remain on `/sigil/pay?t=...`.

## Runtime

The page keeps the proven SIGIL Pay v18 mechanics:
- server Payment Instructions;
- server-returned amount;
- server-returned payment methods/destinations;
- proof upload;
- pending verification state;
- payment history handoff.

Presentation is MMD Public rather than SIGIL.

Proof source is `public_pay`, which is accepted by unified payment proof intake as a canonical web source.

## Safety

- proof is evidence only;
- Official Verify is required;
- no browser-created payment ref/session;
- no hard-coded money destination;
- no route conversion to `/sigil/pay`;
- fail closed when signed token or backend instructions are unavailable;
- excluded from sitemap and `noindex,nofollow`.
