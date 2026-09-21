# Webflow /hall · Public Navigation V6

Updated: 2026-09-19  
Webflow page id: `6935a20ab95a4e04e34b76a1`  
Canonical visible root: `#mmd-hall-v6`

## Public-first route map

- Find Your MMD -> `/find?source=hall`
- Browse Public Profiles -> `/profiles?source=hall`
- Male Massage -> `/male-massage/home?source=hall`
- Public Membership -> `/pay/membership?source=hall`
- My MMD -> `/my-mmd/?source=hall`

Public Membership means Member / Elite / Red Card.

A secondary escape link is available for an existing Standard / Premium customer:
- Private Membership -> `/sigil/member/membership?source=hall`

## Find vs Profiles

- `/find`: assisted discovery — customer tells MMD what they want and MMD helps route/match.
- `/profiles`: browse-first public-safe profiles.

Do not collapse these into one CTA.

## Runtime

The page footer query-carry runtime targets `mmd-hall-v6` only.

Safe public campaign context carried to internal links:
- `code`
- `promo`
- `campaign`

Do not carry `t`, `session_id`, payment_ref or other payment/session authority across unrelated Hall navigation.

## Legacy

The old `#mmd-hall-v5` HtmlEmbed is hidden and retained only as fallback/source history. It must not become the visible primary Hall.

## Authority

Hall is presentation/navigation only. It never grants membership, confirms booking, resolves availability, decides payment status or exposes private model visibility.
