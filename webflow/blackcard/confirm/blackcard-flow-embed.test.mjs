import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const source = readFileSync(new URL("./blackcard-flow-embed.html", import.meta.url), "utf8");

test("Black Card embed uses one route and preserves signed t", () => {
  assert.match(source, /v1\/confirm\/companion-preference/);
  assert.match(source, /expected_role:'customer'/);
  assert.match(source, /new URL\('\/sigil\/pay\/blackcard'/);
  assert.match(source, /step=companion/);
});

test("Companion choice never falls back to LINE or browser storage", () => {
  assert.doesNotMatch(source, /line\.me\/R\/oaMessage/);
  assert.doesNotMatch(source, /localStorage/);
  assert.match(source, /บันทึกแล้ว/);
  assert.match(source, /API ตอบสำเร็จ/);
});

test("all canonical Personal Main cards and safe HIRO asset are present", () => {
  for (const id of ["hito", "hiei", "hima", "hiro"]) assert.match(source, new RegExp(`value="${id}"`));
  assert.match(source, /HIRO%20-%20SIGIL%20-%20GUIDE/);
  assert.match(source, /ไม่ใช่ Travel Model/);
});
