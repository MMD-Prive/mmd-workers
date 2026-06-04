# LINE Per AI reply copy hotfix

This branch is for issue #45.

Runtime target file:

```txt
immigrate-worker/netlify/functions/webhook.js
```

Patch only the `talk_to_per_ai` branch inside `buildFaqReply(...)`.

Replace the old poem block:

```js
  if (intent === "talk_to_per_ai") {
    return `มายเนมอีส Per AI (หา)ใช่บอสเปอร์
บอสไม่อยู่ หน้าจอ บอสไปไหน
แต่ผมอยู่ คอยช่วยตอบ เรื่องคาใจ
ว่าแต่อยาก สไตล์ไหน เล่าให้ฟังที

นอกจากนี้ ผมยังช่วย ตอบคำถาม
สถานะ แพ็กเกจ หรือว่าพี่
จะต่ออายุ ผมก็จะ ยิ่งยินดี
ขอพี่ๆ เปิดใจ ให้ข้อมูล (กับเปอร์น้าาา)`;
  }
```

with Per's final customer-facing copy:

```js
  if (intent === "talk_to_per_ai") {
    return `สวัสดีครับ ผมคือ Per AI ของ MMD Privé ครับ
ผมช่วยรับเรื่อง เช็กข้อมูลเบื้องต้นจากระบบ และส่งให้ Per ดูได้ถ้าเป็นเคสที่ต้องดูเป็นพิเศษครับ

ตอนนี้พี่อยากให้ผมช่วยเรื่องไหนก่อนครับ
1) สมัครสมาชิก / ต่ออายุ
2) เช็กแพ็กเกจหรือสถานะสมาชิก
3) สอบถามบริการหรือนายแบบ
4) ส่งรูปหรือโปรไฟล์คนที่อยากให้ MMD พิจารณา
5) ให้ Per ดูเป็นเคสส่วนตัว

พิมพ์เล่าได้เลยครับ เดี๋ยวผมช่วยจัดเรื่องให้เป็นขั้นตอนครับ`;
  }
```

Acceptance:

- `คุยกับ Per AI` returns the final Per AI reply copy exactly once.
- `คุยกับ Per` returns the final Per AI reply copy exactly once.
- `คุยกับเปอร์` returns the final Per AI reply copy exactly once.
- No payment, membership, package, booking, model availability, VIP/SVIP/Black Card, or approval logic is changed.
- Customer-facing copy does not mention admin/team.
