# MMD Privé LINE Rich Menu — 3 LV Action Map

Status: canonical production map for the MMD Privé LINE OA. Revalidated against the current route canon and live customer surfaces on 2026-09-30. Rich Menu runtime v4.9 corrects stale CTA destinations while preserving the LIFF-first identity bridge.

This map applies only to MMD Privé. MMS / Male Massage is a separate LINE OA and is not part of this runtime.


## LIFF-first CTA rule — v4.7

All Rich Menu URI CTAs that lead into MMD customer journeys now enter through the canonical MMD LIFF/Mini App identity bridge first, then return to a strict allowlisted destination after verified LINE session establishment.

Pattern:

`Rich Menu → Mini App / LIFF status bridge → POST /member/api/liff/start → bounded return_to → destination`

This applies to PUBLIC MODELS, BOOKING, PUBLIC SERVICES, MMD STORIES, PRIVÉ ACCESS and the Privé Model/Booking journeys. START HERE uses the signup Mini App directly. MY MMD and PRIVÉ UPDATE stay inside the Worker-rendered MY MMD Digital Home. Message/Postback actions remain message/postback actions.

The LIFF bridge does not grant membership, entitlement, payment, model visibility or booking authority. The destination still performs its own backend authorization and must fail closed.

## LV1 — Guest

| Position | Label | Action |
| --- | --- | --- |
| Top-left | START HERE | `Mini App signup: intent=signup&view=signup` |
| Top-center | PUBLIC MODELS | `LIFF status → /profiles?source=line&entry_route=rich_menu_guest_models` |
| Top-right | BOOKING | `LIFF status → /booking?source=line&entry_route=rich_menu_guest_booking` |
| Bottom-left | PUBLIC SERVICES | `LIFF status → /services/companion?source=line&entry_route=rich_menu_guest_services` |
| Bottom-center | MMD STORIES · Discover TMIB | `LIFF status → /tmib/stories?source=line&entry_route=rich_menu_guest_stories` |
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
| Bottom-center | PRIVÉ ACCESS | `LIFF status → /sigil/member/membership?intent=signup&source=line&entry_route=rich_menu_prive_access` |
| Bottom-right | SUPPORT | Silent LINE postback → MMD support guidance; no Kenji name is shown to the customer |

## LV3 — Privé Member

Active Privé entitlement. Standard, Premium, VIP, SVIP and Black Card share the same Rich Menu image; backend entitlement remains authoritative.

| Position | Label | Action |
| --- | --- | --- |
| Top-left | KENJI AI | LINE message: `Hi Kenji` |
| Top-center | MODEL CARDS | `LIFF status → /sigil/booking?mode=search&scope=private&source=line&entry_route=rich_menu_model_cards` |
| Top-right | BOOKING | `LIFF status → /sigil/booking?mode=booking&scope=private&source=line&entry_route=rich_menu_private_booking` |
| Bottom-left | MY MMD | LINE Mini App / LIFF `intent=status&view=home` |
| Bottom-center | PRIVÉ UPDATE | LINE Mini App / LIFF `intent=status&view=home` → MMD NEWS / member updates |
| Bottom-right | SUPPORT | LINE message: `Hi Kenji` |

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
- `MODEL CARDS` enters the current SIGIL Search surface in Private scope; the backend entitlement resolver remains authoritative and protected Models remain fail-closed.
- Kenji is a concierge/router and continuity layer, not the final authority for protected decisions.

## 2026-09-30 CTA correction

The v4.9 route audit supersedes the stale v4.8 destinations below:

- `MMD STORIES`: `/tmib` → `/tmib/stories`
- Public `PRIVÉ ACCESS`: Public signup Mini App → `/sigil/member/membership?intent=signup`
- Privé `MODEL CARDS`: informational `/member/private#detail-model` → `/sigil/booking?mode=search&scope=private`
- Privé `BOOKING`: public `/find` → `/sigil/booking?mode=booking&scope=private`
- Privé `PRIVÉ UPDATE`: informational `/member/private#access` → MY MMD Digital Home / MMD NEWS
- `MY MMD`: uses explicit `view=home`; `view=profile` was only a normalized alias.

Source alignment:
- customer CTA canon: `docs/knowledge/KENJI_WEBSITE_CTA_MAP_V1_20260929.md`
- SIGIL Search/Booking contract: `docs/architecture/SIGIL_CUSTOMER_SEARCH_V1.md`
- MY MMD Digital Home: `docs/architecture/MY_MMD_LIFF_DIGITAL_HOME_V1_20260928.md`

The quiet-window rule remains authoritative: hide daily 16:00–22:59 Asia/Bangkok; restore at 23:00.
