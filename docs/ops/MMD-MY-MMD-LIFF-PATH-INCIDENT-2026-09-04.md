# MMD Memory — My MMD LIFF duplicated-path incident — 2026-09-04

Status: ACTIVE HOTFIX / production smoke pending

## Incident

Observed on a real mobile LINE/MINI App open:

```text
https://mmdbkk.com/member/liff/member/liff...
{"ok":false,"error":"not_found"}
```

This is a routing-construction failure, not evidence that member identity, entitlement, CARE BACK, or the My MMD API itself is broken.

## Root cause

The My MMD session gate used a LINE MINI App URL that manually supplied:

```text
liff.state=/member/liff?intent=status
```

The LINE MINI App Endpoint URL already owns `/member/liff`. LINE combines the Endpoint URL with additional information from the MINI App permanent link. Encoding `/member/liff` again therefore produced the duplicated path:

```text
/member/liff/member/liff
```

## Canonical rule

MMD Privé member MINI App LIFF ID:

```text
2010862595-yT4DCEMc
```

Canonical explicit-tap verification link:

```text
https://miniapp.line.me/2010862595-yT4DCEMc/?intent=status
```

Hard rule:

- Never manually set `liff.state` in a customer-facing MINI App link.
- Never place `/member/liff` inside `liff.state`.
- `/member/liff` is already the configured Endpoint URL path.
- Additional intent/query belongs after the MINI App LIFF URL.
- Session verification remains explicit tap only; no automatic app switch or redirect loop.

## Runtime ownership

- `/member/my-mmd` — canonical My MMD presentation route, owned by `member-dashboard-chat-worker` presentation proxy.
- `/api/member/app/*` — canonical same-origin My MMD read API, forwarded by `member-dashboard-chat-worker` to `member-pages-worker`.
- `/member/liff` and `/member/api/liff/*` — canonical LIFF/member identity shell and APIs.
- Existing verified LIFF/member session remains the only browser identity authority.

This incident does not widen or alter membership, entitlement, model access, payment, CARE BACK, coupon, or `approved_discount_percent` authority.

## Hotfix

GitHub PR #589:

- rewrites known stale My MMD bundle links that encode `/member/liff` inside `liff.state`;
- emits the canonical MINI App permanent link;
- adds regression coverage ensuring `/member/liff/member/liff` is not emitted.

Lovable source was also corrected to use the canonical permanent link so the Worker rewrite is defense in depth rather than the long-term source of truth.

## Proof gate

Do not label the member flow fully resolved from unit/CI evidence alone.

Required fresh production check after deployment:

```text
CARE BACK / My MMD CTA
-> /member/my-mmd
-> session-required state (when no session)
-> tap "ยืนยันผ่าน LINE"
-> LINE MINI App opens
-> /member/liff?intent=status (or slash-equivalent)
-> LIFF init/session verification
-> /api/member/app/profile and /api/member/app/dashboard return through same-origin session
```

The broader real-LINE -> CARE claim -> Wish -> coupon wallet -> explicit `approved_discount_percent` proof remains a separate gate and must not be inferred from this navigation fix.
