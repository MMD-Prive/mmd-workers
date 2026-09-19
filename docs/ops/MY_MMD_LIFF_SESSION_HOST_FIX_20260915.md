# My MMD LIFF session host preservation — 2026-09-15

## Customer symptom

A real customer could complete LINE verification but My MMD still behaved as unverified.

## Root cause

`__Host-mmd_liff_session` is intentionally host-only. Customer-facing CARE BACK and LIFF entry links can establish the signed session on `mmdbkk.com`, while the My MMD compatibility gate redirected apex My MMD traffic to `www.mmdbkk.com`. That host transition drops the host-only session cookie even though LINE verification itself succeeded.

The previous production smoke only verified that `/member/api/liff/start` reached LINE token verification by using an intentionally invalid token. It did not prove a real browser/LINE session survived the return into My MMD.

## Fix

If an apex My MMD request already carries `__Host-mmd_liff_session`, preserve the current host and allow the same-origin My MMD/API stack to validate that session normally. Unauthenticated apex visits continue to canonicalize to `www.mmdbkk.com`.

This does not make the browser authoritative and does not widen access: the presence of the cookie only suppresses the host redirect; downstream Worker APIs still validate the signed session before returning member data or applying any entitlement/coupon behavior.

## Required proof

- CI regression: apex My MMD with LIFF session is not redirected.
- CI regression: unauthenticated apex My MMD still redirects to www.
- Production deploy + route smoke.
- Final gate remains one real LINE member E2E verification after deploy.
