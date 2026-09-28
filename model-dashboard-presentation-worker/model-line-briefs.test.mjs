import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import worker, { modelMiniAppHandoffUrl, rewritePresentationHtml } from "./src/index.js";
import { MODEL_LINE_BRIEFS_JS, MODEL_LINE_BRIEFS_CSS } from "./src/model-line-briefs.js";
import { modelOnboardingPhaseAHtml } from "./src/model-onboarding-phase-a-page.js";

test("Model LINE briefs runtime parses and uses canonical dictionary keys without embedded Thai copy", () => {
  assert.doesNotThrow(() => new vm.Script(MODEL_LINE_BRIEFS_JS));
  assert.doesNotMatch(MODEL_LINE_BRIEFS_JS, /[\u0E00-\u0E7F]/);
  assert.match(MODEL_LINE_BRIEFS_JS, /window\.I18N_DICT/);
  assert.match(MODEL_LINE_BRIEFS_JS, /\/v1\/model\/line-briefs/);
  assert.match(MODEL_LINE_BRIEFS_JS, /idToken: token/);
  assert.match(MODEL_LINE_BRIEFS_JS, /include_hidden: hidden/);
  assert.match(MODEL_LINE_BRIEFS_JS, /brief_id/);
  assert.match(MODEL_LINE_BRIEFS_JS, /\[interest, "interested"\]/);
  assert.match(MODEL_LINE_BRIEFS_JS, /await load\(\); statusText/);
  assert.match(MODEL_LINE_BRIEFS_JS, /DEEP_BRIEF_ID/);
  assert.match(MODEL_LINE_BRIEFS_CSS, /:focus-visible/);
  assert.match(MODEL_LINE_BRIEFS_CSS, /grid-template-columns:1fr/);
});

test("dashboard injects the briefs assets and serves the read-only static UI files", async () => {
  const html = rewritePresentationHtml("<!doctype html><html><head></head><body><main>MMD</main></body></html>");
  assert.match(html, /model-line-briefs-v1\.css/);
  assert.match(html, /model-line-briefs-v1\.js/);
  const js = await worker.fetch(new Request("https://mmdbkk.com/sigil/model/dashboard-assets/model-line-briefs-v1.js"));
  assert.equal(js.status, 200);
  assert.equal(js.headers.get("x-mmd-dashboard-addon"), "model-line-briefs-v1");
  assert.equal(await js.text(), MODEL_LINE_BRIEFS_JS);
  const css = await worker.fetch(new Request("https://mmdbkk.com/sigil/model/dashboard-assets/model-line-briefs-v1.css"));
  assert.equal(css.status, 200);
  assert.equal(await css.text(), MODEL_LINE_BRIEFS_CSS);
});

test("LINE handoff keeps a bounded brief_id and apply flow", () => {
  const url = modelMiniAppHandoffUrl(new Request("https://mmdbkk.com/sigil/model/dashboard?flow=apply&brief_id=brief-42"));
  assert.match(url, /flow=apply/);
  assert.match(url, /brief_id=brief-42/);
  const tooLong = modelMiniAppHandoffUrl(new Request(`https://mmdbkk.com/sigil/model/dashboard?brief_id=${"x".repeat(129)}`));
  assert.doesNotMatch(tooLong, /brief_id/);
  const browse = modelMiniAppHandoffUrl(new Request("https://mmdbkk.com/sigil/model/dashboard/briefs"));
  assert.match(browse, /briefs=1/);
});

test("brief deep link renders the standalone authenticated LIFF presentation after bootstrap", async () => {
  const response = await worker.fetch(new Request("https://mmdbkk.com/sigil/model/dashboard?brief_id=brf_1234567890", {
    headers: { cookie: "mmd_liff_boot=1" },
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-model-entry"), "line-briefs-v1");
  assert.match(await response.text(), /model-line-briefs-v1\.js/);
});

test("Phase A keeps only a valid brief ID for return after application", () => {
  const valid = modelOnboardingPhaseAHtml("published", "brf_1234567890");
  assert.match(valid, /BRIEF_ID="brf_1234567890"/);
  assert.match(valid, /jobBrief\.returnToBrief/);
  const invalid = modelOnboardingPhaseAHtml("published", "<script>");
  assert.match(invalid, /BRIEF_ID=""/);
  assert.doesNotMatch(invalid, /BRIEF_ID="<script>"/);
});
