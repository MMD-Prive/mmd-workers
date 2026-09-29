import assert from "node:assert/strict";
import { test } from "node:test";

import {
  modelMiniAppHandoffUrl,
  resolveJobBoardContextFromRequest,
  shouldServePhaseAAfterBootstrap,
} from "./src/index.js";
import { modelLiffDigitalBootstrapHtml } from "./src/model-liff-digital-shell.js";

test("job board handoff preserves owner assigned model alias", () => {
  const request = new Request("https://www.mmdbkk.com/sigil/model/dashboard?intent=job_board&source=refund_completed_pack&job_id=JOB-FILM-J-20260929&model_alias=Film%20J&model_record_id=recFilmJ&next=https%3A%2F%2Fsigil.mmdbkk.com%2Fpublic%2Fapi%2Fjobs%2FJOB-FILM-J-20260929");
  const context = resolveJobBoardContextFromRequest(request);
  assert.equal(context.model_alias, "Film J");
  assert.equal(context.model_record_id, "recFilmJ");
  const handoff = new URL(modelMiniAppHandoffUrl(request));
  assert.equal(handoff.origin, "https://miniapp.line.me");
  assert.equal(handoff.searchParams.get("model_alias"), "Film J");
  assert.equal(handoff.searchParams.get("model_record_id"), "recFilmJ");
});

test("job board after LIFF bootstrap cannot fall into apply onboarding", () => {
  const request = new Request("https://www.mmdbkk.com/sigil/model/dashboard?intent=job_board&job_id=JOB-FILM-J-20260929", {
    headers: { cookie: "mmd_liff_boot=1" },
  });
  assert.equal(shouldServePhaseAAfterBootstrap(request), false);
});

test("job board LINE shell uses owner alias copy, not apply copy", () => {
  const html = modelLiffDigitalBootstrapHtml({
    liffId: "2010864854-N34SgCqq",
    fallback: "https://miniapp.line.me/2010864854-N34SgCqq/",
    sdk: "https://static.line-scdn.net/liff/edge/2/sdk.js",
    jobBoard: {
      job_id: "JOB-FILM-J-20260929",
      next: "https://sigil.mmdbkk.com/public/api/jobs/JOB-FILM-J-20260929",
      model_alias: "Film J",
      model_record_id: "recFilmJ",
    },
  });
  assert.match(html, /ยืนยันตัวตนสำหรับงาน Film J/);
  assert.doesNotMatch(html, /สมัครเป็นโมเดล MMD/);
  assert.match(html, /model_alias/);
});
