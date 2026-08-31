import fs from "node:fs";

const path = "member-pages-worker/src/liff-member-shell.js";
let source = fs.readFileSync(path, "utf8");
const pattern = /  async function call\(endpoint, body\) \{[\s\S]*?\n  async function readProfile\(\) \{/;
if (!pattern.test(source)) throw new Error("call() block not found");

const replacement = `  function isDiagnosticMode() {
    try { return new URLSearchParams(window.location.search).get("debug") === "1"; }
    catch { return false; }
  }

  function safeDiagnosticCode(value) {
    const code = String(value || "UNKNOWN_ERROR").trim().toUpperCase();
    return /^[A-Z0-9_]{2,80}$/.test(code) ? code : "UNKNOWN_ERROR";
  }

  function showTemporaryError(ref) {
    let message = "ตอนนี้ระบบตรวจสอบข้อมูลชั่วคราวยังไม่พร้อมครับ กรุณาลองใหม่อีกครั้ง";
    if (isDiagnosticMode() && ref) message += "\\nRef: " + ref;
    show(message);
  }

  async function call(endpoint, body) {
    let response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "accept": "application/json" },
        body: JSON.stringify(body || {}),
      });
    } catch {
      showTemporaryError("CLIENT_FETCH_FAILED");
      return null;
    }
    const payload = await response.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      showTemporaryError("HTTP " + response.status + " · INVALID_RESPONSE");
      return null;
    }
    if (!response.ok || payload.ok !== true) {
      if (payload.data) render(payload.data);
      else showTemporaryError("HTTP " + response.status + " · " + safeDiagnosticCode(payload?.error?.code));
      return null;
    }
    render(payload.data || {});
    return payload.data || {};
  }

  async function readProfile() {`;

source = source.replace(pattern, replacement);
fs.writeFileSync(path, source);

for (const needle of ["Ref: ", "CLIENT_FETCH_FAILED", "safeDiagnosticCode", "debug"]) {
  if (!source.includes(needle)) throw new Error(`patched source missing ${needle}`);
}
