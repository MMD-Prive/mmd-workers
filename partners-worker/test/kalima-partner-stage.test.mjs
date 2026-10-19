import test from 'node:test';
import assert from 'node:assert/strict';
import { renderKalimaPartnerStage } from '../src/kalima-partner-stage.mjs';
import { MMS_SPA_PAYMENT_POLICY } from '../../shared/mms-spa-payment-policy.mjs';

test('Kalima Stage uses shared MMS package and direct-shop extras policy', () => {
  const html = renderKalimaPartnerStage();
  assert.ok(html.includes(MMS_SPA_PAYMENT_POLICY.version));
  for (const copy of ['ลูกค้า MMS ชำระแพ็กเกจกับ MMS ครั้งเดียว', 'Kalima ได้รับค่าห้อง/คอร์ส', 'ไม่เรียกเก็บรายการที่รวมในแพ็กเกจจากลูกค้าซ้ำ', 'ให้ Kalima กับลูกค้าตกลงราคาและชำระกันโดยตรง', 'ไม่คิดส่วนแบ่ง MMS']) assert.ok(html.includes(copy));
});

test('Kalima preview is isolated from all existing shop records and cannot call or mutate production', () => {
  const html = renderKalimaPartnerStage();
  assert.ok(html.includes('ยังไม่เชื่อมบัญชี Partner หรือรายการเงินจริงของ Kalima'));
  assert.doesNotMatch(html, /relax-spa|Relax Spa|fetch\(|XMLHttpRequest|\/v1\/|<form\b|localStorage|sessionStorage/);
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new Function(match[1]);
});

test('Kalima LV5 is branded only as MMS Male Massage Partner', () => {
  const html = renderKalimaPartnerStage();
  assert.match(html, /data-mms-partner-design="lv5"/);
  assert.match(html, /\/stage-assets\/mms-logo\.png/);
  assert.match(html, /MALE MASSAGE<br>PARTNER/);
  assert.doesNotMatch(html, /SĪGIL|SIGIL/);
  for (const copy of ['ภาพรวม', 'เงื่อนไข', 'คอร์สและราคา', 'บริการเสริม']) assert.ok(html.includes(copy));
});
