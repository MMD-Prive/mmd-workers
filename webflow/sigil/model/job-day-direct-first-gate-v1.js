/* MMD Private Model Job Day — Direct First Job acknowledgement v1
 * Normal visits remain a guide. When source=direct_first_job, the final CTA
 * writes the canonical acknowledgement and returns to the exact signed job.
 */
(() => {
  "use strict";
  const params = new URL(location.href).searchParams;
  if (params.get("source") !== "direct_first_job") return;

  const token = String(params.get("t") || "").trim();
  const rulesVersion = String(params.get("rules_version") || "job-day-v2").trim();
  const rawReturn = String(params.get("return_to") || "").trim();
  const ACK = "/v1/model/direct-job-gate/ack";
  const LIFF = "https://miniapp.line.me/2010864854-N34SgCqq/";

  function safeReturnTo(value) {
    if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "";
    let u;
    try { u = new URL(value, "https://mmdbkk.com"); } catch { return ""; }
    if (u.origin !== "https://mmdbkk.com" || u.pathname !== "/sigil/confirm/job-model") return "";
    const keys = [...u.searchParams.keys()];
    if (keys.length !== 1 || keys[0] !== "t" || !u.searchParams.get("t")) return "";
    return u.pathname + "?t=" + encodeURIComponent(u.searchParams.get("t"));
  }

  const returnTo = safeReturnTo(rawReturn) || (token ? "/sigil/confirm/job-model?t=" + encodeURIComponent(token) : "");
  const root = document.getElementById("mmd-jobday-v2");
  const button = root?.querySelector(".mjd2-final .mjd2-btn-primary");
  if (!root || !button || !token || !returnTo) return;

  let status = root.querySelector("[data-direct-first-job-ack-state]");
  if (!status) {
    status = document.createElement("p");
    status.setAttribute("data-direct-first-job-ack-state", "1");
    status.style.margin = "10px 0 0";
    status.style.fontSize = "12px";
    status.style.lineHeight = "1.55";
    status.style.color = "#aaa29a";
    button.insertAdjacentElement("afterend", status);
  }

  button.href = "#";
  button.textContent = "ฉันอ่านและเข้าใจแล้ว";
  button.setAttribute("data-direct-first-job-ack", "1");

  function reenterLine() {
    const u = new URL(LIFF);
    u.searchParams.set("handoff", "job-confirmed");
    u.searchParams.set("return_to", returnTo);
    location.replace(u.toString());
  }

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    if (button.dataset.busy === "1") return;
    button.dataset.busy = "1";
    button.textContent = "กำลังบันทึก…";
    status.textContent = "";
    try {
      const response = await fetch(ACK, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ t: token, completed: true, rules_version: rulesVersion }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 401 && /^model_session_(required|invalid|expired)$/.test(String(body.error || ""))) {
        reenterLine();
        return;
      }
      if (!response.ok || body.ok !== true || body.required === true) throw new Error(body.error || "ack_failed");
      button.textContent = "เปิดรายละเอียดงาน";
      status.textContent = "รับทราบแล้ว · กำลังกลับไปที่งาน";
      setTimeout(() => location.replace(returnTo), 220);
    } catch {
      button.dataset.busy = "0";
      button.textContent = "ฉันอ่านและเข้าใจแล้ว";
      status.textContent = "ยังบันทึกรับทราบไม่ได้ กรุณาลองอีกครั้ง";
    }
  });
})();