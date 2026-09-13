import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_APPLICATIONS_THREAD_ID, mmsApplicationThreadId } from "../src/application-telegram-routing.mjs";

test("MMS Therapist applications share the canonical Applications inbox", () => {
  assert.equal(DEFAULT_APPLICATIONS_THREAD_ID, 155);
  assert.equal(mmsApplicationThreadId({}), 155);
  assert.equal(mmsApplicationThreadId({ MMS_TELEGRAM_APPLICATIONS_THREAD_ID: "155" }), 155);
});

test("dedicated Applications topic override is honored without changing the default", () => {
  assert.equal(mmsApplicationThreadId({ MMS_TELEGRAM_APPLICATIONS_THREAD_ID: "455" }), 455);
  assert.equal(mmsApplicationThreadId({ TELEGRAM_APPLICATIONS_THREAD_ID: "456" }), 456);
  assert.equal(mmsApplicationThreadId({ TELEGRAM_PUBLIC_MODEL_THREAD_ID: "457" }), 457);
  assert.equal(mmsApplicationThreadId({ TG_THREAD_PUBLIC_MODEL: "458" }), 458);
  assert.equal(mmsApplicationThreadId({ MMS_TELEGRAM_APPLICATIONS_THREAD_ID: "not-a-topic" }), 155);
});
