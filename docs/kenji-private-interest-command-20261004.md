# Scoped Private signup interest command

Owner authorization `Sentinel_453ce1c6b2f88191b04d545b8115af11`, 2026-10-04T08:40:53Z: a nonmember who sends `สนใจ` in LINE should receive Private packages and the new-member promotion. This extends the existing command exception, not general conversation. Both command mode and the separate `KENJI_LINE_PRIVATE_INTEREST_ENABLED` flag are required.

Only a signed original direct-user text event can enter the lane. The grammar accepts `สนใจ` and bounded polite endings, normalizing only U+200B/U+FEFF as in #2220. It rejects unrelated substrings, third-party requests, groups and nontext events. The existing original sender UID/reply token, fresh-event validation, global stop, owner takeover, pre-delivery recheck and Durable Object retry dedupe remain in force. No LLM calls, checkout creation or domain mutations are added.

## Sources and audience

The command reads only the sender UID's existing canonical entitlement rows plus the active `packages` catalog through an internal read-only intent. It does not invoke auth identity-link recovery, coupon claim/repair, archive reconstruction or payment creation. Live read on 2026-10-04 confirmed unique active Standard (`rec123ffFOBnMniQN`) price 1,199/duration 365 and Premium (`rec24YWbRX7BdSLQ0`) price 2,999/duration 730. Runtime re-reads price; duplicates, inactive packages, unsupported tier/duration, failed reads or malformed amounts stay unavailable. Neither Public prices nor renewal prices are used.

Base durations follow `docs/knowledge/MEMBERSHIP_CARE_BACK_FINAL_POLICY_20260910.md` and current catalog: Standard one year, Premium two calendar years. New-signup Premium total two years also matches the current `currentPrivateMembershipPromotion` signup branch; the old September extra year is not stacked. Welcome 66 follows the latest Oct 4 owner-confirmed decision forwarded by the parent. It is conditional information, not already-posted or redeemable points. This does not apply expired-member rejoin/renewal duration rules to a new applicant.

Any recognized current/former membership, Public tier, protected tier or blocked account is routed to `เช็กสิทธิ์` without a new-member offer. Missing rows do not prove nonmembership: owner Per Rename + matched UID may be authoritative while canonical sync is incomplete. The current entitlement-only projection has no complete negative-membership attestation. Therefore unknown identities receive clearly **general package information** and a verification CTA, never a personal eligible/nonmember declaration. The owner evidence fallback in `docs/kenji-owner-membership-context-20261004.md` now recognizes a UID-linked qualified Per Rename import while canonical rows await sync. It does not establish new-member eligibility.

## Exact current general-information copy

> ข้อมูลแพ็กเกจ Private สำหรับการสมัครใหม่ครับ
> Standard 1,199 บาท · อายุพื้นฐาน 1 ปี
> Premium 2,999 บาท · อายุรวม 2 ปี
> โปรสำหรับผู้สมัครใหม่ที่ผ่านการตรวจบัญชีและชำระตามเงื่อนไข: Welcome Points 66 แต้มครับ สิทธิ์และแต้มจะยึดรายการที่ตรวจยืนยันแล้ว
> ข้อมูลนี้เป็นข้อมูลทั่วไป ยังไม่ได้ยืนยันว่าบัญชีนี้เข้าเงื่อนไขสมาชิกใหม่ครับ หากเคยเป็นสมาชิก ให้พิมพ์ “เช็กสิทธิ์” เพื่อตรวจบัญชีเดิมก่อน
> เริ่มยืนยันบัญชี LINE เดิม: https://mmdbkk.com/member/liff?world=private&intent=signup
> ให้เปอร์ยืนยันแพ็กเกจ ยอด และสิทธิ์ก่อนโอนครับ

Known-member copy: `บัญชีนี้มีข้อมูลหรือประวัติสมาชิกครับ พิมพ์ “เช็กสิทธิ์” เพื่อดูสถานะ วันหมดอายุ สิทธิ์และเงื่อนไขต่ออายุของบัญชีเดิมครับ`.

Unavailable catalog copy replaces package prices/terms/promotion with `ราคาและระยะสิทธิ์แพ็กเกจ Private ยังรอตรวจครับ`; it retains the neutral verification instructions. The URL is an identity entrance, not a payable or member-bound checkout. No bank details, payment token, price binding or entitlement are minted by the reply.

## Coupon review correction

Also fixes the requested #2219 review finding: a CARE BACK wallet cannot advertise `ready` unless it has a valid existing six-character coupon code and definite future backend expiry. Invalid/missing code becomes unavailable with no approved percentage. The raw code remains omitted from the LINE projection. No customer coupon is modified.

Validation covers dynamic Private catalog reads, malformed/duplicate/inactive catalog, unknown-versus-member audiences, protected and former membership, exact/hidden-separator command scope, signed sender-only ingress with general replies stopped, concurrent duplicate delivery and the coupon-code regression. Release needs separate merge approval, both Worker deployments and coordinated fresh owner delivery acceptance. Config on this branch is prepared, not evidence of live enablement.
