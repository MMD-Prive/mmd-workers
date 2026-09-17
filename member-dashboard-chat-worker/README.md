# member-dashboard-chat-worker

Production front-gate worker for LINE/LIFF entry, canonical My MMD presentation ingress, and the same-origin member BFF handoff.

Deploy preflight:

- Deploy only from the checked-out `member-dashboard-chat-worker/` source tree; never deploy from `.wrangler/` cache output.
- Confirm `src/my-mmd-lovable-app-front-gate.js`, `src/front-gate-index.js`, tests, and `wrangler.toml` exist.
- Confirm the canonical My MMD routes remain declared for both `mmdbkk.com` and `www.mmdbkk.com`: `/my-mmd*`, `/my-mmd-assets/*`, `/api/member/app/*`, plus legacy `/member/my-mmd*` compatibility routes.
- Confirm the `MEMBER_PAGES_WORKER` service binding points to `member-pages-worker`.
- Keep production My MMD presentation at `https://my-mmd-member-profile.lovable.app`; customer traffic remains on `https://mmdbkk.com/my-mmd/` or `https://www.mmdbkk.com/my-mmd/`.
- Never forward MMD member cookies or Authorization headers to the Lovable presentation origin.
- Run the member dashboard LIFF/LINE test suites and Cloudflare upload dry-run before deployment.

My MMD contract:

- `/my-mmd/` is the canonical customer dashboard entrypoint.
- `/member/my-mmd*` is compatibility-only and redirects with HTTP 308 to the matching `/my-mmd/*` route.
- Lovable owns presentation only.
- `/api/member/app/*` remains Worker-owned and same-origin.
- `member-dashboard-chat-worker` forwards member reads through the private `MEMBER_PAGES_WORKER` service binding.
- `member-pages-worker` owns verified member/session adapters and canonical member reads.
- Membership, Points, coupons, entitlement, lifecycle, payment, and access truth must never be inferred by the presentation layer.
- A missing or unresolved member state must fail closed; it must not be replaced with mock/demo values.

Safety contract:

- LINE/LIFF is an entry and verified-session layer, not a second customer dashboard.
- Payment proof is evidence only until official verification.
- Public menu fallback must not activate membership, payments, points, packages, or dashboard access.
- Dashboard and private actions stay gated by trusted Worker state.
- `trusted_event` is only a semantic guard, never the authentication boundary.
