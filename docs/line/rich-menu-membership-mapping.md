# LINE Rich Menu Membership Mapping

Status: backend-owned Rich Menu publisher is available for Public World. No Webflow publish and no merge.

`member-dashboard-chat-worker` owns the Public World Rich Menu publisher through internal API endpoints. Do not use browser/frontend JavaScript for Rich Menu API calls, and do not print LINE tokens or returned Rich Menu IDs in public chat/logs.

## Safety Rules

- LINE Rich Menu is navigation only; it is not membership truth.
- LIFF identity alone must not activate membership, payment, points, package, access, entitlements, or dashboard.
- Dashboard remains locked until a first real job/session exists.
- Rich Menu actions must open member-facing routes only.
- Rich Menu setup must not write Airtable directly.
- Do not map any Rich Menu button directly to `/member/dashboard`.

## Public Rich Menu Button URLs

Use `https://mmdbkk.com` as the production origin unless LINE OA Manager requires a LIFF URL wrapper.

Public wakeup button requirement:

- The Public World draft created by API sets area 1 as Message action text `Hi Per`.
- Do not configure `Hi Per` as a URI action, clipboard action, dashboard URL, or secret-bearing link.
- The draft also includes a postback fallback with data `mmd_action=hi_per&source=public_rich_menu` and display text `Hi Per`.
- This wakeup only triggers Kenji's safe public acknowledgement; it must not activate membership, points, payment, VIP, Black Card, or dashboard access.

Internal publisher endpoints:

- `POST /v1/internal/line/rich-menu/public-world/draft`
- `POST /v1/internal/line/rich-menu/public-world/validate`
- `POST /v1/internal/line/rich-menu/public-world/create`
- `POST /v1/internal/line/rich-menu/public-world/upload-image`
- `POST /v1/internal/line/rich-menu/public-world/set-default`
- `POST /v1/internal/line/rich-menu/public-world/publish`
- `GET /v1/internal/line/rich-menu/default`
- `GET /v1/internal/line/rich-menu/list`

All publisher endpoints require `Authorization: Bearer INTERNAL_TOKEN`. Rich Menu image upload accepts only PNG/JPEG.

Operator publishing should go through `admin-worker`, which calls `member-dashboard-chat-worker` by Cloudflare Service Binding. Operators authenticate to `admin-worker` with `ADMIN_BEARER` or `CONFIRM_KEY`; they should not pass `INTERNAL_TOKEN` manually.

Admin publisher endpoints:

- `POST /v1/admin/line/rich-menu/public-world/draft`
- `POST /v1/admin/line/rich-menu/public-world/validate`
- `POST /v1/admin/line/rich-menu/public-world/publish`
- `GET /v1/admin/line/rich-menu/default`
- `GET /v1/admin/line/rich-menu/list`

The service-bound aliases under `/__internal/line/rich-menu/*` are only for `admin-worker` service binding calls with `x-mmd-service-binding: admin-worker` and `x-mmd-internal-call: true`; public `/v1/internal/...` routes still require Bearer auth.

| Button | URL | Status |
| --- | --- | --- |
| สมัครสมาชิก | `https://mmdbkk.com/member/membership?source=line&entry_route=public_membership` | Worker-backed page, LIFF identity remains public membership intent. |
| ตรวจสอบสถานะสมาชิก | `https://mmdbkk.com/member/membership?source=line&entry_route=member_status` | State-lookup-backed LIFF intent; does not collapse into generic public membership after identify. |
| ต่ออายุสมาชิก | `https://mmdbkk.com/member/membership?source=line&entry_route=renewal` | LINE LIFF renewal mode; identity/evidence only until payment is officially verified. |
| ขอจอง/เลือกโมเดล | `https://mmdbkk.com/member/membership?source=line&entry_route=booking_request` | State-lookup-backed LIFF intent; active/current routes to `/sigil/booking`, expired routes renewal, no paid package stays public. |

## Private Rich Menu Button URLs

Private Rich Menu eligibility is a response state, not a dashboard unlock. The worker may return `rich_menu_target: private_member` when trusted membership state is active/current, but `/member/dashboard` remains locked until first real job/session exists.

| Button | URL | Status |
| --- | --- | --- |
| ตรวจสอบสถานะสมาชิก | `https://mmdbkk.com/member/membership?source=line&entry_route=member_status` | State-lookup-backed. Active/current returns private member eligibility. |
| ต่ออายุสมาชิก | `https://mmdbkk.com/member/membership?source=line&entry_route=renewal` | Opens renewal mode inside LINE. Private menu is still navigation only and never sets membership truth. |
| ขอจอง/เลือกโมเดล | `https://mmdbkk.com/member/membership?source=line&entry_route=booking_request` | State-lookup-backed. Active/current routes `/sigil/booking`. |
| Member dashboard | Not allowed as a Rich Menu action | Blocked until first real job/session unlock. |

## LIFF Identity Contract

After a LIFF page opens and obtains the LINE profile, the page/backend bridge must call:

```text
POST /member/api/liff/identify
```

Required payload:

```json
{
  "line_user_id": "U...",
  "line_display_name": "optional display name",
  "line_picture_url": "optional profile image",
  "entry_route": "public_membership | member_status | renewal | booking_request | pay_membership | sigil_membership | dashboard"
}
```

Only these query values may be preserved into safe next routes:

- `t`
- `code`
- `promo`
- `source`
- `entry_route`
- `liff_state`

Do not preserve `payment_ref`, `session_id`, admin flags, raw LINE ids, raw Telegram ids, Airtable ids, internal notes, risk flags, proposed points, legacy points, SVIP, Black Card internals, or raw session internals in returned customer routes.

## Dashboard Lock

Locked cases:

- Rich Menu click alone.
- LIFF identity alone.
- Linked identity alone.
- Existing/known identity alone.
- Membership signup alone.
- Payment proof alone.
- Pending verification alone.
- Dashboard entry request without first real job/session evidence.

When locked:

- `next_route` must remain a pre-dashboard route, normally `/member/membership`.
- `safe_next.dashboard` must be `null`.
- `dashboard_unlock.reason` should be `waiting_for_first_real_job_or_session`.

Allowed unlock case:

- A trusted backend/member status resolver returns `has_first_job: true`.
- The resolver returns an allowed real-session status such as `confirmed`, `en_route`, `arrived`, `met`, `work_started`, or `completed`.
- Public LIFF request body fields such as `session_id`, `first_real_session_exists`, or `session_status` must not unlock the dashboard.

When unlocked:

- `next_route` may become `/member/dashboard`.
- `safe_next.dashboard` may become `/member/dashboard`.
- Only `t`, `code`, and `promo` may be preserved.

## Airtable Target Mapping

Rich Menu and LIFF identity should stage or read context only. Promotion into truth tables remains a backend/admin decision.

| Airtable target | Purpose | Safe fields / keys | Rule |
| --- | --- | --- | --- |
| `MMD - LIFF Renewal Sessions` | LIFF renewal/status attempt log | `line_user_id`, `line_display_name`, `entry_route`, `source`, `liff_session_id`, `created_at`, `status`, `safe_next_route`, `dashboard_unlock_reason` | Staging/log only; does not activate access. |
| `Clients` | Canonical client identity lookup | `line_user_id`, `line_display_name`, `username`, `mmd_client_name`, `nickname`, `Membership Status`, `Expire At`, `Points Balance` | Read/match only from LIFF identity unless an admin promotion path explicitly writes. |
| `LINE OFC Client Import Staging` | Legacy LINE OFC rename/tag evidence | `line_user_id`, `line_display_name`, `line_renamed_name`, `normalized_name`, `parsed_client_level`, `parsed_membership_package`, `proposed_points` | Staging only; no entitlement write from import/review page. |
| `MMD - Member Entitlements` | Verified access truth | `line_user_id`, `client`, `member_status`, `access_status`, `package_code`, `expire_at` | Backend/admin verified write only; never from Rich Menu or LIFF identity alone. |
| `member_packages` | Package purchase/renewal state | `member_email`, `memberstack_id`, `package_code`, `status`, `start_date`, `end_date`, `payment_ref`, `source` | Payment/verification flow only; Rich Menu can send `source=line` as attribution. |
| `Sessions / Jobs` | Real service/job evidence and dashboard unlock source | `session_id`, `job_id`, `memberstack_id`, `line_user_id`, `package_code`, `membership_action`, `payment_ref`, `status` | Dashboard unlock source only after real confirmed session/job exists. |

## Response Contract

`POST /member/api/liff/identify` returns customer-safe status fields:

```json
{
  "intent": "member_status",
  "membership_state": "active",
  "package_state": "current",
  "rich_menu_target": "private_member",
  "next_route": "/member/profile?status=active",
  "safe_next": {
    "renewal": "/sigil/pay/renewal",
    "booking": "/sigil/booking",
    "dashboard": null
  }
}
```

Allowed states:

- `membership_state`: `active`, `expired`, `no_paid_package`, `unknown`, `review_required`
- `package_state`: `current`, `expired`, `none`, `unknown`
- `rich_menu_target`: `public_member`, `private_member`, `renewal`, `blackcard`

Routing:

- `member_status` active/current: `rich_menu_target: private_member`, next route `/member/profile?status=active`, dashboard remains locked unless first job/session unlock exists.
- `member_status` expired: `rich_menu_target: renewal`; renewal navigation remains evidence/review only.
- `renewal` expired: `rich_menu_target: renewal`; renewal navigation remains evidence/review only.
- `booking_request` active/current: next route `/sigil/booking`.
- `booking_request` expired: `rich_menu_target: renewal`; booking remains unavailable until trusted current membership.
- `no_paid_package`: next route `/member/membership`; no new pricing invented here.
- `unknown` or `review_required`: next route `/member/profile?status=review_required`; never active.

## Repo-Owned Confirmation

- `mmd-redirect-worker` routes `POST /member/api/liff/identify` to `member-pages-worker`.
- `mmd-redirect-worker` routes `/sigil/pay/renewal` to `member-pages-worker` before generic `/sigil/*` pass-through.
- `member-pages-worker` rejects non-POST identify calls.
- `member-pages-worker` preserves only `t`, `code`, and `promo` in LIFF safe next routes.
- `member-pages-worker` returns `safe_next.dashboard: null` until first real job/session evidence exists.
- `member-pages-worker` renders a minimal safe `/sigil/pay/renewal` page where renewal proof remains evidence only.
- Focused tests cover the LIFF identify route and the pre-dashboard holding behavior.

## Blockers Before Publishing In LINE OA Manager

- Confirm the LIFF frontend wrapper actually calls `POST /member/api/liff/identify` after opening the mapped route.
- Confirm the `MMD - LIFF Renewal Sessions` table/field names if that staging table is not already created.
- Confirm the production `MEMBER_STATUS_RESOLVER` binding or Airtable-backed resolver before treating real users as active/current.
- `/sigil/booking` is referenced by the member dashboard as a booking destination, but this PR does not redesign or own the booking route. Treat it as outside PR #107 route ownership unless the booking owner confirms.
- Publish only from LINE OA Manager after owner approval.
