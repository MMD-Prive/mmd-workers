# MMD Memory — My MMD LIFF / return-flow / route-ownership incident — 2026-09-04

Status: ROUTE OWNERSHIP LIVE VERIFIED · REAL MEMBER E2E STILL PENDING

## Incident sequence

Three real production symptoms were observed:

1. LINE MINI App produced a duplicated path:
   `/member/liff/member/liff...` → `not_found`.
2. After that path fix, LINE verification could remain on the LIFF/member bridge instead of returning to My MMD.
3. Fresh Chrome verification of `https://www.mmdbkk.com/member/my-mmd` rendered the Webflow fallback headed `MY MMD · PRIVATE MEMBER SPACE` instead of the Lovable My MMD presentation.

The third symptom proved that source config + green Worker version deployment did not prove live Cloudflare route ownership.

## Root causes and fixes

### 1. Duplicated LIFF endpoint path — PR #589

The MMD Privé MINI App Endpoint URL already owns `/member/liff`. A customer-facing permanent link must never put `/member/liff` inside `liff.state`.

Canonical LIFF ID:

`2010862595-yT4DCEMc`

Canonical explicit verification link:

`https://miniapp.line.me/2010862595-yT4DCEMc/?intent=status`

Hard rule: never manually encode `/member/liff` into `liff.state`.

### 2. LIFF bridge remained visible — PR #590

For the bounded `intent=status` flow, `/member/liff` is identity/session infrastructure, not the final My MMD surface.

Canonical flow:

```text
/member/my-mmd
-> explicit "ยืนยันผ่าน LINE"
-> /member/liff?intent=status
-> LIFF/session verification
-> GET /member/api/liff/profile
-> only HTTP ok + payload.ok=true permits window.location.replace("/member/my-mmd")
-> My MMD reads /api/member/app/*
```

CARE BACK `intent=promo&campaign=care_back` is excluded from this status return bridge.

### 3. My MMD route existed in source but not in live Cloudflare triggers — PR #591 / #592

`member-dashboard-chat-worker/wrangler.toml` already declared My MMD routes, but the production deployment path used `wrangler versions upload` + `wrangler versions deploy`.

That promotes Worker code only. It does **not** create/update Cloudflare route triggers. Previous deployment receipts correctly said `route mutation: none`.

Therefore Webflow could continue serving `/member/my-mmd` even while the intended Worker version was live.

Canonical release rule:

- `defined in wrangler.toml` != live Cloudflare route.
- `versions deploy` != trigger/route deployment.
- A new customer route needs a bounded route-sync step and an ownership smoke.

PR #591 added a dedicated bounded Cloudflare route-sync for both apex + www:

```text
/member/my-mmd*
/member/my-mmd-assets/*
/api/member/app/*
```

PR #592 made the smoke follow the canonical apex → www redirect while preserving strict final ownership checks.

## Live route receipt

Production route-sync workflow run `33863844607` completed successfully on 2026-09-04 at 10:34:11Z (17:34 ICT).

Verified:

- Worker: `member-dashboard-chat-worker`
- `/member/my-mmd*` on apex + www
- `/member/my-mmd-assets/*` on apex + www
- `/api/member/app/*` on apex + www
- My MMD final response: `x-mmd-route-owner=member-dashboard-chat-worker`
- My MMD final response: `x-mmd-ui-source=lovable-presentation-proxy`
- Webflow fallback copy is absent from the final My MMD response

Source SHA for the successful route smoke: `7aff6251db8d694e65349b5d60d7d63e557719b2`.

This closes the **live route-ownership blocker** only.

## Runtime ownership lock

- `/member/my-mmd` — canonical My MMD customer UI; Worker presentation proxy to the published Lovable project.
- `/member/my-mmd-assets/*` — same-origin My MMD presentation assets.
- `/api/member/app/*` — canonical same-origin My MMD read API, forwarded to `member-pages-worker`.
- `/member/liff` + `/member/api/liff/*` — LIFF/member identity and verification infrastructure.
- Webflow `/member/my-mmd` content is fallback only and must not own the live production custom-domain route while the Worker is healthy.
- Lovable owns pixels; GitHub/Workers own behavior and data authority.

Existing LIFF/member session remains the browser identity authority. Browser presentation never creates or widens membership, entitlement, payment truth, model access, CARE BACK entitlement, coupon authority, or `approved_discount_percent`.

## Remaining proof gate

Do not call the entire member flow resolved from route smoke alone.

Still required from a real member browser/LINE session:

```text
CARE BACK / My MMD CTA
-> /member/my-mmd
-> session-required state when needed
-> tap "ยืนยันผ่าน LINE"
-> /member/liff?intent=status
-> LIFF verification
-> same-site profile verifies
-> automatic return to /member/my-mmd
-> /api/member/app/profile + dashboard read real session data
```

The broader real LINE → CARE claim → Wish → trusted booking approval → coupon wallet → explicit `approved_discount_percent` proof remains a separate Issue #583 gate and must not be inferred from the navigation/route fix.
