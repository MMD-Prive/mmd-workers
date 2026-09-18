import { describe, expect, it } from "vitest";
import { createLiffResolutionTrace, createLiffShellBoundaryTrace, safeShellBoundaryId, safeTraceId } from "../src/liff-resolution-trace.js";
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

  it("captures the Published shell GET with safe hostname and coarse UA only", async () => {
    const writes = [];
    const pending = [];
    const env = {
      LIFF_IDENTITY_KV: {
        async put(key, value, options) { writes.push({ key, value, options }); },
      },
    };
    const ctx = { waitUntil(promise) { pending.push(promise); } };
    const request = new Request("https://mmdbkk.com/member/liff?intent=status", {
      headers: { "user-agent": "Mozilla/5.0 (iPhone) Line/15.1.0" },
    });
    const boundary = createLiffShellBoundaryTrace(request, env, ctx);
    expect(safeShellBoundaryId(boundary.boundaryId)).toBe(boundary.boundaryId);

    const upstream = new Response("<!doctype html><title>My MMD</title>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
    boundary.finish(upstream);
    const response = boundary.attach(upstream);
    await Promise.all(pending);

    expect(response.headers.get("x-mmd-liff-boundary-id")).toBe(boundary.boundaryId);
    expect(response.headers.get("x-mmd-liff-shell")).toBe("current");
    expect(response.headers.get("x-mmd-liff-ua-class")).toBe("line_in_app");
    expect(response.headers.get("set-cookie")).toContain(`mmd_liff_boundary=${boundary.boundaryId}`);
    expect(writes.map((entry) => entry.key)).toEqual([
      `liff_shell_boundary:${boundary.boundaryId}`,
      "liff_shell_boundary:latest",
    ]);
    const snapshot = JSON.parse(writes[0].value);
    expect(snapshot.hostname).toBe("mmdbkk.com");
    expect(snapshot.ua_class).toBe("line_in_app");
    expect(snapshot.http_status).toBe(200);
    expect(snapshot.shell_current).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain("Mozilla");
    expect(JSON.stringify(snapshot)).not.toContain("@");
  });

  it("correlates the following LIFF start POST to the safe shell boundary cookie", () => {
    const request = new Request("https://mmdbkk.com/member/api/liff/start", {
      method: "POST",
      headers: { cookie: "other=1; mmd_liff_boundary=LIFFGET-A1B2C3D4E5F6; session=opaque" },
    });
    const trace = createLiffResolutionTrace(request);
    expect(trace.snapshot.shell_boundary_id).toBe("LIFFGET-A1B2C3D4E5F6");
    expect(trace.snapshot.steps[0].shell_boundary_present).toBe(true);
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
