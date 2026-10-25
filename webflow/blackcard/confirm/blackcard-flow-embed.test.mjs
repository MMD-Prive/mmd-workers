import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const source = readFileSync(new URL("./blackcard-flow-embed.html", import.meta.url), "utf8");

test("Black Card embed refuses new sale and keeps the signed confirmation handoff for an existing request", () => {
  assert.ok(source.includes("v1/confirm/companion-preference"));
  assert.ok(source.includes("expected_role:'customer'"));
  assert.ok(source.includes("ยังไม่เปิดรับสมัครใหม่"));
  assert.ok(!source.includes("/sigil/pay/blackcard"));
  assert.ok(source.includes("p.get('step')==='companion'"));
  assert.ok(source.includes("ไม่สร้างสิทธิ์สมาชิก"));
});

test("Companion choice never falls back to LINE or browser storage", () => {
  assert.ok(!source.includes("line.me/R/oaMessage"));
  assert.ok(!source.includes("localStorage"));
  assert.ok(source.includes("บันทึกแล้ว"));
  assert.ok(source.includes("API ตอบสำเร็จ"));
});

test("all canonical Personal Main cards and safe HIRO asset are present", () => {
  for (const id of ["hito", "hiei", "hima", "hiro"]) assert.ok(source.includes(`value="${id}"`));
  assert.ok(source.includes("HIRO%20-%20SIGIL%20-%20GUIDE"));
  assert.ok(source.includes("ไม่ใช่ Travel Model"));
});

test("Companion state is read from payments-worker and success follows its response", () => {
  assert.ok(source.includes("api({read:true})"));
  assert.ok(source.includes("api({companion_id:id})"));
  assert.ok(source.includes("บันทึก Preference ในบัญชีสมาชิกแล้ว"));
  assert.ok(source.includes("ไม่เปลี่ยนสถานะชำระเงินหรือสิทธิ์สมาชิก"));
});
