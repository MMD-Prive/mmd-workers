# MY PARTNER · LV Max

วันที่ 14 พฤศจิกายน 2569 · Asia/Bangkok

## ขอบเขตที่นำไปใช้

หน้า `/partner/dashboard` ของ partners-worker: Our Mission ก่อน ตามด้วย MY CO MODELS. ใช้พื้นครีม น้ำตาล และแบบอักษร Anuphan ที่มีอยู่. ไม่มีภาพตัวละครใหม่.

- งานใกล้ถึงเรียงวันนัด สองงานแรกเปิดให้เห็น งานต่อไปและประวัติเปิดเพิ่มได้.
- แก้ต้นเหตุ `renderCalendar()` วาดทับผลจัดลำดับ `renderJobs()`; ใช้ตัวจัดกลุ่มเดียวกัน. งานที่ข้อมูลวันนัดไม่ครบอยู่ในกลุ่มแยก.
- กดการ์ดงานเปิดรายละเอียดและการกระทำเดิมตามสิทธิ์; ไม่สร้าง ETA หรือสถานะรับทราบเอง.
- รายชื่อนายแบบค้นหาและจัด Top ด้วยปุ่มวางบนสุด/ขึ้น/ลง ใช้ R2 เก็บลำดับรายบัญชี. ไม่ใช่อันดับในหน้าลูกค้า.
- การเรียงมี revision และ conditional write ป้องกันเขียนทับจากอีกอุปกรณ์. ID ต้องอยู่ในสังกัดที่ยัง active ตาม backend.
- ปุ่มแก้ข้อมูลเปิดแท็บโปรไฟล์ เรท/การมองเห็น รูป หรือรายละเอียดเพิ่มเติม. รักษาค่าที่กรอกเมื่อคำขอล้มเหลว.
- ภาพที่อนุมัติอัปเดตทั้งรายการหน้าแรกและแท็บ Models. ไม่ใช้ภาพตัวอย่างเป็นข้อมูลนายแบบจริง.
- ตัวกรอง คิวส่วนตัว ภาพรวม Telegram และคำอธิบายความเป็นส่วนตัวใช้แถบเปิดเพิ่ม. เมนูอื่นรวมใต้ “เพิ่มเติม”.
- โหลดล่าสุดล้มเหลวแสดงข้อมูลเก่าและระงับทางลัดทำรายการบนการ์ดจนโหลดใหม่สำเร็จ.

## ตาราง action และ contract

| Action | ผู้กระทำ / สถานะก่อน | API / method | เงื่อนไข / ผลยืนยัน | Conflict / failure | หลักฐาน |
|---|---|---|---|---|---|
| โหลดงานและนายแบบ | Partner มี token ที่ยังมีสิทธิ์ | GET `/v1/partner/dashboard` | backend ส่ง `ok:true`; ไม่ข้าม LINE | 401 ปิดข้อมูลและกลับทางเข้าเดิม; โหลดล้มเหลวระบุข้อมูลเก่า | `index.ts`, `partner-ui.test.mjs` |
| จัด Top | Partner; นายแบบในสังกัด active | GET/POST `/v1/partner/roster-order` (เพิ่มในรอบนี้) | ตรวจ token, active referral, ID ไม่ซ้ำ; `ok:true`, `model_ids`, `revision` | R2 compare-and-swap; 409 โหลดใหม่; ไม่เปลี่ยนลำดับเป็นสำเร็จก่อนผลตอบกลับ | `partner-roster-order.test.mjs`, UI integration test |
| ขอแก้โปรไฟล์ | Partner ตามสิทธิ์เดิม | POST `/v1/partner/models/change` | `update_profile`, explicit share, backend ยืนยันรับคำขอ | ป้องกันกดซ้ำ; คงค่าที่กรอกเมื่อไม่สำเร็จ | `partner-control-room.ts`, existing backend tests |
| อัปโหลดรูป | Partner ตามสิทธิ์เดิม | POST `/v1/partner/models/upload` | ตรวจสิทธิ์และประเภทไฟล์ที่ backend; รับไฟล์แล้วไม่เท่ากับอนุมัติ | ป้องกันกดซ้ำ; แสดงข้อผิดพลาดใน dialog | existing upload contract |
| ขอเปลี่ยนเรท/visibility | Partner ตามสิทธิ์เดิม | POST `/v1/partner/sales/proposal` | ส่งคำขอ review พร้อม explicit share; **ไม่เปลี่ยน sellability ทันที** | ป้องกันกดซ้ำ; ค่าที่อนุมัติเดิมยังมีผล | `handlePartnerSalesProposal`, existing tests |
| ตอบข้อเสนองาน | Partner เมื่อ backend อนุญาต | POST `/v1/partner/jobs/action` | เฉพาะข้อตกลงเดิมและ `confirmation_allowed`; ไม่รับทราบแทนนายแบบ | backend ตรวจสถานะล่าสุด | existing job tests |
| ประสานงาน/ดูประวัติ | ตาม flow Console เดิม | contract เดิมใน `partner-operations.ts` | ข้อมูลและสิทธิ์เดิม; ไม่มีการส่งในการทดสอบรอบนี้ | ผลสำเร็จตาม backend | existing operations tests |

## รายการที่ยังไม่พร้อมใช้จริง

| รายการ | สถานะ |
|---|---|
| สวิตช์ตัด visibility ทันทีโดยไม่รอตรวจ | ตัวอย่างเพื่อออกแบบ — ยังไม่พร้อมใช้จริง; ปัจจุบันใช้คำขอเปลี่ยนตาม contract เดิม |
| ไฟ Straight / Gay และเรท PN / VIP | ตัวอย่างเพื่อออกแบบ — ยังไม่พร้อมใช้จริง; payload ของ MY PARTNER ที่ตรวจครั้งนี้ไม่ได้ให้ค่าที่ผูกกับปุ่มเหล่านี้. ไม่เปลี่ยนชื่อเรทถึงตัว/เรทขายให้เป็น PN/VIP |
| ETA, นับถอยหลังเดินทาง, แจ้งผิดที่, รับทราบก่อนวันงาน | ยังไม่ยืนยัน contract ใน MY PARTNER; ไม่สร้างสถานะหรือการแจ้งเตือนจากเวลาหรือหน้าจอ |
| รวม LINE / Telegram, ยอดรูปและสาย | ใช้ข้อมูลจำลองเท่านั้นตามบรีฟ Jay/Uri/Kendo; ไม่เปิดอ่าน/ส่งข้อความจริงในงานนี้ |

## การตรวจ

- TypeScript และชุดทดสอบ Partner ทั้งหมด; เพิ่มเคส order persistence, stale revision, foreign/revoked model, revoked account, removed models, upcoming/history และ UI reorder ที่เรียก backend fixture จริง.
- ตรวจ browser ของ snapshot จาก page renderer เดียวกับ production ด้วยข้อมูลจำลอง. ตรวจ desktop และกรอบมือถือ 320/390/430 px; ตรวจค้นหา เปิดรายละเอียด เปลี่ยนลำดับ และแท็บแก้ไข.
- พรีวิวระบุข้อมูลจำลองตลอดหน้า; ปิด transport การทำรายการจริง. เฉพาะการจัดลำดับในพรีวิวเก็บในอุปกรณ์ และ Private Vault จำลองเก็บใน session.
- ไม่มีการเปลี่ยน production record, ส่งรูป, ส่งแจ้งเตือน หรือทดสอบธุรกรรมจริง.
- การเผยแพร่และผล deployment ให้ยึดผล GitHub Actions / Sites แยกจากผลทดสอบ local. เอกสารนี้ไม่ใช่หลักฐานว่า deploy สำเร็จ.

## Rollback

ย้อน commit ชุด LV Max และ deploy partners-worker ด้วย workflow เดิม. ค่า order ใน R2 อยู่ใน prefix แยก ไม่เปลี่ยน policy หรือข้อมูลนายแบบ; โค้ดเดิมจะไม่อ่านค่าเหล่านี้. ไม่ต้องลบข้อมูลเพื่อ rollback.
