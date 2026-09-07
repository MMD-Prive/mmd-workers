# MMD Privé LINE Rich Menu — 3 LV Action Map

Status: canonical production map for the MMD Privé LINE OA.

This map applies only to MMD Privé. MMS / Male Massage is a separate LINE OA and is not part of this runtime.

## LV1 — Guest

| Position | Label | Action |
| --- | --- | --- |
| Top-left | START HERE | `https://mmdbkk.com/public/access?source=line&entry_route=rich_menu_guest_start` |
| Top-center | PUBLIC MODELS | `https://mmdbkk.com/profiles?source=line&entry_route=rich_menu_guest_models` |
| Top-right | BOOKING | `https://mmdbkk.com/booking?source=line&entry_route=rich_menu_guest_booking` |
| Bottom-left | PUBLIC SERVICES | `https://mmdbkk.com/services/companion?source=line&entry_route=rich_menu_guest_services` |
| Bottom-center | ABOUT MMD | `https://mmdbkk.com/tmib?source=line&entry_route=rich_menu_guest_about` |
| Bottom-right | SUPPORT | LINE message: `ขอคุยกับเจ้าหน้าที่` |

## LV2 — Public Member

Verified identity; no active Privé entitlement required.

| Position | Label | Action |
| --- | --- | --- |
| Top-left | คุยกับ PER | LINE message: `Hi Per` |
| Top-center | PUBLIC MODELS | `https://mmdbkk.com/profiles?source=line&entry_route=rich_menu_public_models` |
| Top-right | BOOKING | `https://mmdbkk.com/booking?source=line&entry_route=rich_menu_public_booking` |
| Bottom-left | MY MMD | LINE Mini App / LIFF status view |
| Bottom-center | PRIVÉ ACCESS | `https://mmdbkk.com/membership?source=line&entry_route=rich_menu_prive_access` |
| Bottom-right | SUPPORT | LINE message: `ขอคุยกับเจ้าหน้าที่` |

## LV3 — Privé Member

Active Privé entitlement. Standard, Premium, VIP, SVIP and Black Card share the same Rich Menu image; backend entitlement remains authoritative.

| Position | Label | Action |
| --- | --- | --- |
| Top-left | KENJI AI | LINE message: `Hi Kenji` |
| Top-center | MODEL CARDS | `https://mmdbkk.com/member/private?source=line&entry_route=rich_menu_model_cards#detail-model` |
| Top-right | BOOKING | `https://mmdbkk.com/find?source=line&entry_route=rich_menu_private_booking` |
| Bottom-left | MY MMD | LINE Mini App / LIFF status view |
| Bottom-center | PRIVÉ UPDATE | `https://mmdbkk.com/member/private?source=line&entry_route=rich_menu_prive_update#access` |
| Bottom-right | SUPPORT | LINE message: `ขอคุยกับเจ้าหน้าที่` |

## State Rules

- Guest: LINE user is not yet verified.
- Public Member: identity is verified but no active Privé entitlement is present.
- Privé Member: active private visibility entitlement is present.
- Expired or grace Privé entitlement falls back to Public Member, not Guest.
- Rich Menu is hidden daily from 16:00 through 22:59 Asia/Bangkok and is visible from 23:00 through 15:59.

## Safety / ownership

- Rich Menu is navigation only; it never grants membership or private access.
- `MY MMD` uses the authenticated LINE Mini App / LIFF status flow.
- `MODEL CARDS` points to the current Private member surface; the backend remains the entitlement authority and the page must not behave as a public catalogue.
- Support sends an explicit human-handoff phrase so the existing LINE intent router recognizes it as a request for an operator.
