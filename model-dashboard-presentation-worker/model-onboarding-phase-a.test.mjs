import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import worker, { isModelOnboardingPhaseARequest, shouldServePhaseAAfterBootstrap } from "./src/index.js";
import { modelOnboardingPhaseAHtml } from "./src/model-onboarding-phase-a-page.js";

test("Phase A uses the current dashboard presentation route after LIFF bootstrap", async () => {
  const request = new Request("https://mmdbkk.com/sigil/model/dashboard", { headers: { cookie: "mmd_liff_boot=1" } });
  assert.equal(shouldServePhaseAAfterBootstrap(request), true);
  const response = await worker.fetch(request);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-mmd-route-owner"), "model-dashboard-presentation-worker");
  assert.equal(response.headers.get("x-mmd-model-entry"), "phase-a-no-media-v1");
  assert.match(await response.text(), /3 \/ 3 · เวลาที่สะดวก/);
  assert.equal(shouldServePhaseAAfterBootstrap(new Request("https://mmdbkk.com/sigil/model/dashboard?liff.state=%3Fflow%3Dverify", { headers: { cookie: "mmd_liff_boot=1" } })), false);
  assert.equal(shouldServePhaseAAfterBootstrap(new Request("https://mmdbkk.com/sigil/model/dashboard?return_to=wish", { headers: { cookie: "mmd_liff_boot=1" } })), false);
  assert.equal(shouldServePhaseAAfterBootstrap(new Request("https://mmdbkk.com/sigil/model/dashboard", { headers: { cookie: "mmd_liff_boot=1; mmd_model_session_v1=signed" } })), false);
});

test("explicit apply entry stays within the registered Mini App and has no media controls", async () => {
  const entry = new Request("https://mmdbkk.com/sigil/model/dashboard?flow=apply");
  assert.equal(isModelOnboardingPhaseARequest(entry), true);
  const handoff = await worker.fetch(entry);
  assert.equal(handoff.status, 302);
  assert.match(handoff.headers.get("location"), /^https:\/\/miniapp\.line\.me\/2010864854-N34SgCqq\/\?flow=apply$/);

  const inLiff = await worker.fetch(new Request("https://mmdbkk.com/sigil/model/dashboard?flow=apply", { headers: { cookie: "mmd_liff_boot=1" } }));
  const html = await inLiff.text();
  assert.match(html, /private_opt_in:false/);
  assert.match(html, /per_only_remark/);
  assert.match(html, /กำลังรอ MMD ตรวจสอบ/);
  assert.doesNotMatch(html, /type=["']file["']|upload-url|upload-complete|R2|Drive/i);
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  for (const script of scripts) new vm.Script(script[1]);
  const nested = new Request("https://mmdbkk.com/sigil/model/dashboard?liff.state=%3Fflow%3Dapply&access_token=opaque");
  assert.equal(isModelOnboardingPhaseARequest(nested), true);
  assert.equal((await worker.fetch(nested)).headers.get("x-mmd-model-entry"), "phase-a-no-media-v1");
});

test("onboarding markup offers separate self description, Public gender and conditional Private gender", () => {
  const html = modelOnboardingPhaseAHtml("published");
  for (const id of ["selfDescription", "publicGender", "privateOpt", "privateGender", "privateGenderBox"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /if\(!privateOn\)\$\("privateGender"\)\.value=""/);
  assert.match(html, /step="1800"/);
});
