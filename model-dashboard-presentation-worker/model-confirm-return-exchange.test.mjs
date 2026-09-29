import assert from "node:assert/strict";
import { test } from "node:test";

import { modelLiffDigitalBootstrapHtml } from "./src/model-liff-digital-shell.js";

test("model confirm return_to creates model session before returning", () => {
  const html = modelLiffDigitalBootstrapHtml({
    liffId: "2010864854-N34SgCqq",
    fallback: "https://miniapp.line.me/2010864854-N34SgCqq/",
    sdk: "https://static.line-scdn.net/liff/edge/2/sdk.js",
    returnTo: "/sigil/confirm/job-model?t=model-token",
    environment: "published",
  });
  assert.match(html, /\/v1\/model\/liff\/exchange/);
  assert.match(html, /model_session_exchange_failed/);
  assert.match(html, /กำลังเชื่อมตัวตนงาน/);
  assert.match(html, /window\.location\.replace\("\/sigil\/confirm\/job-model\?t=model-token"\)/);
});
