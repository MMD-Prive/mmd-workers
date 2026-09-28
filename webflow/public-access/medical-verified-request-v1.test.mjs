import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./medical-verified-request-v1.html", import.meta.url), "utf8");

test("medical request UI only activates for the verified request-only handoff", () => {
  assert.match(source, /role'\) !== 'medical_professional'/);
  assert.match(source, /brief'\) !== 'verified_request_only'/);
  assert.match(source, /\/api\/member\/medical-request/);
  assert.match(source, /credentials:'same-origin'/);
});

test("medical request UI does not collect free-form health details or offer payment", () => {
  assert.doesNotMatch(source, /textarea/i);
  assert.doesNotMatch(source, /\/pay\/checkout|payment_intent|payment_stage/i);
  assert.match(source, /ไม่ใช่เหตุฉุกเฉิน/);
  assert.match(source, /ไม่ได้ขอคำวินิจฉัยหรือการรักษา/);
});
