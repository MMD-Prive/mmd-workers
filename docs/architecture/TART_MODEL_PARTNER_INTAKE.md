# TarT · Model Partner intake

Owner direction, 9 November 2026. This brief replaces the Pero-specific work as the next product priority.

## User flow

An existing MMD model chooses **หาโมเดลเพิ่ม** in TarT. Every choice opens the same Partner application page with **สมัครเป็น Model Partner** selected. Use the existing modeling entry `/partner/apply?partner_type=modeling` as the proposed destination.

1. **สมัครเป็น Model Partner** — reuse the existing application and identity checks. Reuse an existing application or verified Partner identity where the current intake supports it.
2. **ต้องการหาโมเดลสำหรับงานแบบไหน** — **Public** or **Private**.
3. **ตอนนี้อยู่ช่วงไหน** — **หาล่วงหน้า** or **อยู่ในงานแล้ว**.
4. **ตรวจแล้วส่งคำขอ** — show both choices, let the model go back to edit, and display success only after the existing intake confirms receipt.

| Work type | Timing | Review context |
| --- | --- | --- |
| Public | หาล่วงหน้า | Planned public work |
| Public | อยู่ในงานแล้ว | Additional model needed for an ongoing public job |
| Private | หาล่วงหน้า | Planned private work, with the existing access rules |
| Private | อยู่ในงานแล้ว | Additional model needed for an ongoing private job, with the existing access rules |

TarT guides the model to the application. Partner review retains its existing ownership. Public and Private are work types. The timing choice describes the request, independently of the work type.

## Implementation and acceptance

- Trace the live TarT entry and verify the active Webflow application and Worker intake before changing them. Repository references: `webflow/partner/referral/README.md`, `webflow/partner/shared/partner-copy-cta-canon-v2.md`, `partners-worker/README.md`.
- Reuse the modeling lane. The existing `client_referral` lane refers to introducing clients. Keep personal model introductions through the existing recommend-model flow.
- Validate and persist both choices using the existing intake contract or a scoped extension with explicit allowed values. Confirm a reload or retry retains the request and avoids duplicates.
- Apply existing server-side identity and approval rules. A Private preference is a request for review. Job context for “อยู่ในงานแล้ว”, if attached, must belong to the authenticated model and be checked on the server.
- Test all four combinations through the same entry, missing or invalid inputs, duplicate submission, existing Partner identity, and rejection of unrelated job context. Verify the layout at narrow mobile widths.
- This PR is a proposed flow specification. Implementation and authenticated staging acceptance are separate follow-up work.
