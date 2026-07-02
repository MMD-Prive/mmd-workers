# CODEXMIN — MMD / SĪGIL Renewal Route Production Patch v2

## Task

Apply the minimal production route patch for the MMD / SĪGIL Renewal Payment Review page.

## Repository

```text
MMD-Prive/mmd-workers
```

## Target worker

```text
member-dashboard-chat-worker
```

## Canonical page

```text
Renewal Payment Review
```

## Canonical lock

```text
Canonical marker: mmd-renewal-single
Canonical renderer: member-dashboard-chat-worker/src/renderers/single-renewal-renderer.js
Canonical test: member-dashboard-chat-worker/test/renewal-route.test.mjs
```

## Important

Do not create a new worker entrypoint.

Do not replace the existing `member-dashboard-chat-worker` entrypoint.

Do not remove or disturb existing LINE, Telegram webhook, admin, payment-review, dashboard, chat, or member continuity logic.

Patch only the real production entrypoint for `member-dashboard-chat-worker`.

## Reason

`member-dashboard-chat-worker` is not only a renewal renderer. It may contain coupled production behavior for member dashboard, client continuity, LINE/Telegram, admin/payment review, and route handling. Replacing it with a minimal index can break production behavior.

## Objective

Wire the canonical renewal renderer into the real production entrypoint so all renewal route variants are served locally by `member-dashboard-chat-worker` before any Webflow fallback, legacy renewal renderer, admin route, or generic catch-all.

## Routes that must be owned by this renderer

```text
https://mmdbkk.com/pay/renewal
https://www.mmdbkk.com/pay/renewal
https://sigil.mmdbkk.com/pay/renewal
https://mmdbkk.com/sigil/pay/renewal
https://www.mmdbkk.com/sigil/pay/renewal
https://sigil.mmdbkk.com/sigil/pay/renewal
```

Also support trailing slash versions of the same routes.

## Required import

Add this import near the top of the real production entrypoint, using the correct relative path from that file:

```js
import {
  isRenewalRoute,
  renderRenewalResponse,
} from "./renderers/single-renewal-renderer.js";
```

If the entrypoint is not in `member-dashboard-chat-worker/src/`, adjust the relative path correctly. Do not duplicate renderer logic inline.

## Required route guard

Inside the fetch handler, after `const url = new URL(request.url);` exists or after creating it, add this guard before Webflow fallback, legacy renewal handling, admin route handling, or generic catch-all:

```js
if (isRenewalRoute(url.pathname)) {
  return renderRenewalResponse(request, env);
}
```

If `url` is already declared, reuse the existing declaration. Do not redeclare in the same scope.

## Expected production headers for all renewal routes

```text
x-mmd-worker: member-dashboard-chat-worker
x-mmd-page: sigil-pay-renewal
x-mmd-route-source: member-dashboard-chat-worker:single-renewal-renderer
x-mmd-upstream-source: local-renderer
```

## Runtime source rule

Renewal routes must not use Webflow as runtime source.

## Forbidden

- Do not proxy renewal routes to Webflow
- Do not fallback renewal routes to Webflow
- Do not let `admin-worker` own renewal routes
- Do not restore `immigrate-worker` legacy renewal assets
- Do not create a second renewal renderer
- Do not let URL params like `?status=paid` or `?status=confirmed` display verified/success state without backend verification
- Do not introduce customer-facing copy that says “slip is not confirmation” or hard/technical language

## Forbidden legacy markers

Runtime HTML, worker bundle, and renderer path must not contain:

```text
Renew with Kenji
Proof enters official review only
mmd-renewal-kenji-public
Ready to Start
data-bank-display
fetchSigilPayRenewalFromWebflow
RENEWAL_WEBFLOW_SOURCE_ORIGIN
RENEWAL_WEBFLOW_SOURCE_PATH
```

## Customer-facing copy principle

Use gentle, human, confidence-building Thai copy.

Preferred copy:

```text
ส่งหลักฐานไว้ให้ MMD ตรวจรายการได้เลยครับ
สถานะสมาชิกจะอัปเดตหลังยอดจริงถูกตรวจสอบเรียบร้อยแล้ว
```

Do not use harsh phrasing such as:

- สลิปไม่ใช่การยืนยัน
- Proof only
- Default bank
- Before payment

## MMD IA / character memory

- Kenji = client/member continuity assistant
- Kenji may support renewal/payment wording as access support, but Kenji must not approve payment or membership state
- MMD/system/backend owns verification
- Boss Per = authority layer, not overused in payment UI
- TarT = apply/model intelligence lane only, not client renewal/payment guide
- `/sigil/inme` = access gate / login / password recovery / renewal hub
- `/member/dashboard` = member home / client continuity dashboard
- Renewal payment proof enters review flow only

## Safe payment state model

Use only backend verification from the status endpoint to show final verified/member-updated state.

Safe UI state sequence:

```text
Prepare payment
Upload proof
MMD review
Verified
Member status updated
```

URL params may prefill amount, token, session_id, payment_ref, package, or plan.

URL params must not create final success state.

## Pre-deploy checks

Run:

```bash
node --check member-dashboard-chat-worker/src/renderers/single-renewal-renderer.js
node --test member-dashboard-chat-worker/test/renewal-route.test.mjs
```

Also scan for forbidden markers:

```bash
grep -R "Renew with Kenji\|Proof enters official review only\|mmd-renewal-kenji-public\|Ready to Start\|data-bank-display\|fetchSigilPayRenewalFromWebflow\|RENEWAL_WEBFLOW_SOURCE_ORIGIN\|RENEWAL_WEBFLOW_SOURCE_PATH" member-dashboard-chat-worker docs webflow && exit 1 || true
```

If the scan finds a forbidden marker in a non-runtime lock/checklist document, do not delete the lock document blindly. Report the exact file and decide whether the context is allowed documentation or runtime-risk. Runtime path must be clean.

## Post-deploy smoke

GET all 6 routes:

```text
https://mmdbkk.com/pay/renewal
https://www.mmdbkk.com/pay/renewal
https://sigil.mmdbkk.com/pay/renewal
https://mmdbkk.com/sigil/pay/renewal
https://www.mmdbkk.com/sigil/pay/renewal
https://sigil.mmdbkk.com/sigil/pay/renewal
```

Each must return:

- HTTP 200
- `x-mmd-worker: member-dashboard-chat-worker`
- `x-mmd-page: sigil-pay-renewal`
- `x-mmd-route-source: member-dashboard-chat-worker:single-renewal-renderer`
- `x-mmd-upstream-source: local-renderer`

Each body must contain:

- `mmd-renewal-single`
- `MMD / SIGIL`
- `Renewal Payment Review`

Each body must not contain forbidden legacy markers.

## Important safety note

If the real production entrypoint is unclear, stop and report candidate files instead of creating a new entrypoint.

## Expected final report

1. Entry file patched
2. Import path used
3. Guard position, especially what it is before
4. `node --check` result
5. `node --test` result
6. Forbidden marker scan result
7. Deploy version if deployed
8. Smoke result for all 6 routes
9. Any files intentionally not touched
