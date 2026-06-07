# SIGIL Frontend Worker

`sigil-frontend-worker` is the clean GET-only UI layer for SIGIL/MMD frontend pages.

It must not own backend business logic, Airtable writes, admin authentication,
membership approval, or payment verification. Forms and interactive pages call
existing backend endpoints such as `POST /api/pay/renewal/proof`.

Initial safe routes are preview-only:

- `sigil.mmdbkk.com/_frontend-health*`
- `sigil.mmdbkk.com/_preview/pay/renewal*`

Future production route migration should move GET UI routes here one at a time,
starting with `sigil.mmdbkk.com/pay/renewal*` after explicit approval.
