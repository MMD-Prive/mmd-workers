# MMD Memory — My MMD LIFF duplicated-path / return-flow / route-ownership incident — 2026-09-04

Status: ACTIVE HOTFIX / live route ownership being repaired

## Incident

Three real production symptoms were observed in sequence:

1. A malformed MINI App route:

```text
https://mmdbkk.com/member/liff/member/liff...
{"ok":false,"error":"not_found"}
```

2. After the duplicated-path fix, LINE verification reached the LIFF/member bridge but the customer remained on an intermediate/fallback member shell instead of returning to the canonical My MMD application.

3. Fresh Chrome verification of `https://www.mmdbkk.com/member/my-mmd` still rendered the Webflow fallback page with the heading `MY MMD · PRIVATE MEMBER SPACE` instead of the Lovable presentation proxy.

The third symptom proves that source/deploy success was not the same as live route ownership.

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

## Root cause — My MMD routes existed in source but not in live Cloudflare triggers

`member-dashboard-chat-worker/wrangler.toml` contains the canonical My MMD route patterns for apex + www:

```text
/member/my-mmd*
/member/my-mmd-assets/*
/api/member/app/*
```

However the production deploy workflow intentionally uses `wrangler versions upload` + `wrangler versions deploy`. That promotes Worker code without mutating Cloudflare triggers/routes. The workflow's previous live receipt explicitly reported `route mutation: none`.

Therefore a green Worker deployment could coexist with Webflow still owning `/member/my-mmd` in production. The Chrome screenshot matched the published Webflow page exactly, confirming that this was not a browser cache issue.

Canonical rule:

- `defined in wrangler.toml` != `live Cloudflare route`.
- `versions deploy` != `triggers/routes deploy`.
- Any newly introduced customer route must receive a separate bounded route-sync step using `CLOUDFLARE_ROUTES_API_TOKEN` and must be proven by response ownership headers.
- Never call My MMD live until `/member/my-mmd` returns `x-mmd-route-owner: member-dashboard-chat-worker` and `x-mmd-ui-source: lovable-presentation-proxy` on both apex and www.

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
- `/member/my-mmd-assets/*` — same-origin presentation assets owned by `member-dashboard-chat-worker`.
- `/api/member/app/*` — canonical same-origin My MMD read API, forwarded by `member-dashboard-chat-worker` to `member-pages-worker`.
- `/member/liff` and `/member/api/liff/*` — canonical LIFF/member identity shell and APIs.
- Existing verified LIFF/member session remains the only browser identity authority.
- Webflow `/member/my-mmd` is fallback content only and must not be the live custom-domain owner while the Worker route is healthy.

This incident does not widen or alter membership, entitlement, model access, payment, CARE BACK, coupon, or `approved_discount_percent` authority.

## Hotfixes

### PR #589

- repairs known stale My MMD bundle links that encoded `/member/liff` inside `liff.state`;
- emits the canonical MINI App permanent link;
- adds regression coverage ensuring `/member/liff/member/liff` is not emitted.

Lovable source was also corrected to use the canonical permanent link so the Worker rewrite is defense in depth rather than the long-term source of truth.

### PR #590

- injects a nonce-preserving bounded return bridge only into successful HTML responses for `/member/liff?intent=status`;
- checks `/member/api/liff/profile` with `credentials: "same-origin"`;
- only `HTTP ok + payload.ok === true` permits `window.location.replace("/member/my-mmd")`;
- excludes promo/campaign LIFF routes;
- preserves CSP.

### Route-ownership follow-up

A dedicated route-sync workflow must bind and verify these exact patterns to `member-dashboard-chat-worker` on both apex and www:

```text
/member/my-mmd*
/member/my-mmd-assets/*
/api/member/app/*
```

The workflow must fail on conflicts rather than stealing a route from another Worker, and its production smoke must prove the My MMD response no longer contains the Webflow fallback copy.

## Proof gate

Do not label the whole member flow resolved from CI, generic Worker smoke, or source route config alone.

Required fresh real production check after route sync:

```text
GET /member/my-mmd
-> x-mmd-route-owner = member-dashboard-chat-worker
-> x-mmd-ui-source = lovable-presentation-proxy
-> Webflow fallback copy absent
-> app assets load under /member/my-mmd-assets/*
-> /api/member/app/* is owned by member-dashboard-chat-worker

then real customer flow:
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
