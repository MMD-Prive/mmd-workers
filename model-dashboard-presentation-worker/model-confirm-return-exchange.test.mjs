import assert from "node:assert/strict";
import { test } from "node:test";

import { modelLiffDigitalBootstrapHtml } from "./src/model-liff-digital-shell.js";

test("signed model-confirm return is a selected-job flow and creates session before returning", () => {
  const html = modelLiffDigitalBootstrapHtml({
    liffId: "2010864854-N34SgCqq",
    fallback: "https://miniapp.line.me/2010864854-N34SgCqq/",
    sdk: "https://static.line-scdn.net/liff/edge/2/sdk.js",
    returnTo: "/sigil/confirm/job-model?t=model-token",
    environment: "published",
  });
  assert.match(html, /\/v1\/model\/liff\/exchange/);
  assert.match(html, /model_session_exchange_failed/);
  assert.match(html, /ลูกค้าเลือกคุณสำหรับงานนี้/);
  assert.match(html, /ไม่ใช่หน้าสมัครงาน/);
  assert.match(html, /กำลังเปิดรายละเอียดงาน/);
  assert.match(html, /เปิดรายละเอียดงานนี้/);
  assert.doesNotMatch(html, /สมัครงานนี้กับ MMD/);
  assert.doesNotMatch(html, /ยืนยันตัวตนสำหรับงาน/);
  assert.match(html, /window\.location\.replace\("\/sigil\/confirm\/job-model\?t=model-token"\)/);
});
