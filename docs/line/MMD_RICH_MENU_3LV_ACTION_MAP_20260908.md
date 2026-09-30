# MMD Privé LINE Rich Menu — 3 LV Action Map

Status: canonical production map for the MMD Privé LINE OA. Owner-memory recheck on 2026-09-30 found that v4.9 rewired several button meanings beyond the approved Rich Menu map. Runtime v4.10 restores the owner-approved CTA semantics while preserving the LIFF-first identity bridge.

This map applies only to MMD Privé. MMS / Male Massage is a separate LINE OA and is not part of this runtime.


## LIFF-first CTA rule — retained in v4.10

All Rich Menu URI CTAs that lead into MMD customer journeys now enter through the canonical MMD LIFF/Mini App identity bridge first, then return to a strict allowlisted destination after verified LINE session establishment.

Pattern:

`Rich Menu → Mini App / LIFF status bridge → POST /member/api/liff/start → bounded return_to → destination`

This applies to PUBLIC MODELS, BOOKING, PUBLIC SERVICES, MMD STORIES and the Privé MODEL CARDS / BOOKING / PRIVÉ UPDATE journeys. START HERE and Public `PRIVÉ ACCESS` use the signup Mini App directly. MY MMD stays inside the Worker-rendered MY MMD Digital Home. Message/Postback actions remain message/postback actions.

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
| Bottom-center | PRIVÉ ACCESS | `Mini App signup: intent=signup&view=signup` — Explore More / access entry, not a direct entitlement grant |
| Bottom-right | SUPPORT | Silent LINE postback → MMD support guidance; no Kenji name is shown to the customer |

## LV3 — Privé Member

Active Privé entitlement. Standard, Premium, VIP, SVIP and Black Card share the same Rich Menu image; backend entitlement remains authoritative.

| Position | Label | Action |
| --- | --- | --- |
| Top-left | KENJI AI | Typed LINE postback → Kenji Member Concierge |
| Top-center | MODEL CARDS | `LIFF status → /member/private?source=line&entry_route=rich_menu_model_cards#detail-model` |
| Top-right | BOOKING | `LIFF status → /find?source=line&entry_route=rich_menu_private_booking` |
| Bottom-left | MY MMD | LINE Mini App / LIFF `intent=status&view=home` |
| Bottom-center | PRIVÉ UPDATE | `LIFF status → /member/private?source=line&entry_route=rich_menu_prive_update#access` |
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

## 2026-09-30 CTA owner-memory correction — v4.10

The v4.9 destination rewrite is superseded for current Rich Menu objects because it changed approved button meaning rather than only repairing transport.

Restored owner-approved destinations:

- `MMD STORIES · Discover TMIB`: LIFF-first → `/tmib`
- Public `PRIVÉ ACCESS · Explore More`: direct Signup Mini App entry
- Privé `MODEL CARDS · Your Access`: LIFF-first → `/member/private#detail-model`
- Privé `BOOKING · Request Service`: LIFF-first → `/find`
- Privé `PRIVÉ UPDATE · New · Curated`: LIFF-first → `/member/private#access`
- `MY MMD`: remains Mini App `intent=status&view=home`

The v4.9 return targets remain narrowly allowlisted only as a transition for already-issued links; they are not emitted by v4.10 Rich Menu objects.

Live Webflow recheck on 2026-09-30 confirms `/member/private` is a published page and its `#detail-model` and `#access` anchors exist.
The quiet-window rule remains authoritative: hide daily 16:00–22:59 Asia/Bangkok; restore at 23:00.
