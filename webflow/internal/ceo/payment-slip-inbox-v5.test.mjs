import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("./payment-slip-inbox-v5.js", import.meta.url), "utf8");

test("CEO slip inbox requests canonical Payment and Session context", () => {
  assert.match(source, /review-queue\?limit=50&include_context=1/);
  assert.match(source, /item\.client_record_id\s*\|\|\s*''/);
});

test("CEO slip inbox exposes recovery state without leaking provider errors", () => {
  assert.match(source, /settlement_recovery/);
  assert.match(source, /friendlyReviewError/);
  assert.match(source, /invalid_permissions_or_model_not_found/);
  assert.doesNotMatch(source, /save\.textContent\s*=\s*`บันทึกไม่สำเร็จ · \$\{String\(error\.message/);
});

test("admin slip handoff opens only its own private proof and an exact canonical client", () => {
  const detail = { innerHTML: "" };
  const elements = {
    "mmd-slip-inbox": { dataset: {}, querySelector: () => null },
    "mmd-payment-headline-contrast-v1": {},
    "psi-live": { className: "", textContent: "" },
    "psi-list": { innerHTML: "", querySelectorAll: () => [] },
    "psi-detail": detail,
    "psi-search": { addEventListener() {} },
    "psi-refresh": {},
  };
  const document = {
    getElementById: (id) => elements[id] || null,
    querySelectorAll: () => [],
    createElement: () => ({
      set textContent(value) { this.value = value; },
      get innerHTML() { return String(this.value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); },
    }),
  };
  const script = source.replace(/  installNav\(\);\s*load\(\);\s*\}\)\(\);\s*$/, "  globalThis.handoff = { evidenceHref, clientHref, renderDetail, select: (item) => { items = [item]; selected = item.proof_id; } };\n})();");
  const scope = { document, window: { location: { origin: "https://mmdbkk.com" } }, URL };
  runInNewContext(script, scope);
  assert.equal(scope.handoff.evidenceHref({ proof_id: 'line_proof1', evidence_preview_url: '//evil.example/v1/admin/payments/evidence?proof_id=line_proof1' }), '');
  const item = {
    proof_id: "line_proof1", channel: "line_ofc", payment_stage: "membership",
    evidence_preview_url: "/v1/admin/payments/evidence?proof_id=line_proof1",
    evidence_amount_thb: 1199, expected_amount_thb: 1199, reviewable: false,
  };
  scope.handoff.select(item);
  scope.handoff.renderDetail();
  assert.match(detail.innerHTML, /เปิดหลักฐานใน Admin/);
  assert.match(detail.innerHTML, /Proof ID/);
  assert.match(detail.innerHTML, /หลังตรวจรับเงิน/);
  assert.doesNotMatch(detail.innerHTML, /href="\/internal\/admin\/member-intelligence"/);

  scope.handoff.select({ ...item, client_record_id: "rec-client-1", evidence_preview_url: "https://evil.example/v1/admin/payments/evidence?proof_id=line_proof1" });
  scope.handoff.renderDetail();
  assert.match(detail.innerHTML, /member-intelligence\?client_id=rec-client-1/);
  assert.doesNotMatch(detail.innerHTML, /evil\.example|เปิดหลักฐานใน Admin/);

  scope.handoff.select({ ...item, evidence_preview_url: "/v1/admin/payments/evidence?proof_id=other" });
  scope.handoff.renderDetail();
  assert.doesNotMatch(detail.innerHTML, /เปิดหลักฐานใน Admin/);
});
