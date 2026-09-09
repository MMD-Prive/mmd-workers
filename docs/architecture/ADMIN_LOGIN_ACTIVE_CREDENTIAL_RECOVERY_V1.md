# Admin Login Active Credential Recovery V1

Status: source fix proposed
Owner: admin-worker browser login
Incident: canonical route is live, but owner login reports credential mismatch

## Root cause

Production Cloudflare routes execute `admin-worker/src/admin-login-hero-worker.js`, while the historical `admin-login-session.test.mjs` exercises a different wrapper path. The active entrypoint required `ADMIN_LOGIN_CREDENTIAL` and `ADMIN_SESSION_SECRET` unconditionally, so a deployment where the dedicated browser credential was not provisioned rejected the established owner `ADMIN_BEARER` even though older canonical login behavior still supported that owner credential.

## Recovery contract

1. Prefer `ADMIN_LOGIN_CREDENTIAL` whenever it exists.
2. If the dedicated browser credential is absent, accept only `ADMIN_BEARER` as the legacy owner recovery credential.
3. Never accept `INTERNAL_TOKEN` or `CONFIRM_KEY` from the browser login form.
4. If no browser credential exists, return a distinguishable 503 instead of pretending the submitted code was wrong.
5. A dedicated credential continues to require `ADMIN_SESSION_SECRET` for cookie signing.
6. Legacy `ADMIN_BEARER` recovery may sign with `ADMIN_SESSION_SECRET` when present, otherwise with the established bearer itself, matching the pre-dedicated recovery posture.
7. Cookies remain host-bound, Secure, HttpOnly, SameSite=Lax, and eight-hour maximum lifetime.

## Test lock

`admin-login-active-entrypoint.test.mjs` imports the actual production entrypoint and verifies:
- owner bearer recovery when dedicated credential is absent
- dedicated credential remains authoritative when configured
- service-only secrets remain rejected
- missing credential and wrong credential are distinguishable
- dedicated credential without a session secret fails closed

No credential value is logged, committed, or exposed by this change.
