# Kenji LINE First Contact V1

## Customer greeting in LINE OA Manager

LINE OA Manager owns the add-friend greeting. Set its single greeting message to:

> สวัสดีครับ ยินดีต้อนรับสู่ MMD Privé 👋
>
> วันนี้อยากให้เปอร์ช่วยเรื่องไหนครับ? บอกสิ่งที่กำลังมองหาได้เลย จะเป็นน้อง ๆ ผู้ชายสำหรับงานหรือกิจกรรม เรื่องสมาชิก หรือรายการที่เคยคุยไว้ก็ได้ครับ
>
> ถ้ายังไม่แน่ใจว่าจะเริ่มตรงไหน พิมพ์ “แนะนำหน่อย” ได้เลยครับ

Verify the actual OA greeting and its enabled state in LINE OA Manager before claiming that this copy is live. The Messaging API webhook does not own that Manager setting. Do not send another greeting on a `follow` event.

## Runtime

- `LINE_FIRST_CONTACT_ENABLED=true` opens a deterministic, text-only DM lane after a customer sends a message.
- `LINE_AUTO_REPLY_ENABLED=false` keeps the older broad Kenji Seed/knowledge/model response lanes paused.
- A fresh Runtime Controls read remains required. The existing LINE or all-Kenji kill switch stops delivery.
- Greeting, short discovery messages, public booking intake, membership navigation and initial price brief receive short Per-voice guidance. No exact model access, availability, final price, entitlement or payment truth is asserted.
- MMS has a separate LINE Official Account (`@malemassage`). MMD greeting and intake must not offer MMS. An explicit massage inquiry in MMD LINE gets only the dedicated MMS LINE link; MMD does not collect the MMS brief or continue the MMS conversation.
- Protected topics produce review metadata and remain silent in this lane. The existing inbound Console Inbox and AI Message Events keep the owner review evidence. This version does not claim a new HYPE delivery or closed-loop assignment.
- Group/room, `follow`, image, empty, standby and redelivered events receive no First Contact reply. LINE-confirmed outbound messages alone become conversation history.

## Production acceptance

1. Inspect the OA greeting and confirm exactly one add-friend message is visible.
2. Send `แนะนำหน่อย` from a test LINE user. Expect one First Contact reply; inspect the LINE reply receipt and AI Message Event.
3. Send `โอนแล้วครับ` and a model availability question. Expect no First Contact business claim; confirm inbound/review evidence remains visible.
4. Check a standby or group event remains silent and the runtime kill switch still stops delivery.
5. If LINE does not return a successful reply receipt, do not mark customer delivery successful or use the generated text as conversation history.
