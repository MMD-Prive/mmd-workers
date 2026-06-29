# Airtable Field Template for R2 Model Catalog

Use this as the staging/template model for Airtable -> R2 publishing.

## Main rules
- `model_key` is immutable and is the join key across Airtable, R2, and workers.
- Frontend reads R2 first.
- Worker fallback remains `/v1/admin/models/list`.
- Do not publish private fields such as phone, LINE, Telegram ID, admin notes, or real address.

## Suggested tables
- `TEMPLATE — R2 Model Catalog`
- `TEMPLATE — R2 Model Addons`
- `TEMPLATE — R2 Model Availability`

## Suggested field groups
### Main catalog
- model_key
- slug
- display_name
- nickname
- status
- booking_visibility
- tiers
- job_types
- city
- zones
- languages
- tags
- search_tokens
- hero_image_url
- card_image_url
- thumb_image_url
- base_rate_thb
- rate_label
- duration_options
- sort_priority
- bio_short
- bio_long
- gallery_image_urls
- availability_bookable
- availability_days
- availability_time_blocks
- updated_at
- publish_to_r2
- publish_note

### Addons
- model_key
- addon_code
- addon_label
- addon_price_thb
- is_active
- sort_order

### Availability
- model_key
- bookable
- days
- time_blocks
- availability_updated_at
