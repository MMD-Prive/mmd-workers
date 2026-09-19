# Model Wish · Auto-auth + calm review state

Route: `/sigil/model/wish`

This surface is the direct Year 6 Model Wish flow. It stays independent of an active Job and never gates payout.

## UX flow

```text
open /sigil/model/wish
  -> check existing signed Model session immediately
  -> if missing/expired, start LINE LIFF authentication immediately
  -> exchange LINE identity for mmd_model_session_v1
  -> show the Wish form
  -> Model writes at least one message
  -> optional Gallery media upload
  -> POST direct Wish
  -> backend stores wish_status=manual_review
  -> show yellow "รอยืนยัน"
  -> return to /sigil/model/dashboard
```

Authentication is no longer deferred until submit or media selection. The full current URL is preserved as the LINE return URL.

If automatic LINE verification cannot complete, the form remains recoverable and shows one calm `ยืนยัน LINE` retry action. It must not present the Model as blocked, suspended, or unable to use the Dashboard.

## Review status

The same authenticated endpoint now supports a read-only status projection:

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
Embed: `f1a5d5a6-d067-931e-a152-bdbb3567615a`

- `model-wish.html`: page Embed.
- `model-wish.css`: page Head inside the scoped style block.
- `model-wish.js`: page Footer runtime.
- `FULL-CODE.md`: synchronized paste-ready snapshot.

## Verification

Required checks before production:
- `node --check webflow/sigil/model/wish/model-wish.js`
- `node --test webflow/sigil/model/wish/model-wish.test.mjs`
- `node --test admin-worker/model-direct-wish.test.mjs`
- `node --test model-dashboard-presentation-worker/index.test.mjs`
- production smoke with a real Model LINE session before describing the flow as live.
