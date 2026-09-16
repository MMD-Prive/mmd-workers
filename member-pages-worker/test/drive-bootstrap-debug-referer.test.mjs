import assert from "node:assert/strict";
import test from "node:test";
import { driveBootstrapDiagnosticRef } from "../src/drive-bootstrap-debug.js";

test("enables Drive bootstrap diagnostics from same-origin LIFF referer debug flag", () => {
  const request = new Request("https://mmdbkk.com/member/api/liff/start", {
    method: "POST",
    headers: { referer: "https://mmdbkk.com/member/liff?intent=status&debug=1" },
  });
  assert.equal(
    driveBootstrapDiagnosticRef(request, { mapped: false, reason: "line_email_claim_missing" }),
    "DRIVE_BOOTSTRAP_LINE_EMAIL_CLAIM_MISSING",
  );
});

test("does not trust cross-origin referer for Drive bootstrap diagnostics", () => {
  const request = new Request("https://mmdbkk.com/member/api/liff/start", {
    method: "POST",
    headers: { referer: "https://example.com/member/liff?debug=1" },
  });
  assert.equal(driveBootstrapDiagnosticRef(request, { mapped: false, reason: "drive_not_configured" }), "");
});
