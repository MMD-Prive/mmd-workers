/* MMD Privé — Customer Session Tracker v2
 * Page: /sigil/confirm/job-confirmation
 * Truth: signed POST /v1/confirm/details -> customer_session_v2
 * Privacy: ETA only; never reads Jobs/events_json/GPS directly.
 */
(() => {
  "use strict";

  const ROOT_ID = "mmd-job-confirm-v16";
  const API = "https://sigil.mmdbkk.com";
  const POLL_MS = 25000;
  const STAGES = ["confirmed", "en_route", "nearby", "arrived", "service", "aftercare"];
  const STAGE_LABELS = [
    ["01", "CONFIRMED", "ยืนยันแล้ว"],
    ["02", "ON THE WAY", "กำลังเดินทาง"],
    ["03", "NEARBY", "ใกล้ถึงแล้ว"],
    ["04", "ARRIVED", "ถึงแล้ว"],
    ["05", "SERVICE", "กำลังใช้บริการ"],
    ["06", "AFTERCARE", "ดูแลหลังบริการ"],
  ];

  let root;
  let token = "";
  let timer = 0;
  let loading = false;
  let mounted = false;
  let lastPayload = null;

  const $ = (selector) => root?.querySelector(selector) || null;
  const clean = (value) => String(value == null ? "" : value).trim();

  function installStyles() {
    if (document.getElementById("mmd-customer-session-v2-styles")) return;
    const style = document.createElement("style");
    style.id = "mmd-customer-session-v2-styles";
    style.textContent = `
#${ROOT_ID} .mjc16__tracker{margin-top:14px;padding:20px;border:1px solid rgba(217,185,105,.28);border-radius:26px;background:radial-gradient(circle at 90% 0,rgba(217,185,105,.08),transparent 24rem),linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,.012)),#111116;box-shadow:0 22px 65px rgba(0,0,0,.24);animation:mjc16-in .5s ease both}
#${ROOT_ID} .mjc16__tracker-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
#${ROOT_ID} .mjc16__tracker-head p{max-width:620px;margin:9px 0 0;color:#e8e1d7;font-size:13px;font-weight:600;line-height:1.65}
#${ROOT_ID} .mjc16__tracker-badge{flex:0 0 auto;padding:8px 11px;border:1px solid rgba(217,185,105,.28);border-radius:999px;background:rgba(217,185,105,.045);color:#fff5b1;font-size:10px;font-weight:900;white-space:nowrap}
#${ROOT_ID} .mjc16__tracker-badge.is-live{border-color:rgba(156,227,185,.28);background:rgba(156,227,185,.055);color:#9ce3b9}
#${ROOT_ID} .mjc16__tracker-badge.is-warn{border-color:rgba(255,180,168,.28);color:#ffb4a8}
#${ROOT_ID} .mjc16__timeline{display:flex;gap:8px;margin-top:18px;padding:2px 0 8px;overflow-x:auto;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch;scrollbar-width:none}
#${ROOT_ID} .mjc16__timeline::-webkit-scrollbar{display:none}
#${ROOT_ID} .mjc16__timeline-step{flex:0 0 128px;scroll-snap-align:start;padding:12px;border:1px solid rgba(255,255,255,.10);border-radius:16px;background:rgba(255,255,255,.018);opacity:.45;transition:opacity .25s ease,transform .25s ease,border-color .25s ease,background .25s ease}
#${ROOT_ID} .mjc16__timeline-step b{display:block;color:#aaa29a;font-size:9px;font-weight:900;letter-spacing:.08em}
#${ROOT_ID} .mjc16__timeline-step strong{display:block;margin-top:4px;color:#faf7f1;font-size:11px;font-weight:900}
#${ROOT_ID} .mjc16__timeline-step span{display:block;margin-top:3px;color:#aaa29a;font-size:10px;font-weight:650}
#${ROOT_ID} .mjc16__timeline-step.is-done{opacity:.75;border-color:rgba(156,227,185,.20)}
#${ROOT_ID} .mjc16__timeline-step.is-done b{color:#9ce3b9}
#${ROOT_ID} .mjc16__timeline-step.is-active{opacity:1;transform:translateY(-2px);border-color:rgba(217,185,105,.38);background:rgba(217,185,105,.06)}
#${ROOT_ID} .mjc16__timeline-step.is-active b,#${ROOT_ID} .mjc16__timeline-step.is-active strong{color:#fff5b1}
#${ROOT_ID} .mjc16__tracker-focus{display:grid;gap:11px;margin-top:12px}
#${ROOT_ID} .mjc16__tracker-status,#${ROOT_ID} .mjc16__eta{padding:17px;border:1px solid rgba(255,255,255,.10);border-radius:20px;background:rgba(7,7,10,.46)}
#${ROOT_ID} .mjc16__tracker-status strong{display:block;color:#fff5b1;font-size:20px;font-weight:900;line-height:1.3}
#${ROOT_ID} .mjc16__tracker-status span{display:block;margin-top:6px;color:#e8e1d7;font-size:13px;font-weight:650;line-height:1.65}
#${ROOT_ID} .mjc16__tracker-status small,#${ROOT_ID} .mjc16__eta small{display:block;margin-top:8px;color:#aaa29a;font-size:10px;font-weight:700}
#${ROOT_ID} .mjc16__eta>span{display:block;color:#f0d78f;font-size:9px;font-weight:900;letter-spacing:.15em}
#${ROOT_ID} .mjc16__eta>strong{display:block;margin-top:5px;color:#fff5b1;font-size:clamp(34px,10vw,52px);font-weight:900;letter-spacing:-.04em;line-height:1}
#${ROOT_ID} .mjc16__privacy{display:flex;gap:10px;align-items:flex-start;margin-top:11px;padding:12px 13px;border:1px solid rgba(255,255,255,.08);border-radius:15px;background:rgba(255,255,255,.015)}
#${ROOT_ID} .mjc16__privacy strong{flex:0 0 auto;color:#f0d78f;font-size:10px;font-weight:900}
#${ROOT_ID} .mjc16__privacy span{color:#aaa29a;font-size:10px;font-weight:650;line-height:1.55}
#${ROOT_ID} .mjc16__aftercare{display:flex;align-items:center;justify-content:center;width:100%;min-height:56px;margin-top:12px;border-radius:18px;background:linear-gradient(135deg,#f0d78f,#c99f4d);color:#171108!important;-webkit-text-fill-color:#171108!important;font-size:15px;font-weight:900;text-decoration:none;box-shadow:0 16px 36px rgba(201,159,77,.16)}
#${ROOT_ID} .mjc16__aftercare:focus-visible{outline:3px solid rgba(255,245,177,.24);outline-offset:3px}
@media(min-width:760px){#${ROOT_ID} .mjc16__tracker{padding:24px}#${ROOT_ID} .mjc16__tracker-focus{grid-template-columns:1.3fr .7fr}#${ROOT_ID} .mjc16__timeline-step{flex:1 1 0;min-width:0}}
@media(max-width:560px){#${ROOT_ID} .mjc16__tracker-head{display:grid}#${ROOT_ID} .mjc16__tracker-badge{width:max-content}#${ROOT_ID} .mjc16__timeline{margin-right:-4px}#${ROOT_ID} .mjc16__privacy{display:grid}}
@media(prefers-reduced-motion:reduce){#${ROOT_ID} .mjc16__timeline-step{transition:none!important}}
`;
    document.head.appendChild(style);
  }

  function trackerMarkup() {
    const steps = STAGE_LABELS.map(([n, en, th], index) => `
      <div class="mjc16__timeline-step" data-session-step="${STAGES[index]}">
        <b>${n}</b><strong>${en}</strong><span>${th}</span>
      </div>`).join("");

    return `
<section class="mjc16__tracker" data-session-tracker aria-labelledby="mjc16SessionTitle">
  <div class="mjc16__tracker-head">
    <div>
      <div class="mjc16__section-kicker">LIVE SESSION · CUSTOMER VIEW</div>
      <h2 id="mjc16SessionTitle">สถานะงานของคุณ</h2>
      <p>หลังยืนยันแล้ว หน้านี้จะติดตามสถานะ Session ต่อจนถึง Aftercare โดยแสดงเฉพาะข้อมูลที่ MMD ยืนยันและ ETA ที่ Model ส่งเข้าระบบ</p>
    </div>
    <div class="mjc16__tracker-badge" data-session-badge>กำลังเชื่อมต่อ</div>
  </div>
  <div class="mjc16__timeline" data-session-timeline>${steps}</div>
  <div class="mjc16__tracker-focus">
    <div class="mjc16__tracker-status">
      <strong data-session-title>กำลังเชื่อมต่อสถานะงาน</strong>
      <span data-session-copy>ข้อมูลจะอัปเดตอัตโนมัติเมื่อสถานะจาก MMD เปลี่ยน</span>
      <small data-session-updated></small>
    </div>
    <div class="mjc16__eta" data-session-eta-card hidden>
      <span>MODEL ETA</span>
      <strong data-session-eta>—</strong>
      <small data-session-eta-updated></small>
    </div>
  </div>
  <div class="mjc16__privacy">
    <strong>PRIVACY BY DESIGN</strong>
    <span>แสดงเฉพาะ ETA ที่ Model ส่ง · ไม่มี GPS live · ไม่มีแผนที่ติดตามตำแหน่ง · Browser ไม่อ่าน event log ดิบ</span>
  </div>
  <a class="mjc16__aftercare" data-session-aftercare href="/aftercare" hidden>ให้คะแนนและ Aftercare ⭐</a>
</section>`;
  }

  function mount() {
    if (mounted) return true;
    root = document.getElementById(ROOT_ID);
    if (!root) return false;
    token = new URL(window.location.href).searchParams.get("t") || "";
    installStyles();
    if (!$('[data-session-tracker]')) {
      const social = root.querySelector(".mjc16__social");
      const holder = document.createElement("div");
      holder.innerHTML = trackerMarkup().trim();
      const tracker = holder.firstElementChild;
      if (social) social.parentNode.insertBefore(tracker, social);
      else root.querySelector(".mjc16__wrap")?.appendChild(tracker);
    }
    mounted = Boolean($('[data-session-tracker]'));
    return mounted;
  }

  function setBadge(text, mode = "") {
    const el = $('[data-session-badge]');
    if (!el) return;
    el.textContent = text;
    el.classList.remove("is-live", "is-warn");
    if (mode) el.classList.add(mode);
  }

  function ago(value) {
    const time = new Date(clean(value)).getTime();
    if (!Number.isFinite(time)) return "";
    const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
    if (seconds < 60) return "เมื่อสักครู่";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} นาทีที่แล้ว`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ชม.ที่แล้ว`;
    return new Date(time).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  }

  function stageMessage(stage, lifecycle, paymentVerified) {
    if (!paymentVerified && !["arrived", "service", "aftercare"].includes(stage)) {
      return ["รอการยืนยันและชำระเงิน", "เมื่อ MMD ตรวจยอดและ Session พร้อม สถานะการเดินทางจะอัปเดตต่อบนหน้านี้"];
    }
    if (stage === "en_route") return ["น้องกำลังเดินทางมาหาคุณ", "ETA ด้านขวาเป็นเวลาที่ Model ส่งเข้าระบบ ไม่ใช่ตำแหน่ง GPS แบบสด"];
    if (stage === "nearby") return ["น้องใกล้ถึงแล้ว", "กรุณาเตรียมพร้อมตามเวลานัด หากมีการเปลี่ยนแปลง Model จะส่ง ETA ใหม่ผ่านระบบ"];
    if (stage === "arrived") return ["น้องถึงพื้นที่นัดหมายแล้ว", "สถานะนี้มาจาก Session ของ MMD และจะเปลี่ยนเมื่อเข้าสู่ช่วงบริการ"];
    if (stage === "service") {
      if (lifecycle === "work_finished") return ["บริการจบแล้ว · กำลังรอแยกจากกัน", "Aftercare จะยังไม่เปิดจนกว่าสถานะจะเป็น separated เพื่อให้ทั้งสองฝ่ายมีพื้นที่ส่วนตัวก่อน"];
      return ["กำลังใช้บริการ", "หน้านี้จะรอจน Session แยกจากกันเรียบร้อย แล้วจึงเปิด Aftercare"];
    }
    if (stage === "aftercare") return ["Session จบแล้ว · Aftercare พร้อม", "คุณสามารถให้คะแนนและส่งข้อความส่วนตัวถึง Model หรือ MMD ได้จากปุ่มด้านล่าง"];
    return ["MMD ยืนยัน Session แล้ว", "เมื่อ Model เริ่มเดินทาง สถานะและ ETA จะอัปเดตตรงนี้โดยอัตโนมัติ"];
  }

  function renderTimeline(stage, paymentVerified) {
    let activeIndex = STAGES.indexOf(stage);
    if (!paymentVerified && activeIndex >= 0 && activeIndex < 3) activeIndex = -1;
    root.querySelectorAll("[data-session-step]").forEach((el, index) => {
      el.classList.toggle("is-done", activeIndex >= 0 && index < activeIndex);
      el.classList.toggle("is-active", index === activeIndex);
    });
    if (activeIndex >= 0) {
      root.querySelector(`[data-session-step="${STAGES[activeIndex]}"]`)?.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }

  function render(payload) {
    lastPayload = payload;
    const session = payload?.customer_session;
    if (!session || session.schema !== "customer_session_v2") {
      setBadge("รอ Session", "");
      return;
    }

    const paymentVerified = Boolean(payload?.payment?.verified);
    const stage = STAGES.includes(session.customer_stage) ? session.customer_stage : "confirmed";
    const lifecycle = clean(session.lifecycle_state);
    const [title, copy] = stageMessage(stage, lifecycle, paymentVerified);
    const titleEl = $('[data-session-title]');
    const copyEl = $('[data-session-copy]');
    const updatedEl = $('[data-session-updated]');
    if (titleEl) titleEl.textContent = title;
    if (copyEl) copyEl.textContent = copy;
    if (updatedEl) {
      const rel = ago(session.status_updated_at);
      updatedEl.textContent = rel ? `อัปเดตสถานะล่าสุด ${rel}` : "";
    }

    renderTimeline(stage, paymentVerified);
    setBadge(session.source_available === false ? "กำลังเชื่อมต่อ" : "LIVE STATUS", session.source_available === false ? "" : "is-live");

    const etaCard = $('[data-session-eta-card]');
    const etaValue = $('[data-session-eta]');
    const etaUpdated = $('[data-session-eta-updated]');
    const eta = session.eta;
    const showEta = ["en_route", "nearby"].includes(stage) && Number.isInteger(eta?.minutes) && eta.minutes > 0;
    if (etaCard) etaCard.hidden = !showEta;
    if (showEta) {
      if (etaValue) etaValue.textContent = `ประมาณ ${eta.minutes} นาที`;
      if (etaUpdated) {
        const rel = ago(eta.updated_at);
        etaUpdated.textContent = rel ? `อัปเดตล่าสุด ${rel}` : "ETA ที่ Model ส่งล่าสุด";
      }
    }

    const aftercare = $('[data-session-aftercare]');
    const url = clean(session?.aftercare?.url);
    const available = Boolean(session?.aftercare?.available) && /^\/aftercare\?t=/.test(url);
    if (aftercare) {
      aftercare.hidden = !available;
      if (available) aftercare.href = url;
      else aftercare.removeAttribute("href");
    }
  }

  async function load() {
    if (!mounted && !mount()) return;
    if (loading || document.hidden || !token) {
      if (!token) setBadge("ลิงก์ไม่สมบูรณ์", "is-warn");
      return;
    }
    loading = true;
    try {
      const response = await fetch(`${API}/v1/confirm/details`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        credentials: "omit",
        body: JSON.stringify({ t: token, expected_role: "customer" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${response.status}`);
      render(data);
    } catch {
      setBadge(lastPayload ? "เชื่อมต่อใหม่อัตโนมัติ" : "ยังเชื่อมต่อไม่ได้", "is-warn");
    } finally {
      loading = false;
    }
  }

  function start() {
    if (!mount()) return;
    load();
    clearInterval(timer);
    timer = window.setInterval(load, POLL_MS);
    window.addEventListener("focus", load, { passive: true });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
