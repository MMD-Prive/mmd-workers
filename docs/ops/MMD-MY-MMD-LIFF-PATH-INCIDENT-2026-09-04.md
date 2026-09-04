# MMD Memory — My MMD LIFF duplicated-path / return-flow incident — 2026-09-04

Status: ACTIVE HOTFIX / return-flow production smoke pending

## Incident

Two real mobile symptoms were observed in sequence:

1. A malformed MINI App route:

```text
https://mmdbkk.com/member/liff/member/liff...
{"ok":false,"error":"not_found"}
```

2. After the duplicated-path fix, LINE verification reached the LIFF/member bridge but the customer remained on an intermediate/fallback member shell instead of returning to the canonical My MMD application.

These are navigation/orchestration failures. They are not evidence that member identity, entitlement, CARE BACK, or the My MMD read API itself is broken.

## Root cause — duplicated path

The My MMD session gate used a LINE MINI App URL that manually supplied:

```text
liff.state=/member/liff?intent=status
```

The LINE MINI App Endpoint URL already owns `/member/liff`. LINE combines the Endpoint URL with additional information from the MINI App permanent link. Encoding `/member/liff` again therefore produced:

```text
/member/liff/member/liff
```

## Root cause — bridge page remained visible

`/member/liff?intent=status` correctly creates or reuses the same-site member session, but the legacy LIFF shell was also capable of rendering member information itself. For the new My MMD architecture, that shell is a verification bridge, not the final customer surface.

The correct status flow is:

```text
/member/my-mmd
-> explicit "ยืนยันผ่าน LINE"
-> MINI App /member/liff?intent=status
-> LIFF/session verification
-> GET /member/api/liff/profile proves the same-site session works
-> window.location.replace("/member/my-mmd")
-> My MMD reads /api/member/app/*
```

The return must happen only after the profile endpoint returns `ok=true`. Do not redirect merely because the LIFF page opened, and do not infer member status in the browser.

## Canonical permanent-link rule

MMD Privé member MINI App LIFF ID:

```text
2010862595-yT4DCEMc
```

Canonical explicit-tap verification link:

```text
https://miniapp.line.me/2010862595-yT4DCEMc/?intent=status
```

Hard rules:

- Never manually set `liff.state` in a customer-facing MINI App link.
- Never place `/member/liff` inside `liff.state`.
- `/member/liff` is already the configured Endpoint URL path.
- Additional intent/query belongs after the MINI App LIFF URL.
- Session verification remains explicit tap only; no automatic app switch before user action.
- For the bounded `intent=status` member-verification flow, return to `/member/my-mmd` only after `/member/api/liff/profile` proves the same-site session.
- CARE BACK `intent=promo&campaign=care_back` remains on its dedicated guarded flow and must not receive the status auto-return bridge.

## Runtime ownership

- `/member/my-mmd` — canonical My MMD presentation route, owned by `member-dashboard-chat-worker` presentation proxy.
- `/api/member/app/*` — canonical same-origin My MMD read API, forwarded by `member-dashboard-chat-worker` to `member-pages-worker`.
- `/member/liff` and `/member/api/liff/*` — canonical LIFF/member identity shell and APIs.
- Existing verified LIFF/member session remains the only browser identity authority.

The LIFF shell is identity/session infrastructure. It is not the canonical final My MMD presentation surface for the status flow.

This incident does not widen or alter membership, entitlement, model access, payment, CARE BACK, coupon, or `approved_discount_percent` authority.

## Hotfixes

### PR #589

- repairs known stale My MMD bundle links that encoded `/member/liff` inside `liff.state`;
- emits the canonical MINI App permanent link;
- adds regression coverage ensuring `/member/liff/member/liff` is not emitted.

Lovable source was also corrected to use the canonical permanent link so the Worker rewrite is defense in depth rather than the long-term source of truth.

### Return-flow follow-up

- `member-dashboard-chat-worker` injects a nonce-preserving bounded return bridge only into successful HTML responses for `/member/liff?intent=status`;
- the bridge checks `/member/api/liff/profile` with `credentials: "same-origin"`;
- only `HTTP ok + payload.ok === true` permits `window.location.replace("/member/my-mmd")`;
- the check is bounded and stops after a short retry window;
- promo/campaign LIFF routes are explicitly excluded;
- CSP remains enforced by reusing the existing server-generated nonce.

## Proof gate

Do not label the whole member flow resolved from CI or generic Worker smoke alone.

Required fresh real production check after deployment:

```text
CARE BACK / My MMD CTA
-> /member/my-mmd
-> session-required state (when no session)
-> tap "ยืนยันผ่าน LINE"
-> LINE MINI App opens
-> /member/liff?intent=status
-> LIFF init/session verification
-> same-site profile verifies
-> browser returns to /member/my-mmd
-> /api/member/app/profile and /api/member/app/dashboard read through the same-site session
```

The broader real-LINE -> CARE claim -> Wish -> coupon wallet -> explicit `approved_discount_percent` proof remains a separate gate and must not be inferred from this navigation fix.
