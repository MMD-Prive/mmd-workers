# Care Back Wishes — release gate

## Intent

Route: `/promotion/6-years-care-back/wishes`

- Visitors see a closed Member gate only.
- A verified existing Member may read published wishes and submit a new wish anonymously.
- The public response contains only `wish_id`, `text`, and `created_at`.
- Writer identity is never sent to Webflow or any Member browser.
- Per-only identity access must be authorized server-side by an existing owner session. A generic admin role is insufficient.

## Dependency order

1. Merge and deploy PR #227 (`feat/liff-identity-foundation`).
2. Implement the server endpoint `/member/api/liff/wishes` against the server-issued LIFF session:
   - no browser-supplied LINE or Member identity;
   - fail closed if identity is not an existing Member;
   - store writer identity privately;
   - enforce a publication state and rate limits;
   - return anonymous objects only.
3. Bind a dedicated owner-only internal endpoint to the established admin-session authority.
4. Register the exact production route in the redirect/front-gate owner; do not use a wildcard handler.
5. Create the Webflow page and paste the three files in this directory:
   - `wishes.html` into an Embed
   - `wishes.css` in page `<head>`
   - `wishes.js` before `</body>`
6. Keep the page non-indexed until the API, owner authorization, and browser-smoke checks pass.

## Required server checks

- `GET /member/api/liff/wishes` returns 401 without a valid server session.
- Existing but unverified / non-Member identity returns 403.
- Public JSON has no author, identity, tier, payment, profile, or internal fields.
- `POST` derives author identity from the server session only and rejects extra identity fields.
- Owner-only endpoint rejects generic admin accounts and responds `Cache-Control: no-store`.
- A member cannot submit more than 1 wish per 10 minutes or 5 per day.

## Webflow scope

The frontend starts a server-verified LIFF session through `POST /member/api/liff/start`; it never sends a LINE user ID, Member ID, or role. It then uses same-origin, HttpOnly session cookies for the wishes requests.
