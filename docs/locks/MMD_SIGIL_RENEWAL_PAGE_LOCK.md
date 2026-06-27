# MMD / SĪGIL Renewal Page Lock

Status: Production Locked  
Page: Renewal Payment Review  
Canonical marker: `mmd-renewal-single`  
Canonical owner: `member-dashboard-chat-worker`  
Canonical renderer: `single-renewal-renderer`

## Purpose

หน้านี้ใช้สำหรับให้สมาชิกต่ออายุสมาชิก ชำระเงิน และส่งหลักฐานการชำระเงินเข้าสู่กระบวนการตรวจสอบของ MMD / SĪGIL

หลักฐานการชำระเงินที่ส่งผ่านหน้านี้เป็นข้อมูลประกอบการตรวจรายการเท่านั้น สถานะสมาชิกจะถูกอัปเดตหลังจาก MMD ตรวจยอดจริงเรียบร้อยแล้ว

## Canonical Route Ownership

Renewal routes ทั้งหมดต้องถูกเสิร์ฟจาก `member-dashboard-chat-worker` เท่านั้น

Routes ที่ต้องอยู่ภายใต้ renderer เดียวกัน:

```text
https://mmdbkk.com/pay/renewal*
https://www.mmdbkk.com/pay/renewal*
https://sigil.mmdbkk.com/pay/renewal*
https://mmdbkk.com/sigil/pay/renewal*
https://www.mmdbkk.com/sigil/pay/renewal*
https://sigil.mmdbkk.com/sigil/pay/renewal*
```

Expected production headers:

```text
x-mmd-worker: member-dashboard-chat-worker
x-mmd-page: sigil-pay-renewal
x-mmd-route-source: member-dashboard-chat-worker:single-renewal-renderer
x-mmd-upstream-source: local-renderer
```

## Runtime Rules

หน้านี้ห้ามใช้ Webflow เป็น runtime source

ห้าม proxy ไป Webflow  
ห้าม fallback ไป Webflow  
ห้ามให้ `admin-worker` เป็นเจ้าของ route renewal  
ห้ามให้ `immigrate-worker` asset เก่ากลับมาเกี่ยวข้อง  
ห้ามมี renderer มากกว่าหนึ่งชุดสำหรับ renewal route family

ถ้าจะปรับ UI, copy, CSS, JS หรือ logic ของหน้านี้ ให้แก้เฉพาะ renderer เดียวใน `member-dashboard-chat-worker` ที่มี marker:

```text
mmd-renewal-single
```

## Forbidden Legacy Markers

ห้ามมีข้อความหรือ class ต่อไปนี้ใน runtime HTML, worker bundle, หรือ renderer ของ renewal page:

```text
Renew with Kenji
Proof enters official review only
mmd-renewal-kenji-public
Ready to Start
data-bank-display
fetchSigilPayRenewalFromWebflow
RENEWAL_WEBFLOW_SOURCE_ORIGIN
RENEWAL_WEBFLOW_SOURCE_PATH
```

ถ้าพบ marker เหล่านี้ ให้ถือว่าเป็น legacy code และต้องหยุด deploy จนกว่าจะลบออกจาก runtime path

## Customer-Facing Copy Principle

หน้านี้ต้องใช้ภาษาที่เข้าใจง่าย สุภาพ และสร้างความมั่นใจ

ใช้แนวทางนี้:

```text
ส่งหลักฐานไว้ให้ MMD ตรวจรายการได้เลยครับ
สถานะสมาชิกจะอัปเดตหลังยอดจริงถูกตรวจสอบเรียบร้อยแล้ว
```

หลีกเลี่ยงภาษาที่แข็งเกินไป เช่น:

```text
สลิปไม่ใช่การยืนยัน
Proof only
Default bank
Before payment
```

## Payment Review Principle

Renewal payment proof ต้องเข้าสู่ review flow เท่านั้น

ห้ามให้ URL parameter เพียงอย่างเดียว เช่น `?status=paid` หรือ `?status=confirmed` ทำให้หน้าแสดงผลเหมือนชำระสำเร็จจริงโดยไม่มี backend verification

สถานะที่ปลอดภัยควรมีลำดับประมาณนี้:

```text
Prepare payment
Upload proof
MMD review
Verified
Member status updated
```

## Pre-Deploy Checklist

ก่อน deploy ทุกครั้ง ต้องผ่าน:

```text
node --check tmp/cloudflare-member-dashboard-chat-worker/index.js
node --test tmp/cloudflare-member-dashboard-chat-worker/renewal-route.test.mjs
forbidden-marker scan
```

## Post-Deploy Smoke Checklist

หลัง deploy ต้อง GET smoke ทั้ง 6 routes:

```text
https://mmdbkk.com/pay/renewal
https://www.mmdbkk.com/pay/renewal
https://sigil.mmdbkk.com/pay/renewal
https://mmdbkk.com/sigil/pay/renewal
https://www.mmdbkk.com/sigil/pay/renewal
https://sigil.mmdbkk.com/sigil/pay/renewal
```

ต้องยืนยันว่า response เป็น `200` และ headers ตรงตามนี้:

```text
x-mmd-worker: member-dashboard-chat-worker
x-mmd-page: sigil-pay-renewal
x-mmd-route-source: member-dashboard-chat-worker:single-renewal-renderer
x-mmd-upstream-source: local-renderer
```

ต้องยืนยันว่า body มี:

```text
mmd-renewal-single
MMD / SIGIL
Renewal Payment Review
```

และต้องไม่มี forbidden legacy markers

## Current Production Deploy Reference

Latest verified deploy:

```text
member-dashboard-chat-worker
version: 4a4a477c-16e2-4b45-875e-57b0a3465ad2
```

สถานะหลัง deploy: verified  
Webflow runtime: disabled  
Admin-worker route ownership: removed  
Renewal renderer source: local-renderer only  
Legacy marker scan: passed
