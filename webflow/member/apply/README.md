# MMD Privé Member Application Gate

Canonical frontend route: `/sigil/member/apply`.

## Webflow placement

- HTML: Webflow Embed
- CSS: Page Settings, before `</head>`
- JS: Page Settings, before `</body>`

## Public configuration

```html
data-api-base="https://sigil.mmdbkk.com"
data-submit-path="/v1/member/applications"
data-dashboard-url="/sigil/member/dashboard"
data-membership-url="/sigil/member/membership"
data-help-url="https://t.me/mmdapply"
```

No secret, bearer token, API key, confirm key, or admin credential belongs in the frontend.

## Request contract

```http
POST https://sigil.mmdbkk.com/v1/member/applications
Content-Type: application/json
X-Idempotency-Key: member-apply:YYYY-MM-DD:<fingerprint>
```

Required locks:

```json
{
  "source": "member_apply",
  "route": "/sigil/member/apply"
}
```

The page preserves `t`, `code`, and `promo` and carries them into Membership and Member Dashboard links.

## Browser privacy

Draft data uses `sessionStorage`, not `localStorage`. The draft is scoped to the current browser tab/session and is removed after successful submission.

## Member lane

- Kenji is the client/member continuity surface.
- The page is for MMD membership, Public Models, curated male-model services, and member privileges.
- It is not model recruitment.
- Membership selection is canonical at `/sigil/member/membership`; `/member/membership` remains a query-preserving compatibility redirect.
- Member continuity goes to `/sigil/member/dashboard`.

## Deployment order

1. Deploy the Worker/backend contract accepting `route = /sigil/member/apply`.
2. Publish the Webflow frontend at `/sigil/member/apply`.
3. Verify `POST /v1/member/applications` with `t`, `code`, and `promo`.
4. Confirm successful responses return a stable `application_reference`.
5. Smoke test online, timeout, validation, duplicate, and error states.
