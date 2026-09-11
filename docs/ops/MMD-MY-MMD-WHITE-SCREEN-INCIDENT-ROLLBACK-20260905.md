# MMD Memory — My MMD White-Screen Incident Rollback — 2026-09-05

Status: PRODUCTION INCIDENT OVERRIDE
Decision owner: Per

## Incident

A real customer/device opening the canonical My MMD route observed a blank white presentation on both the canonical address and the legacy address that redirects into it.

This failure class has already been observed once in production: the reverse-proxied React/TanStack presentation can return HTTP 200 and receive CSS while module loading or hydration fails on a real browser. HTTP-only smoke is therefore not sufficient evidence that My MMD is usable.

## Immediate production rule

Until a fresh real-device mounted-runtime smoke proves the React/TanStack build can boot reliably under `/my-mmd/*`, production presentation uses the Lovable-authored self-contained `public/my-mmd-shell.html` artifact.

This is an incident rollback of the presentation transport only. It does not change authority.

```text
/my-mmd/*
  -> member-dashboard-chat-worker
  -> credential-stripped fetch of Lovable /my-mmd-shell.html
  -> visible static pre-JS state
  -> same-origin /api/member/app/* for live member data
```

Legacy compatibility remains:

```text
/member/my-mmd* -> 308 -> /my-mmd/*
```

## Authority remains locked

- Lovable owns presentation and interaction.
- MMD Workers own identity, LINE/LIFF session, membership, points, history, coupons, CARE BACK, entitlement and every authoritative calculation.
- Airtable remains canonical operational storage where applicable.
- No member cookie or Authorization header is forwarded to Lovable.
- The browser does not infer membership, entitlement, access, coupon percentage or `approved_discount_percent`.
- Missing/unverified backend data remains fail-closed.

## Runtime safety

Production must never return a blank porcelain page as the only user-visible result.

The incident shell must:

- contain `data-mmd-shell="lovable-single-file-v1"`;
- contain a visible static pre-JS boot state;
- use no React/TanStack hydration or external application JS chunks;
- rewrite its old `/member/my-mmd` presentation base to canonical `/my-mmd` at the Worker boundary;
- return a bounded visible recovery page when the expected Lovable artifact is unavailable or invalid;
- preserve same-origin `/api/member/app/*` behavior.

Expected incident headers:

```text
x-mmd-route-owner: member-dashboard-chat-worker
x-mmd-ui-source: lovable-single-file-incident-rollback
x-mmd-presentation-mode: single-file-incident-rollback-20260905
x-mmd-presentation-owner: lovable
x-mmd-behavior-owner: mmd-workers
```

## Exit gate

Do not restore the reverse-proxied React/TanStack runtime to production based only on CI, SSR HTTP 200, desktop preview, or synthetic route smoke.

Required evidence before ending this override:

1. `/my-mmd/` visibly renders on a real phone/browser after production deploy.
2. `/my-mmd/points`, `/coupons`, `/history`, `/profile`, `/membership` visibly render when opened directly.
3. LINE Mini App verification returns to `/my-mmd/` and the page visibly renders after the verified same-site session is established.
4. No blank-screen state occurs when module/javascript execution fails; a visible bounded recovery state must remain.
5. A real authenticated member run confirms Profile/Dashboard/Points values match `/api/member/app/*` canonical backend responses.

React/TanStack remains the canonical Lovable source for future presentation work. The single-file artifact is the active production incident transport only until these real-device gates pass.
