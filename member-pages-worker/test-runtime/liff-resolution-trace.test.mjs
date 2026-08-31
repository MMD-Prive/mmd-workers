import { describe, expect, it } from "vitest";
import { createLiffResolutionTrace, safeTraceId } from "../src/liff-resolution-trace.js";
import { rewritePendingStatusStartResponse } from "../src/liff-status-resolution-guard.js";

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

describe("LIFF resolution trace", () => {
  it("stores only bounded status metadata for 48 hours", async () => {
    const writes = [];
    const env = {
      LIFF_IDENTITY_KV: {
        async put(key, value, options) { writes.push({ key, value, options }); },
      },
    };
    const pending = [];
    const ctx = { waitUntil(promise) { pending.push(promise); } };
    const request = new Request("https://mmdbkk.com/member/api/liff/start", { method: "POST" });
    const trace = createLiffResolutionTrace(request, env, ctx);

    expect(safeTraceId(trace.traceId)).toBe(trace.traceId);
    trace.event("member_status", "complete", "", { member_resolved: false, pending_identity: true });
    trace.event("drive_bootstrap", "unresolved", "line_email_claim_missing", { mapped: false });
    trace.finish("unresolved", "line_email_claim_missing");
    await Promise.all(pending);

    expect(writes).toHaveLength(1);
    expect(writes[0].key).toBe(`liff_resolution_trace:${trace.traceId}`);
    expect(writes[0].options.expirationTtl).toBe(172800);
    const snapshot = JSON.parse(writes[0].value);
    expect(snapshot.trace_id).toBe(trace.traceId);
    expect(snapshot.final_reason).toBe("line_email_claim_missing");
    expect(JSON.stringify(snapshot)).not.toContain("@");
    expect(JSON.stringify(snapshot)).not.toContain("id_token");
  });

  it("renders same-origin debug trace and reason but keeps normal unresolved copy clean", async () => {
    const payload = {
      ok: true,
      data: {
        member_resolved: false,
        pending_identity: true,
        drive_bootstrap_diagnostic_ref: "DRIVE_BOOTSTRAP_LINE_EMAIL_CLAIM_MISSING",
        next_screen_key: "status_result",
        screen: { key: "status_result", copy: "status", actions: [] },
      },
    };
    const debugRequest = new Request("https://mmdbkk.com/member/api/liff/start", {
      method: "POST",
      headers: { referer: "https://mmdbkk.com/member/liff?intent=status&debug=1" },
    });
    const debugResponse = await rewritePendingStatusStartResponse(debugRequest, jsonResponse(payload), "LIFF-A1B2C3D4E5F6");
    const debugPayload = await debugResponse.json();
    expect(debugPayload.data.screen.copy).toContain("Ref: LIFF-A1B2C3D4E5F6 · DRIVE_BOOTSTRAP_LINE_EMAIL_CLAIM_MISSING");

    const normalRequest = new Request("https://mmdbkk.com/member/api/liff/start", { method: "POST" });
    const normalResponse = await rewritePendingStatusStartResponse(normalRequest, jsonResponse(payload), "LIFF-A1B2C3D4E5F6");
    const normalPayload = await normalResponse.json();
    expect(normalPayload.data.screen.copy).not.toContain("Ref:");
  });
});
