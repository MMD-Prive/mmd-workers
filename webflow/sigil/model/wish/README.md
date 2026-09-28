# Model Wish · Mini App return bridge + calm review state

Route: `/sigil/model/wish`

This surface is the direct Year 6 Model Wish flow. It stays independent of an active Job and never gates payout.

## Endpoint audit

The published Model LIFF/Mini App ID is `2010864854-N34SgCqq`.

The registered LINE entry is the permanent Mini App URL and its configured MMD MODEL endpoint is the dashboard lane. `/sigil/model/wish` is a destination after Model session creation; it is not a safe page from which to call `liff.login({ redirectUri: location.href })`.

Calling LINE Login directly from the Wish URL caused LINE to reject the callback with HTTP 400 `invalid url`, including after the host was normalized from `www.mmdbkk.com` to `mmdbkk.com`.

## UX flow

```text
open /sigil/model/wish
  -> check existing signed Model session immediately
  -> if the signed session is already valid, show the Wish form
  -> if missing/expired, preserve the existing Wish draft temporarily
  -> hand off to https://miniapp.line.me/2010864854-N34SgCqq/
       ?flow=verify
       &return_to=wish
       &source=model_wish
  -> LINE opens the registered MMD MODEL dashboard endpoint
  -> exchange LINE identity for mmd_model_session_v1
  -> read the signed Model profile back before treating the session as ready
  -> return once to /sigil/model/wish?line_return=1
  -> restore the Wish draft and remove the temporary bridge copy
  -> Model writes at least one message
  -> optional Gallery media upload
  -> POST direct Wish
  -> backend stores wish_status=manual_review
  -> show yellow "รอยืนยัน"
  -> return to /sigil/model/dashboard
```

Authentication remains immediate, but the Wish page no longer invents or submits an arbitrary OAuth redirect URI.

If automatic LINE verification cannot complete, the form remains recoverable and shows one calm `ยืนยัน LINE` retry action. It must not present the Model as blocked, suspended, or unable to use the Dashboard.

## Return bridge contract

`model-wish-line-return-bridge-v1.js` must load before the existing Wish runtime.

The bridge:

- runs only on `/sigil/model/wish`;
- replaces only the invalid Wish-side LINE login step;
- enters LINE through the permanent registered Mini App URL;
- uses the bounded intent `return_to=wish` rather than an arbitrary URL;
- preserves the existing `mmd_model_wish_draft_v5` draft only during handoff;
- stores no LINE token, Model identity, session cookie, activation token, or authority claim;
- removes the temporary bridge draft after one restore;
- expires an unrestored bridge draft after 30 minutes;
- preserves developing/review/published LIFF environment separation.

The MMD Model Hub app consumes `return_to=wish` only after the session coordinator reaches `ready`, meaning the Worker session cookie was established and the signed Model profile was read back successfully. Normal Dashboard entries are unchanged.

## Review status

The same authenticated endpoint supports a read-only status projection:

- `GET /v1/model/session/current?mode=year6_direct_wish`
- `manual_review` -> `รอยืนยัน` / yellow
- `completed` -> `ยืนยันแล้ว` / green
- `revoked` -> `ยังไม่เผยแพร่` / neutral
- no record -> `ยังไม่ได้ส่ง`

`manual_review` is a normal review state, not an account/access error.

The live Model Dashboard is presentation-owned by `model-dashboard-presentation-worker`. It injects a small same-origin status add-on that shows the yellow `รอยืนยัน` card only while the canonical direct Wish remains `manual_review`. Dashboard access and work actions remain unchanged.

## Canonical authority

- Model identity: signed `mmd_model_session_v1`.
- Direct Wish transport:
  - GET/POST `/v1/model/session/current?mode=year6_direct_wish`
- Review truth: `MMD — Birthday Wishes` campaign `mmd_year_6_model_direct_wish`.
- New submission state: `manual_review`.
- Per/Admin review remains the only approval authority.
- Telegram / Past Clients delivery remains disabled until approval.
- Wish status never becomes a Model Session lifecycle state and never gates payout.

## Gallery update

Profile media remain optional and independent from Wish delivery authority.

- up to 5 files total;
- photos: JPG/PNG/WEBP/HEIC/HEIF, max 10 MB each;
- clips: MP4/MOV/WEBM, max 50 MB each;
- photos -> `public_gallery`;
- clips -> `intro_video`.

## Webflow placement

Site: `68f879d546d2f4e2ab186e90`  
Page: `6987dae2b3f7f937340de1a6`  
Main Embed: `f1a5d5a6-d067-931e-a152-bdbb3567615a`

- `model-wish.html`: page Embed.
- `model-wish.css`: page Head inside the scoped style block.
- `model-wish-line-return-bridge-v1.js`: page Embed loaded before the Wish runtime.
- `model-wish.js`: page Footer runtime.
- `FULL-CODE.md`: synchronized paste-ready snapshot.

## Verification

Required checks before production closure:

- `node --check webflow/sigil/model/wish/model-wish-line-return-bridge-v1.js`
- `node --test webflow/sigil/model/wish/model-wish-line-return-bridge-v1.test.mjs`
- `node --check webflow/sigil/model/wish/model-wish.js`
- `node --test webflow/sigil/model/wish/model-wish.test.mjs`
- `node --test admin-worker/model-direct-wish.test.mjs`
- `node --test model-dashboard-presentation-worker/index.test.mjs`
- Lovable app tests, typecheck and production build.
- production smoke proving the Wish page hands off to `miniapp.line.me` without submitting `/sigil/model/wish` as an OAuth redirect URI.
- final real Model LINE E2E proving: verify -> session ready -> return to Wish -> draft restored -> submit -> `รอยืนยัน`.
