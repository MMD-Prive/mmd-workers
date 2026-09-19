# MMD MODEL · Year 6 Direct Wish Delivery

Status: implementation contract  
Surface: `/sigil/model/wish`  
Campaign: `mmd_year_6_model_direct_wish`

## Canonical flow

```text
Model opens /sigil/model/wish
-> identity verification starts immediately
-> signed Model session is resolved / renewed through LINE LIFF
-> Model writes Wish
-> optional profile media upload
-> Model submits
-> wish_status = manual_review
-> UI shows yellow "รอยืนยัน"
-> Model Dashboard remains fully usable
-> Per/Admin Approve
-> only approved, consented delivery scopes activate
```

The direct campaign is independent of an active Job and independent of the post-job `mmd_year_6_model_wish` sidecar. Never create a fake Session and never use Wish as a payout gate.

## Entry authentication

Opening `/sigil/model/wish` starts authentication immediately.

1. Browser first checks the existing Model profile/session.
2. If the signed Model session is missing or expired, LIFF initializes immediately.
3. If LINE Login is required, use the full current `location.href` as `redirectUri`.
4. Exchange LINE identity through `POST /v1/model/liff/exchange`.
5. Re-check the Model profile before treating the form as authenticated.

Do not defer the primary auth flow until the Model presses Submit.

If auto-auth cannot finish, present a calm retry control. Do not describe the Model as blocked, rejected, or unable to access Model Dashboard.

## Direct Wish transport

Authenticated Model session authority remains `mmd_model_session_v1`.

Endpoint:
- `GET /v1/model/session/current?mode=year6_direct_wish` — read current direct-Wish status.
- `POST /v1/model/session/current?mode=year6_direct_wish` — submit direct Wish.

GET is read-only and never creates a Wish.

## Review state projection

Internal canonical state remains unchanged:

- `manual_review`
- `completed`
- `revoked`

Model-facing projection:

| Canonical state | Model label | Tone |
| --- | --- | --- |
| `manual_review` | `รอยืนยัน` | yellow |
| `completed` | `ยืนยันแล้ว` | green |
| `revoked` | `ยังไม่เผยแพร่` | neutral |
| no row | `ยังไม่ได้ส่ง` | neutral |

`manual_review` means the submission was received and is waiting for Per/Admin review. It is not an authentication, account, access, job, or payout problem.

## Model Dashboard

Canonical live dashboard route:
`/sigil/model/dashboard`

The dashboard presentation worker may read the GET status endpoint using the existing authenticated browser session.

While state is `manual_review`, show a compact yellow Model Wish notice:
- `MODEL WISH`
- `รอยืนยัน`
- `MMD ได้รับคำอวยพรแล้ว · พี่เปอร์กำลังตรวจให้ครับ`
- clarify that this does not affect Dashboard access or receiving work.

This notice is presentation only. It does not mutate Wish state or Model entitlement.

## Content and consent

Visible primary prompt:
- `01 · อวยพร 6 ปี MMD`
- `อวยพร MMD ครบ 6 ปี`

At least one of the three message areas may be used:
- birthday Wish;
- note to MMD;
- Per-only private note.

Two delivery consent scopes remain independent and optional:
1. Telegram promotion.
2. Past Clients in authenticated MY MMD.

Nothing is delivered to either scope before approval.

`private_note_per` remains Per-only and must never be returned to customer/member APIs or downstream public delivery.

## Storage

Canonical table:
`MMD — Birthday Wishes` (`tblvMJjYXy29mgDLb`)

Locks:
- `campaign_id = mmd_year_6_model_direct_wish`
- `wish_option = model_direct_wish`
- new submission -> `wish_status = manual_review`
- idempotency = one direct Year 6 Wish per canonical Model

## Gallery media

Media are optional and remain owned by the authenticated MMD MODEL Gallery flow.

On the same screen the Model may add up to 5 files:
- photos JPG/PNG/WEBP/HEIC/HEIF, max 10 MB each;
- clips MP4/MOV/WEBM, max 50 MB each.

Photos save as `public_gallery`; clips save as `intro_video`.
Media IDs are not direct-Wish delivery authority.

## Hard locks

- Wish never becomes a Model Session state.
- Wish never gates payout.
- Wish never blocks Model Dashboard.
- Browser cannot approve its own Wish.
- Manual review remains fail-closed for delivery, not for dashboard access.
- Do not expose internal Model IDs, Airtable IDs, R2 keys, LINE IDs, customer identity, or Per-only notes.
