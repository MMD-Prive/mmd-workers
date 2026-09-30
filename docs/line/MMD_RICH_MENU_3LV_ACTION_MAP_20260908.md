# MMD Privé LINE Rich Menu — 3 LV Action Map

Status: canonical production map for the MMD Privé LINE OA. Rechecked against the owner-approved button meanings and the current 2026-09-29/30 customer architecture. Runtime v4.11 fixes CTA destinations that had drifted from the meaning printed on the Rich Menu.

This map applies only to MMD Privé. MMS / Male Massage is a separate LINE OA and is not part of this runtime.


## LIFF-first CTA rule — v4.11

All Rich Menu URI CTAs that lead into MMD customer journeys now enter through the canonical MMD LIFF/Mini App identity bridge first, then return to a strict allowlisted destination after verified LINE session establishment.

Pattern:

`Rich Menu → Mini App / LIFF status bridge → POST /member/api/liff/start → bounded return_to → destination`

This applies to PUBLIC MODELS, BOOKING, PUBLIC SERVICES, MMD STORIES, Public `PRIVÉ ACCESS`, and the Privé MODEL CARDS / BOOKING journeys. START HERE uses the signup Mini App directly. MY MMD and PRIVÉ UPDATE stay inside the Worker-rendered MY MMD Digital Home. Message/Postback actions remain message/postback actions.

The LIFF bridge does not grant membership, entitlement, payment, model visibility or booking authority. The destination still performs its own backend authorization and must fail closed.

## LV1 — Guest

| Position | Label | Action |
| --- | --- | --- |
| Top-left | START HERE | `Mini App signup: intent=signup&view=signup` |
| Top-center | PUBLIC MODELS | `LIFF status → /profiles?source=line&entry_route=rich_menu_guest_models` |
| Top-right | BOOKING | `LIFF status → /booking?source=line&entry_route=rich_menu_guest_booking` |
| Bottom-left | PUBLIC SERVICES | `LIFF status → /services/companion?source=line&entry_route=rich_menu_guest_services` |
| Bottom-center | MMD STORIES · Discover TMIB | `LIFF status → /tmib?source=line&entry_route=rich_menu_guest_stories` |
| Bottom-right | SUPPORT | Silent LINE postback → MMD support guidance; no Kenji name is shown to the customer |

### LV1 image asset

- Master: Webflow asset `6ab37382436bc54d0879d558`, 2500×1686 PNG.
- LINE runtime: Webflow asset `6ab373e94a52accb54062a99`, 1080×728 PNG, 347,487 bytes.
- Visible bottom-center copy: `MMD STORIES` / `Discover TMIB`.
- LV2 and LV3 image assets remain unchanged.

## LV2 — Public Member

Verified identity; no active Privé entitlement required.

| Position | Label | Action |
| --- | --- | --- |
| Top-left | คุยกับ PER | LINE message: `Hi Per` |
| Top-center | PUBLIC MODELS | `LIFF status → /profiles?source=line&entry_route=rich_menu_public_models` |
| Top-right | BOOKING | `LIFF status → /booking?source=line&entry_route=rich_menu_public_booking` |
| Bottom-left | MY MMD | LINE Mini App / LIFF `intent=status&view=home` |
| Bottom-center | PRIVÉ ACCESS | `LIFF status → /sigil/start?source=line&entry_route=rich_menu_prive_access` — Explore More / Private entry, not a membership-sales CTA |
| Bottom-right | SUPPORT | Silent LINE postback → MMD support guidance; no Kenji name is shown to the customer |

## LV3 — Privé Member

Active Privé entitlement. Standard, Premium, VIP, SVIP and Black Card share the same Rich Menu image; backend entitlement remains authoritative.

| Position | Label | Action |
| --- | --- | --- |
| Top-left | KENJI AI | Typed LINE postback → Kenji Member Concierge |
| Top-center | MODEL CARDS | `LIFF status → /sigil/booking?mode=search&scope=private&source=line&entry_route=rich_menu_model_cards` |
| Top-right | BOOKING | `LIFF status → /sigil/booking?mode=booking&scope=private&source=line&entry_route=rich_menu_private_booking` |
| Bottom-left | MY MMD | LINE Mini App / LIFF `intent=status&view=home` |
| Bottom-center | PRIVÉ UPDATE | LINE Mini App / LIFF `intent=status&view=home` → MMD NEWS / curated member updates |
| Bottom-right | SUPPORT | Typed LINE postback → Kenji Member Concierge |

## State Rules

- Guest: LINE user is not yet verified.
- Public Member: identity is verified but no active Privé entitlement is present.
- Privé Member: active private visibility entitlement is present.
- Expired or grace Privé entitlement falls back to Public Member, not Guest.
- Rich Menu is hidden daily from 16:00 through 22:59 Asia/Bangkok and is visible from 23:00 through 15:59.

## Support ownership and identity

- MMD does not present a generic staff or operator layer to customers.
- Guest and Public Member customers see support as **MMD**, not as a named Kenji persona.
- Guest/Public `SUPPORT` uses a silent postback: tapping the button must not insert `Hi Kenji` or another synthetic customer message into the chat.
- Kenji may power Guest/Public support behind the scenes as the continuity and routing layer, but customer-facing replies stay in MMD / Per Voice and do not introduce Kenji by name.
- Public Members retain the direct `คุยกับ PER` entry. Per remains the owner/final authority for matters that require his decision.
- Privé Members already know Kenji as the Member Concierge. `KENJI AI` remains a visible Privé entry and Privé `SUPPORT` may route directly to Kenji without creating identity surprise.
- A customer explicitly asking for a human/person is a separate escalation request; the Rich Menu SUPPORT button must not manufacture that request automatically.

## Safety / ownership

- Rich Menu is navigation only; it never grants membership or private access.
- `MY MMD` uses the authenticated LINE Mini App / LIFF status flow.
- `MODEL CARDS` returns to the owner-approved Private member detail surface; the backend entitlement resolver remains authoritative and the page must not behave as a public catalogue.
- Kenji is a concierge/router and continuity layer, not the final authority for protected decisions.

## 2026-09-30 CTA current-architecture correction — v4.11

The physical labels are treated as the contract. The destination must match the customer meaning printed on the button.

Current destinations:

- `MMD STORIES · Discover TMIB`: LIFF-first → `/tmib`
- Public `PRIVÉ ACCESS · Explore More`: LIFF-first → `/sigil/start` (Private entry; not signup/payment)
- Privé `MODEL CARDS · Your Access`: LIFF-first → `/sigil/booking?mode=search&scope=private`
- Privé `BOOKING · Request Service`: LIFF-first → `/sigil/booking?mode=booking&scope=private`
- Privé `PRIVÉ UPDATE · New · Curated`: MY MMD Digital Home → MMD NEWS / curated member updates
- `MY MMD`: Mini App `intent=status&view=home`

Older v4.9/v4.10 return targets remain narrowly allowlisted only so already-issued links fail safely during rollout; v4.11 does not emit them.

The quiet-window rule remains authoritative: hide daily 16:00–22:59 Asia/Bangkok; restore at 23:00.
