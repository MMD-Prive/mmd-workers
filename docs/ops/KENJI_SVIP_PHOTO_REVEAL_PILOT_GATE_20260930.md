# Kenji SVIP Exact-Customer Photo Reveal — Pilot Mobile Gate

Status: PRE-LIVE ACCEPTANCE GATE  
Owner: Per / MMD Privé  
PR: #2154  
Feature: SVIP exact-customer approved-photo reveal  
Default production mode: `off`

## Release sequence

1. Per reviews PR #2154.
2. Squash merge only after CI is green.
3. Deploy with `KENJI_SVIP_PHOTO_REVEAL_MODE=off`.
4. Change to `dry_run`; verify HYPE owner receipt and zero customer delivery.
5. Change to `pilot`; allow only approved SHA-256 tester hashes.
6. Run every mobile/desktop acceptance case below.
7. Move to `live` only when all required evidence is PASS.
8. Any unexpected behavior => immediately return mode to `off`.

## Automated gates required before pilot

- [ ] Unknown/misspelled rollout mode normalizes to `off`.
- [ ] Existing SVIP reveal grants are blocked at `/status`, `/resume`, and `/consume` when mode is `off` or `dry_run`.
- [ ] Kill switch does not consume/burn the grant.
- [ ] `pilot` and `live` are the only modes that may serve an already-issued SVIP reveal grant.
- [ ] Durable Object one-use gate allows exactly one of two simultaneous `POST /consume` calls.
- [ ] LINE crawler GET, HEAD, anonymous prefetch, and authenticated status preflight cannot consume a grant.
- [ ] LIFF resume rotates the bearer token; the old token is invalid immediately.
- [ ] Viewer shell and media response use `Cache-Control: no-store`.
- [ ] After successful consume, reload/back/open-again cannot display the media again.
- [ ] Cross-origin `POST /consume` is rejected.
- [ ] Missing/incorrect member session cannot consume.
- [ ] LINE transport tests are mocked and cannot send real customer messages in CI.
- [ ] Mode transitions are persisted in `SvipPhotoRevealModeAudit`; hourly reconciliation observes config state even when LINE is quiet.

## Dry-run acceptance

Set `KENJI_SVIP_PHOTO_REVEAL_MODE=dry_run` for approved tester hash only.

Expected:

- [ ] HYPE resolves Canonical Client, active SVIP, Model, Keyword Profile, no-sell/caution, and approved media.
- [ ] Owner/HYPE receives dry-run receipt.
- [ ] No preview grant is created.
- [ ] No LINE reply/photo link is sent.
- [ ] No protected rate, offer, availability, booking, or payment authority appears.

## Pilot — iPhone LINE app

### Existing MY MMD session

- [ ] Tap photo link once in LINE.
- [ ] Viewer reaches ready state without LIFF verify loop.
- [ ] No MY MMD navigation step is required.
- [ ] No Telegram prompt appears.
- [ ] Customer interaction is at most: tap link → tap **เปิดดู**.
- [ ] Media displays once and disappears according to policy.
- [ ] Reload/back/open-again cannot display it again.

### No MY MMD session

- [ ] Tap photo link once.
- [ ] Viewer shell loads without server-side session redirect.
- [ ] Same-origin `/status` returns 401 and browser automatically enters the permanent LINE Mini App.
- [ ] LIFF verification succeeds.
- [ ] Customer is returned directly to the exact grant resume path.
- [ ] Optional Telegram onboarding is skipped.
- [ ] Resume rotates the bearer token.
- [ ] Customer returns to the same preview and only taps **เปิดดู**.
- [ ] No repeated verify loop occurs.

## Pilot — Android LINE app

Repeat every iPhone case:

- [ ] Existing session PASS.
- [ ] Missing session → LIFF → exact-grant resume PASS.
- [ ] No verify loop.
- [ ] No Telegram detour.
- [ ] Back/reload cannot replay media.
- [ ] Leaving and returning to LINE cannot auto-consume/replay media.

## External Safari / Chrome from LINE

Test **Open in Safari / Open in Chrome** on both platforms where available.

- [ ] External browser may have a different cookie jar.
- [ ] Initial shell must still load without requiring a server-side member session.
- [ ] On 401, mobile browser enters LINE Mini App verification automatically.
- [ ] LIFF returns to the exact grant resume.
- [ ] Fresh bearer token is issued after exact Client/session check.
- [ ] No verify loop.
- [ ] Old pre-LIFF bearer token no longer works.
- [ ] Customer never has to manually find or reopen the original chat link.

## LINE Desktop — PC / Mac

If the desktop environment cannot complete the LIFF handoff:

- [ ] It must not show a generic/error-loop experience.
- [ ] It shows: open this link from LINE on a mobile device.
- [ ] No grant is consumed.
- [ ] Returning to the same chat on mobile can still complete the flow.

## Token rotation / replay test

For a pilot link that requires LIFF:

1. Save the original URL before verification.
2. Complete LIFF verification and exact-grant resume.
3. Confirm the resumed URL uses a fresh bearer token.
4. Try the original URL again.

Required:

- [ ] Original bearer token returns not-found/invalid and cannot access status or media.
- [ ] Fresh token remains valid until one use or expiry.
- [ ] Grant ID alone is not sufficient to consume media; exact member session is still required.

## Cache / reload policy

Policy: **one successful `POST /consume` permanently consumes the grant. Reload never replays media.**

- [ ] Viewer HTML: `Cache-Control: private, no-store`.
- [ ] Media bytes: `Cache-Control: no-store`.
- [ ] Blob/object URL is revoked after conceal.
- [ ] No LocalStorage, SessionStorage, IndexedDB, or Cache API persistence.
- [ ] Reload after consume does not display cached media.
- [ ] Browser back/forward does not display media again.

## Network drop immediately after `เปิดดู`

This is a mandatory manual pilot case because the one-use gate commits before the browser can prove that the person actually saw rendered pixels.

Test on both iPhone LINE and Android LINE:

1. Open a valid pilot preview.
2. Tap **เปิดดู**.
3. Immediately disable network / force-close LINE before the image visibly renders.
4. Reopen the same link.

Required:

- [ ] Original grant remains consumed; reload/back/reopen does **not** replay the media.
- [ ] Exactly one consumption audit exists for the original grant.
- [ ] Customer-facing recovery copy does not claim the customer definitely saw the image; it says the one-time access ended and MMD can review it.
- [ ] Per can follow the network-drop recovery runbook without changing the original consumed grant.
- [ ] Recovery, when approved, creates a **new** exact-client grant for the same Model/Media set only.
- [ ] The recovery record references the original grant and reason `delivery_failure_after_consume`.
- [ ] No automatic reissue, automatic replay window, or entitlement expansion occurs.

Canonical recovery runbook:
`docs/ops/KENJI_SVIP_PHOTO_REVEAL_NETWORK_DROP_RECOVERY_20260930.md`

## Kill switch during pilot

While a valid pilot link has been sent but not opened:

1. Confirm mode is `pilot`.
2. Switch rollout mode to `off`.
3. Do **not** issue a new grant.
4. Open the already-sent link.

Required:

- [ ] `/status` returns feature disabled.
- [ ] `/resume` returns feature disabled.
- [ ] `/consume` returns feature disabled if attempted.
- [ ] Grant remains unconsumed.
- [ ] No media bytes leave R2.
- [ ] No consumption audit is falsely created.
- [ ] Mode transition `pilot → off` appears in durable mode-transition audit.
- [ ] Git/deploy history identifies the corresponding config change.

Then return to `pilot` only by an explicit reviewed config change and repeat one test link.

## Identity / security negative cases

- [ ] Different Client/session opens same URL → denied.
- [ ] Expired link → denied.
- [ ] Consumed link → denied.
- [ ] Model/client ambiguity → Per review; no link leaves the system.
- [ ] Client/model no-sell, caution, block → Per review; no reveal.
- [ ] Raw Drive/R2/private storage URL never appears in LINE, HTML, logs, or customer-visible errors.

## Audit evidence required

For one successful pilot reveal capture:

- [ ] issuance Grant record
- [ ] exact Client
- [ ] exact Model
- [ ] exact Media Asset
- [ ] LINE event ref
- [ ] issue reason / policy version
- [ ] issued_at / issued_by
- [ ] Consumption Log
- [ ] consumed_at
- [ ] one-use Durable Object result
- [ ] rollout mode transition receipt for the pilot state

## LIVE pass criteria

Do not enable `live` unless all are true:

- [ ] CI fully green on the final merged/deployed commit.
- [ ] iPhone: existing-session + no-session cases PASS.
- [ ] Android: existing-session + no-session cases PASS.
- [ ] External Safari/Chrome handoff PASS on available platforms.
- [ ] LINE PC/Mac behavior is either supported or cleanly instructs mobile use.
- [ ] Old token invalidation PASS.
- [ ] no-store/reload policy PASS.
- [ ] network-drop-after-consume recovery PASS on iPhone and Android.
- [ ] live-link kill switch PASS.
- [ ] concurrency one-use PASS.
- [ ] exact-client isolation PASS.
- [ ] audit evidence complete.
- [ ] no protected sales/rate/availability/booking/payment authority was widened.

Only then change `KENJI_SVIP_PHOTO_REVEAL_MODE` from `pilot` to `live`.
