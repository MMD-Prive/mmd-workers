# Kenji LINE First Contact V2 — OA greeting follow-up

## Owner and scope

LINE OA Manager sends the add-friend greeting. The signed MMD webhook handles only an active, non-redelivered customer text DM after that greeting. The reply still speaks as Per; it never introduces Kenji. The old autonomous Knowledge Board lane stays disabled by `LINE_AUTO_REPLY_ENABLED=false`; `LINE_FIRST_CONTACT_ENABLED=true` gates this deterministic lane.

## Conversation

| Customer text | Reply / action |
| --- | --- |
| “แนะนำหน่อย” | Ask what work or activity the customer has in mind. |
| Explicit “ผู้หญิง”, “เพศชาย”, “ไม่ระบุ”, or “ผู้หญิง ชอบลุคสุภาพ” | Acknowledge and ask about the work or activity. Gender is recorded only when stated by the customer; “ชอบผู้ชาย” is stored separately as a preferred model gender and does not become the customer's gender. “ข้าม” clears a previous opening gender. |
| Short style such as “ชอบลุคสุภาพ” | Ask about the work or activity; keep only an allowlisted style label. |
| Work/activity after the opening | Ask for the date and offer the public profile link. |
| Date, then area/time | Ask for the next detail, then mark the brief for owner review before availability and price are discussed. |
| MMS, membership, or public service request | Use the existing safe route. |
| Payment, slip, points, membership status, Black Card, personal data, booking availability, and other protected matters | No automatic factual confirmation; preserve owner review and existing guards. |

The conversation matrix stores `first_contact_v2` with `awaiting`, optional `self_reported_gender`, `preferred_style`, and `preferred_model_gender`, and `updated_at`. This is a seven-day chat context, not a canonical Clients field or proof of identity. It is written only after LINE confirms reply delivery and only when Matrix storage is available. If storage is unavailable, explicit greeting answers still receive a safe stateless reply; later context-dependent steps fail closed.

This lane does not verify a customer's sex, model availability, final price, membership, payments, or Black Card access. It does not create an appointment. The ordinary handoff flag applies to the completed service brief. OA greeting copy remains in OA Manager and must be kept consistent with public routes and current promotions.

## Verification

Run `node --test member-dashboard-chat-worker/test/kenji-line-first-contact.test.mjs`. Exercise an active signed LINE webhook with “แนะนำหน่อย”, “ผู้หญิง”, “ชอบลุคสุภาพ”, a short service brief, then a date and area/time. Verify follow, standby, redelivery, slips, and protected intents remain silent. Confirm the Matrix state appears only after a successful reply and is not promoted to the Clients table.
