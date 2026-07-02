# MMD Route Lock Smoke Checklist - 2026-07-01

Use these checks without secrets. Run with redirects disabled first.

## Route Smoke

```bash
curl -I -sS https://mmdbkk.com/sigil/pay/membership
curl -I -sS 'https://mmdbkk.com/sigil/pay/membership?code=TEST'
curl -I -sS 'https://mmdbkk.com/sigil/pay/membership?package=premium'
curl -I -sS 'https://mmdbkk.com/sigil/pay/membership?plan=standard'
curl -I -sS https://www.mmdbkk.com/sigil/pay/membership
curl -I -sS 'https://www.mmdbkk.com/sigil/pay/membership?code=TEST'
curl -I -sS https://mmdbkk.com/pay/membership
curl -I -sS 'https://mmdbkk.com/pay/membership?plan=standard'
curl -I -sS https://mmdbkk.com/sigil/pay/renewal
curl -I -sS https://www.mmdbkk.com/sigil/pay/renewal
curl -I -sS https://mmdbkk.com/pay/renewal
curl -I -sS https://www.mmdbkk.com/pay/renewal
curl -I -sS https://mmdbkk.com/unknown-test-route-mmd
```

Expected:

- `/sigil/pay/membership` is not `301`, `302`, `307`, or `308` to `/sigil/pay/renewal`.
- `Location` must not contain `/sigil/pay/renewal` on membership payment routes.
- Membership routes must not include `x-mmd-route-source: member-dashboard-chat-worker:sigil-pay-renewal`.
- `/pay/membership` is served safely through the front gate/member pages path.
- `/sigil/pay/renewal` and `/pay/renewal` remain manual legacy renewal evidence routes.
- Unknown routes do not redirect to `/default`, `/autodirect`, or `/sigil/pay/renewal`.

## LIFF Smoke

```bash
curl -sS -X POST https://mmdbkk.com/member/api/liff/identify \
  -H 'content-type: application/json' \
  --data '{"line_user_id":"Ucodexmin_route_lock_check","entry_route":"renewal","t":"tok"}'

curl -sS -X POST https://mmdbkk.com/member/api/liff/identify \
  -H 'content-type: application/json' \
  --data '{"line_user_id":"Ucodexmin_route_lock_check","entry_route":"pay_membership","t":"tok"}'
```

Expected renewal response:

- `ok: true`
- `intent: membership_review`
- `next_route: /member/membership?t=tok`
- `safe_next.renewal: null`
- `safe_next.sigil_payment: /sigil/pay/membership?t=tok`
- response does not include `/sigil/pay/renewal`

Expected pay_membership response:

- `ok: true`
- `next_route: /pay/membership?t=tok`
- `safe_next.renewal: null`
- `safe_next.sigil_payment: /sigil/pay/membership?t=tok`

## Worker Route Ownership

Expected Worker route ownership:

- no `mmdbkk.com/sigil/pay/membership*` route assigned to `member-dashboard-chat-worker`;
- no `www.mmdbkk.com/sigil/pay/membership*` route assigned to `member-dashboard-chat-worker`;
- `member-dashboard-chat-worker` may own only explicit manual renewal routes:
  - `mmdbkk.com/pay/renewal*`
  - `www.mmdbkk.com/pay/renewal*`
  - `mmdbkk.com/sigil/pay/renewal*`
  - `www.mmdbkk.com/sigil/pay/renewal*`

Do not recreate the deleted membership route bindings.
