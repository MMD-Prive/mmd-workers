import test from "node:test";
import assert from "node:assert/strict";
import {
  CREATE_JOB_WORKER_PATH,
  handleCreateJobWorkerPage,
  isCreateJobWorkerPageRequest,
  paymentMiniAppUrl,
  modelAvailabilityLabel,
} from "../src/create-job-worker-page.js";

test("Model search distinguishes unknown availability from an explicit unavailable decision", () => {
  assert.equal(modelAvailabilityLabel({ status: "active", available: false, availability_state: "unknown" }), "ยังไม่ยืนยันความพร้อม ต้องตรวจวันเวลาที่ตกลง");
  assert.equal(modelAvailabilityLabel({ available: false }), "ยังไม่ยืนยันความพร้อม ต้องตรวจวันเวลาที่ตกลง");
  assert.equal(modelAvailabilityLabel({ available: false, availability_state: "unavailable" }), "ระบุว่าไม่พร้อมตามข้อมูล API");
  assert.equal(modelAvailabilityLabel({ available: true, availability_state: "unavailable" }), "ระบุว่าไม่พร้อมตามข้อมูล API");
  assert.equal(modelAvailabilityLabel({ available: true, availability_state: "available" }), "พร้อมตามข้อมูล API");
});

test("Create Job is served by the Worker only at its exact page route", () => {
  assert.equal(isCreateJobWorkerPageRequest(CREATE_JOB_WORKER_PATH, "GET"), true);
  assert.equal(isCreateJobWorkerPageRequest(CREATE_JOB_WORKER_PATH + "/", "HEAD"), true);
  assert.equal(isCreateJobWorkerPageRequest(CREATE_JOB_WORKER_PATH, "POST"), false);
  assert.equal(isCreateJobWorkerPageRequest(CREATE_JOB_WORKER_PATH + "/assets/app.js", "GET"), false);
});

test("Worker-owned page calls canonical APIs and never loads Lovable assets", async () => {
  const response = handleCreateJobWorkerPage(new Request("https://mmdbkk.com/internal/admin/jobs/create-job"));
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, private");
  assert.equal(response.headers.get("x-mmd-route-owner"), "admin-worker-api-create-job");
  assert.match(html, /\/v1\/admin\/clients\/lineage-lookup/);
  assert.match(html, /getAll\('client_id'\)/);
  assert.match(html, /canonical_only:true/);
  assert.match(html, /String\(x\.client_id\|\|''\)\.trim\(\)===id/);
  assert.match(html, /loadRequestedClient\(\)/);
  assert.match(html, /\/v1\/admin\/models\/search/);
  assert.match(html, /private_work/);
  assert.match(html, /customer_lane/);
  assert.match(html, /selected_access_folder/);
  assert.match(html, /\/v1\/admin\/job\/create/);
  assert.match(html, /\/v1\/admin\/job\/owner-grant/);
  assert.doesNotMatch(html, /lovable\.app|\/assets\//i);
});

test("Create Job reveals fields in dependency order and avoids unrelated defaults", async () => {
  const response = handleCreateJobWorkerPage(new Request("https://mmdbkk.com/internal/admin/jobs/create-job"));
  const html = await response.text();
  const steps = [...html.matchAll(/data-step="(\d)"/g)].map(match => Number(match[1]));
  assert.deepEqual(steps, [1, 2, 3, 4, 5, 6, 7]);
  assert.ok(html.indexOf("1. เลือกลูกค้า") < html.indexOf("2. กำหนดขอบเขตงาน"));
  assert.ok(html.indexOf("2. กำหนดขอบเขตงาน") < html.indexOf("3. เลือกนายแบบ"));
  assert.match(html, /name="visibility" value="private"/);
  assert.match(html, /name="visibility" value="public"/);
  assert.match(html, /id="privateScope" class="grid hide"/);
  assert.match(html, /id="publicScope" class="grid hide"/);
  assert.match(html, /id="addons" class="hide"/);
  assert.match(html, /placeholder="พิมพ์ชื่อลูกค้าหรือข้อมูลติดต่อ"/);
  assert.doesNotMatch(html, /id="cq" placeholder="เช่น Ice T"/);
  assert.match(html, /ต้นทาง: /);
  assert.match(html, /API ไม่ระบุต้นทาง/);
  assert.match(html, /ไม่มีรูป/);
  assert.match(html, /customer_payment_url/);
  assert.match(html, /ลิงก์ยืนยันลูกค้าและโมเดลยังไม่แสดงจนกว่าระบบ Payment จะยืนยันการชำระ/);
});

test("Worker-owned page supports HEAD without returning the HTML body", async () => {
  const response = handleCreateJobWorkerPage(new Request("https://mmdbkk.com/internal/admin/jobs/create-job", { method: "HEAD" }));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
});

test("Create Job restores the published Payment Mini App contract", async () => {
  assert.equal(
    paymentMiniAppUrl("https://mmdbkk.com/sigil/pay?t=abc_DEF.123-xyz"),
    "https://miniapp.line.me/2010830159-0n1O3ANK?t=abc_DEF.123-xyz",
  );
  for (const value of [
    "https://mmdbkk.com/pay/checkout?t=abc.def",
    "https://evil.example/sigil/pay?t=abc.def",
    "http://mmdbkk.com/sigil/pay?t=abc.def",
    "https://mmdbkk.com/sigil/pay?t=abc.def&t=other",
    "https://mmdbkk.com/sigil/pay?t=abc.def&client=other",
    "https://mmdbkk.com/sigil/pay?t=not-signed",
  ]) assert.equal(paymentMiniAppUrl(value), null);

  const html = await handleCreateJobWorkerPage(
    new Request("https://mmdbkk.com/internal/admin/jobs/create-job"),
  ).text();
  assert.match(html, /2010830159-0n1O3ANK/);
  assert.match(html, /คัดลอก URL ชำระมัดจำผ่าน LINE/);
});
