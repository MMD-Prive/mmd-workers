/* MMD SIGIL Model Confirmation — Direct Private First Job Gate v1
 * Route: /sigil/confirm/job-model
 * Runs before the deferred confirmation runtime. It intercepts only the model
 * /v1/confirm/details read and releases it after the canonical gate says it may.
 */
(() => {
  "use strict";
  if (window.__mmdDirectPrivateFirstJobGateV1) return;
  window.__mmdDirectPrivateFirstJobGateV1 = true;

  const nativeFetch = window.fetch.bind(window);
  const STATUS = "/v1/model/direct-job-gate/status";
  const DETAILS = "/v1/confirm/details";
  const LIFF = "https://miniapp.line.me/2010864854-N34SgCqq/";
  let preflight = null;

  const clean = (v) => String(v == null ? "" : v).trim();
  const lang = () => {
    const raw = clean(new URL(location.href).searchParams.get("lang") || document.documentElement.lang || "th").toLowerCase();
    return raw.startsWith("en") ? "en" : raw.startsWith("zh") ? "zh" : "th";
  };

  function modelReturnTo(token) {
    return "/sigil/confirm/job-model?t=" + encodeURIComponent(token);
  }

  function enterLiff(token) {
    const u = new URL(LIFF);
    u.searchParams.set("handoff", "job-confirmed");
    u.searchParams.set("return_to", modelReturnTo(token));
    u.searchParams.set("lang", lang());
    location.replace(u.toString());
  }

  function addGateStyle() {
    if (document.getElementById("mmd-direct-private-first-job-gate-style")) return;
    const style = document.createElement("style");
    style.id = "mmd-direct-private-first-job-gate-style";
    style.textContent = `
      .mmd-dfjg{position:fixed;inset:0;z-index:2147483000;background:#080808;color:#f8f3ea;font-family:"LINE Seed Sans TH","Noto Sans Thai",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:grid;place-items:center;padding:max(18px,env(safe-area-inset-top)) 16px max(18px,env(safe-area-inset-bottom))}
      .mmd-dfjg__card{width:min(100%,480px);border:1px solid rgba(224,190,112,.28);border-radius:24px;background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.018)),#11100f;padding:24px;box-shadow:0 28px 90px rgba(0,0,0,.48)}
      .mmd-dfjg__k{margin:0 0 10px;color:#d9b969;font-size:10px;font-weight:850;letter-spacing:.14em}
      .mmd-dfjg h1{margin:0;color:#fff3c7;font-size:clamp(27px,8vw,38px);line-height:1.05;letter-spacing:-.035em}
      .mmd-dfjg p{margin:14px 0 0;color:#ded7cd;font-size:14px;line-height:1.7}
      .mmd-dfjg__btn{display:flex;align-items:center;justify-content:center;min-height:50px;margin-top:22px;border-radius:14px;background:linear-gradient(135deg,#efd58d,#c79d48);color:#171109;text-decoration:none;font-size:14px;font-weight:900}
      .mmd-dfjg__state{margin-top:10px;color:#9f978c;font-size:11px;line-height:1.45}
    `;
    document.head.appendChild(style);
  }

  function gateUrl(body, token) {
    const u = new URL(body.rules_url || "/rules/model/private/job-day", "https://mmdbkk.com");
    u.searchParams.set("source", "direct_first_job");
    u.searchParams.set("rules_version", body.rules_version || "job-day-v2");
    u.searchParams.set("t", token);
    if (body.job_id) u.searchParams.set("job_id", body.job_id);
    u.searchParams.set("return_to", modelReturnTo(token));
    return u.pathname + u.search;
  }

  function renderGate(body, token) {
    addGateStyle();
    let wrap = document.querySelector("[data-mmd-direct-first-job-gate]");
    if (!wrap) {
      wrap = document.createElement("section");
      wrap.className = "mmd-dfjg";
      wrap.setAttribute("data-mmd-direct-first-job-gate", "1");
      wrap.setAttribute("role", "dialog");
      wrap.setAttribute("aria-modal", "true");
      wrap.innerHTML = `
        <div class="mmd-dfjg__card">
          <p class="mmd-dfjg__k">DIRECT PRIVATE JOB · FIRST TIME</p>
          <h1>ก่อนดูรายละเอียดงานแรก</h1>
          <p>งานนี้เป็นงานโดยตรงจาก MMD<br>กรุณาอ่านกติกาวันทำงานก่อนเปิดรายละเอียดงาน</p>
          <p>กติกานี้ช่วยให้เข้าใจเรื่องเวลา สถานที่ การเดินทาง การอัปเดตสถานะ และวิธีติดต่อ MMD ระหว่างวันงาน</p>
          <a class="mmd-dfjg__btn" data-mmd-read-job-day-rules>อ่านกติกาวันทำงาน</a>
          <div class="mmd-dfjg__state">ยืนยันตัวตนแล้ว · ยังไม่เปิดรายละเอียดงานจนกว่าจะรับทราบกติกา</div>
        </div>`;
      document.body.appendChild(wrap);
    }
    const link = wrap.querySelector("[data-mmd-read-job-day-rules]");
    if (link) link.href = gateUrl(body, token);
  }

  function renderBlocked(message) {
    addGateStyle();
    let wrap = document.querySelector("[data-mmd-direct-first-job-gate]");
    if (!wrap) {
      wrap = document.createElement("section");
      wrap.className = "mmd-dfjg";
      wrap.setAttribute("data-mmd-direct-first-job-gate", "1");
      document.body.appendChild(wrap);
    }
    wrap.innerHTML = `<div class="mmd-dfjg__card"><p class="mmd-dfjg__k">MMD APP</p><h1>ยังเปิดรายละเอียดงานไม่ได้</h1><p>${message || "ระบบยังตรวจสิทธิ์ของงานนี้ไม่ครบ กรุณาเปิดลิงก์ผ่าน LINE อีกครั้ง"}</p></div>`;
  }

  async function check(token) {
    const response = await nativeFetch(STATUS, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ t: token }),
    });
    const body = await response.json().catch(() => ({}));
    if (response.status === 401 && /^model_session_(required|invalid|expired)$/.test(clean(body.error))) {
      enterLiff(token);
      throw new Error("model_identity_reentry");
    }
    if (!response.ok || body.ok !== true) {
      renderBlocked("ระบบยังตรวจ First Direct Job Gate ไม่ครบ กรุณาเปิดงานผ่าน LINE อีกครั้ง");
      throw new Error(clean(body.error) || "direct_job_gate_unavailable");
    }
    if (body.applies !== true || body.required !== true) return true;
    renderGate(body, token);
    return false;
  }

  async function bodyFrom(input, init) {
    try {
      if (input instanceof Request) return await input.clone().json();
      if (typeof init?.body === "string") return JSON.parse(init.body);
    } catch {}
    return null;
  }

  window.fetch = async function(input, init) {
    let url;
    try { url = new URL(input instanceof Request ? input.url : input, location.href); }
    catch { return nativeFetch(input, init); }
    if (url.pathname !== DETAILS) return nativeFetch(input, init);

    const body = await bodyFrom(input, init);
    if (clean(body?.expected_role).toLowerCase() !== "model" || !clean(body?.t)) {
      return nativeFetch(input, init);
    }

    if (!preflight) preflight = check(clean(body.t));
    const allowed = await preflight;
    if (allowed) return nativeFetch(input, init);

    return new Promise(() => {});
  };
})();