# MY MMD LIFF → Lovable Presentation V3 — 2026-09-28

Status: OWNER DIRECTION — SOURCE IMPLEMENTED, NOT YET PRODUCTION-ACCEPTED
Owner: Per
Timezone: Asia/Bangkok

## Decision

The normal MY MMD customer journey uses **LIFF for verified LINE/session establishment** and then hands the customer to the **same-origin Lovable MY MMD presentation**.

Canonical path:

```text
Rich Menu / LINE
  -> /member/liff?intent=status
  -> GET /member/api/liff/status when a same-host session may already exist
  -> otherwise LINE LIFF verification
  -> POST /member/api/liff/start
  -> verified __Host-mmd_liff_session
  -> /my-mmd/
  -> member-dashboard-chat-worker presentation proxy
  -> Lovable presentation bytes with MMD credentials stripped upstream
  -> same-origin /api/member/app/*
  -> member-pages-worker / canonical backend truth
```

LIFF is not the final member dashboard for the normal status launch.

Lovable owns presentation only. It does not own identity, authentication, membership, entitlement, Points, payment truth, history reconstruction, booking truth, Private Media authority, or protected access.

## Presentation source

Production presentation origin used by the Worker:

`https://my-mmd-member-profile.lovable.app`

Customer-visible URLs remain on `mmdbkk.com` / `www.mmdbkk.com`.

The Worker:
- strips Cookie and Authorization before requesting Lovable;
- republishes executable assets through `/my-mmd-assets/*`;
- rewrites bounded app links into `/my-mmd/*`;
- keeps all member reads on the same-origin MMD BFF.

## Customer history authority

Lovable history reads only:

`GET /api/member/app/history`

Truth chain:

```text
verified LINE / LIFF session
  -> same-origin /api/member/app/history
  -> member-dashboard-chat-worker
  -> MEMBER_PAGES_WORKER
  -> member-pages-worker
  -> canonical customer/session/payment/history sources
```

The browser never selects the customer by Client ID, LINE user id, member id, payment ref, or other identity field.

If history is unresolved, presentation remains checking/recovery-safe. It must not invent an empty history.

History recovery remains Worker-owned:
- `GET /api/member/app/history/recovery`
- bounded `POST /api/member/app/history/refresh` where supported.

## Points

Keep the rolling-lot policy from PR #1898:
- each approved Points lot expires 365 days from its own entry date;
- redemption consumes the lot expiring first;
- reserve / capture / release / refund remain backend operations;
- UI may render backend-owned active balance, `expiring_points`, `nearest_expiry`, and per-lot `expires_at`;
- browser code never calculates authoritative Points or membership.

## LIFF status bridge

For `intent=status`:

1. Check `GET /member/api/liff/status` using same-origin credentials.
2. If a verified same-host session exists, go directly to `/my-mmd/`.
3. Otherwise initialize LIFF, verify the LINE ID token, and call `POST /member/api/liff/start`.
4. Any successful verified session may enter `/my-mmd/` even when a canonical historical member row is still being recovered.
5. Missing/failed verification stays fail-closed in the bounded LIFF recovery surface.
6. Do not require the full member profile merely to establish the session bridge.

The `__Host-` session remains host-only. A customer who established the session on the apex host stays on that host so the verified cookie is not lost during an unnecessary host redirect.

## Specialized LIFF intents

Bounded specialized flows may keep their current destination:
- `private_teaser` -> exact allowed MY MMD private-preview route;
- `continue_payment` -> `/my-mmd/payments`;
- signup / promo / renew keep their dedicated LIFF/product flow unless separately changed.

These exceptions do not create a second authority model.

## Lovable contract

The current My MMD Lovable project already uses same-origin MMD APIs:
- Dashboard -> `/api/member/app/dashboard`
- Profile -> `/api/member/app/profile`
- Membership -> `/api/member/app/membership`
- Points -> `/api/member/app/points`
- Coupons -> `/api/member/app/coupons`
- History -> `/api/member/app/history`
- CARE -> `/api/member/app/care`

The presentation must never:
- store or mint a parallel member identity;
- use a Lovable-local customer history source;
- infer access from browser state;
- expose raw Airtable, R2, payment, or LINE identifiers;
- calculate entitlement or money truth;
- forward MMD member cookies or Authorization headers to the Lovable origin.

## Acceptance

Do not call this production-accepted until a real LINE account proves:

1. Rich Menu / status LIFF establishes the verified session.
2. The status journey hands off to `/my-mmd/`.
3. The host-only session survives that handoff.
4. The customer sees the Lovable MY MMD UI while the browser URL remains on the MMD domain.
5. `/api/member/app/history` resolves the signed-in customer or stays checking without false empty state.
6. Points active balance and expiry fields match backend truth.
7. No raw LINE ID, Client ID, payment ref, Airtable record ID, or backend credential leaks to the browser.
8. Lovable-origin requests receive no MMD Cookie or Authorization header.
9. Specialized intents remain bounded to their exact approved destinations.
10. A failed verification remains on a clear recovery surface and does not loop indefinitely.
