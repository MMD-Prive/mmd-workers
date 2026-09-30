# SIGIL Customer Search / Booking V1

Owner: Boss Per / MMD Privé  
Status: implementation contract  
World: SIGIL / Telegram Standard + Premium

## Customer entry

Customer chooses one mode:

- `SIGIL SEARCH` — MMD helps find a Model. Budget is mandatory.
- `SIGIL BOOKING` — customer already has a Model in mind. Budget is optional.

Search input supports:

- Straight / Gay / Both
- PN / VIP
- date, time, duration and area
- budget
- free-text Spec
- preferred Model name
- Telegram post link
- fallback to similar Models
- Review request

## Visibility boundary

Customer model lookup uses the canonical entitlement snapshot before model projection.

V1 regular private browsing:

- Standard -> Standard folder only
- Premium -> Standard + Premium folders
- blocked / grace / unknown -> no new private reveal

GWs / EMs and other protected categories are not enumerable in customer lookup. Knowing a name or Telegram post does not grant profile, rate or media visibility. The reference may be stored for Per review without confirming that the protected Model exists.

VIP / SVIP / Black Card protected discovery remains fail-closed until an explicit per-Model customer authorization path is bound to this surface.

The browser must never derive model folders from a displayed membership label.

## Offers and pricing

Each customer-visible result is an offer, not a raw Model record.

Pricing is resolved by `resolveModelSalesOffer` using canonical entitlement and existing pricing priority. Frontend code does not calculate a sell price.

Customer output may contain:

- approved display name
- approved media
- permitted access label
- allowed duration options
- customer rate only when `price_visible=true`
- review-required state when a reliable rate cannot be exposed

Internal rule IDs, historical quote source refs, pricing reason codes, partner cost and storage identifiers are not customer output.

Default duration policy:

- Premium Model: 90 minutes
- Standard Model: 90 or 120 minutes

An explicit Model duration configuration overrides these defaults.

## Media

Google Drive and R2 are storage/authority inputs, never customer links.

Customer search uses only approved MMD Model Media projection. Drive folder IDs, Drive URLs, R2 keys, original filenames and private real names must not be projected to the browser.

The selected Model view can show approved extra photos / clips from the controlled SIGIL media endpoint.

## Reviews

Existing per-Model Google Drive `Review` folders are source material only.

V1 never streams a raw Review folder or Drive screenshot to a customer. Customer may request Review material; the request is persisted in the SIGIL draft and surfaced to HYPE / Per.

A future automatic Review viewer must use a normalized customer-safe review asset or text projection with explicit approval and PII removal. It must not infer safety from Drive ancestry alone.

## HYPE / Per authority

All Search and Booking submissions are drafts.

Flow:

`Customer -> HYPE prepare -> WAITING FOR PER -> Per approve/edit/reject -> Job Board`

HYPE may prepare candidates and context. HYPE must not automatically:

- publish a Job Board
- confirm a Model
- confirm a Rate
- reveal protected Models
- confirm payment

The intake stores `job_creation_state=waiting_for_per`.

## Privacy

Customer references may include a Telegram post URL, but the system must not use an unauthorized reference to confirm protected Model existence.

No Google Drive URL, Drive folder ID, R2 key or customer-review source file is returned by the customer search response.
