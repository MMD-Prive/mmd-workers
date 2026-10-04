/* MMD SIGIL Model Confirmation — Direct Private First Job Gate v1 (v1.1 no-silent-failure)
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
  const STATUS_TIMEOUT_MS = 15000;
  const REENTRY_KEY = "mmd_dfjg_reentry_at";
  const REENTRY_WINDOW_MS = 3 * 60 * 1000;
  let preflight = null;

  const clean = (v) => String(v == null ? "" : v).trim();
  const lang = () => {
    const raw = clean(new URL(location.href).searchParams.get("lang") || document.documentElement.lang || "th").toLowerCase();
    return raw.startsWith("en") ? "en" : raw.startsWith("zh") ? "zh" : "th";
  };

  function modelReturnTo(token) {
    return "/sigil/confirm/job-model?t=" + encodeURIComponent(token);
  }

  function liffUrl(token) {
    const u = new URL(LIFF);
    u.searchParams.set("handoff", "job-confirmed");
    u.searchParams.set("return_to", modelReturnTo(token));
    u.searchParams.set("lang", lang());
    return u.toString();
  }

  function recentReentry() {
    try {
      const at = Number(window.sessionStorage?.getItem(REENTRY_KEY) || 0);
      return Number.isFinite(at) && at > 0 && Date.now() - at < REENTRY_WINDOW_MS;
    } catch (_) {
      return false;
    }
  }

  function markReentry() {
    try { window.sessionStorage?.setItem(REENTRY_KEY, String(Date.now())); } catch (_) {}
  }

  function insideLiff() {
    return /\bLIFF\b/i.test(String(navigator.userAgent || ""));
  }

  // Redirect to the LINE Mini App once. If we are already inside LIFF, or we
  // bounced here within the window, a second automatic redirect would loop, so
  // show a visible screen with a manual button and an owner reference instead.
  function enterLiff(token, code) {
    if (insideLiff() || recentReentry()) {
      renderBlocked("ยังยืนยันตัวตนใน LINE ไม่สำเร็จ กรุณากดปุ่มด้านล่างเพื่อเปิดงานใน MY MODEL อีกครั้ง", code || "model_session_reentry_loop", liffUrl(token));
      return false;
    }
    markReentry();
    location.replace(liffUrl(token));
    return true;
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

  function renderBlocked(message, code, actionUrl) {
    addGateStyle();
    let wrap = document.querySelector("[data-mmd-direct-first-job-gate]");
    if (!wrap) {
      wrap = document.createElement("section");
      wrap.className = "mmd-dfjg";
      wrap.setAttribute("data-mmd-direct-first-job-gate", "1");
      wrap.setAttribute("role", "alert");
      document.body.appendChild(wrap);
    }
    wrap.setAttribute("data-mmd-gate-state", "blocked");
    const card = document.createElement("div");
    card.className = "mmd-dfjg__card";
    const kicker = document.createElement("p");
    kicker.className = "mmd-dfjg__k";
    kicker.textContent = "MY MODEL";
    const title = document.createElement("h1");
    title.textContent = "ยังเปิดรายละเอียดงานไม่ได้";
    const text = document.createElement("p");
    text.textContent = message || "ระบบยังตรวจสิทธิ์ของงานนี้ไม่ครบ กรุณาเปิดลิงก์ผ่าน LINE อีกครั้ง";
    card.append(kicker, title, text);
    if (actionUrl) {
      const button = document.createElement("a");
      button.className = "mmd-dfjg__btn";
      button.href = actionUrl;
      button.textContent = "เปิดใน MY MODEL (LINE)";
      card.appendChild(button);
    }
    const retry = document.createElement("a");
    retry.className = "mmd-dfjg__btn";
    retry.href = location.pathname + location.search;
    retry.textContent = "ลองใหม่";
    retry.style.background = "transparent";
    retry.style.border = "1px solid rgba(224,190,112,.4)";
    retry.style.color = "#efd58d";
    card.appendChild(retry);
    const ref = document.createElement("div");
    ref.className = "mmd-dfjg__state";
    ref.textContent = `รหัสอ้างอิงสำหรับแจ้ง MMD: MC-G-${clean(code || "gate_blocked").replace(/[^a-z0-9_]/gi, "").slice(0, 60)}`;
    card.appendChild(ref);
    wrap.replaceChildren(card);
    try { console.warn("[mmd-direct-first-job-gate]", { code: clean(code) }); } catch (_) {}
  }

  async function statusFetch(token) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timer = null;
    const request = nativeFetch(STATUS, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ t: token }),
      signal: controller?.signal,
    });
    request.catch(() => {});
    const watchdog = new Promise((_, reject) => {
      timer = setTimeout(() => {
        try { controller?.abort(); } catch (_) {}
        reject(new Error("direct_job_gate_timeout"));
      }, STATUS_TIMEOUT_MS);
    });
    try {
      return await Promise.race([request, watchdog]);
    } catch (error) {
      throw new Error(clean(error?.message) === "direct_job_gate_timeout" ? "direct_job_gate_timeout" : "direct_job_gate_network");
    } finally {
      clearTimeout(timer);
    }
  }

  async function check(token) {
    let response;
    try {
      response = await statusFetch(token);
    } catch (error) {
      renderBlocked("เชื่อมต่อระบบตรวจสิทธิ์งานไม่ได้ กรุณาเช็กอินเทอร์เน็ตแล้วกดลองใหม่", error.message);
      throw error;
    }
    const body = await response.json().catch(() => ({}));
    if (response.status === 401 && /^model_session_(required|invalid|expired)$/.test(clean(body.error))) {
      if (enterLiff(token, clean(body.error))) throw new Error("model_identity_reentry");
      throw new Error(clean(body.error));
    }
    if (!response.ok || body.ok !== true) {
      renderBlocked("ระบบยังตรวจ First Direct Job Gate ไม่ครบ กรุณาเปิดงานผ่าน LINE อีกครั้ง", clean(body.error) || `http_${response.status}`);
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

    if (!preflight) {
      // A failed preflight must not be cached, otherwise "try again" can never recover.
      preflight = check(clean(body.t)).catch((error) => {
        preflight = null;
        throw error;
      });
    }
    const allowed = await preflight;
    if (allowed) return nativeFetch(input, init);

    return new Promise(() => {});
  };
})();