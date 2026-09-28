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
  let instructionsRef = "";
  let instructionsLoading = false;
  let changeRequestBusy = false;

  const $ = (selector) => root?.querySelector(selector) || null;
  const clean = (value) => String(value == null ? "" : value).trim();
  const html = (value) => clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

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
#${ROOT_ID} .mjc16__changes{margin-top:14px;padding:20px;border:1px solid rgba(217,185,105,.24);border-radius:24px;background:linear-gradient(180deg,rgba(217,185,105,.055),rgba(255,255,255,.012)),#0d0d11}
#${ROOT_ID} .mjc16__changes-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
#${ROOT_ID} .mjc16__changes-head h3{margin:5px 0 0;color:#fff5b1;font-size:clamp(19px,5vw,27px);line-height:1.2}
#${ROOT_ID} .mjc16__changes-head p{max-width:620px;margin:7px 0 0;color:#d7d0c7;font-size:12px;font-weight:600;line-height:1.65}
#${ROOT_ID} .mjc16__change-grid{display:grid;gap:10px;margin-top:16px}
#${ROOT_ID} .mjc16__change-card{display:grid;gap:9px;padding:14px;border:1px solid rgba(255,255,255,.09);border-radius:17px;background:rgba(0,0,0,.16)}
#${ROOT_ID} .mjc16__change-card label,#${ROOT_ID} .mjc16__change-more label{color:#f0d78f;font-size:10px;font-weight:800;letter-spacing:.06em}
#${ROOT_ID} .mjc16__change-card input,#${ROOT_ID} .mjc16__change-more input,#${ROOT_ID} .mjc16__change-more select,#${ROOT_ID} .mjc16__change-more textarea{width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.11);border-radius:13px;background:#09090c;color:#f7f2ea;padding:11px 12px;font:600 13px/1.45 inherit;outline:none}
#${ROOT_ID} .mjc16__change-more textarea{min-height:90px;resize:vertical}
#${ROOT_ID} .mjc16__change-card input:focus,#${ROOT_ID} .mjc16__change-more input:focus,#${ROOT_ID} .mjc16__change-more select:focus,#${ROOT_ID} .mjc16__change-more textarea:focus{border-color:rgba(240,215,143,.48);box-shadow:0 0 0 3px rgba(240,215,143,.06)}
#${ROOT_ID} .mjc16__change-btn{min-height:44px;border:1px solid rgba(240,215,143,.32);border-radius:13px;background:rgba(240,215,143,.08);color:#fff5b1;font-size:12px;font-weight:850;cursor:pointer}
#${ROOT_ID} .mjc16__change-btn.is-primary{min-height:50px;border:0;background:linear-gradient(135deg,#f0d78f,#c99f4d);color:#171108}
#${ROOT_ID} .mjc16__change-btn:disabled{opacity:.55;cursor:wait}
#${ROOT_ID} .mjc16__change-more{display:grid;gap:10px;margin-top:12px;padding-top:14px;border-top:1px solid rgba(255,255,255,.08)}
#${ROOT_ID} .mjc16__change-row{display:grid;gap:8px}
#${ROOT_ID} .mjc16__change-status{margin:10px 0 0;padding:11px 12px;border-radius:13px;background:rgba(255,255,255,.025);color:#d7d0c7;font-size:11px;font-weight:700;line-height:1.55}
#${ROOT_ID} .mjc16__change-status.is-ok{border:1px solid rgba(156,227,185,.22);color:#9ce3b9}
#${ROOT_ID} .mjc16__change-status.is-error{border:1px solid rgba(255,180,168,.22);color:#ffb4a8}
@media(min-width:760px){#${ROOT_ID} .mjc16__change-grid{grid-template-columns:.72fr 1.28fr}#${ROOT_ID} .mjc16__change-row.two{grid-template-columns:.7fr 1.3fr}}
#${ROOT_ID} .mjc16__final-pay{margin-top:14px;padding:20px;border:1px solid rgba(217,185,105,.34);border-radius:24px;background:linear-gradient(155deg,rgba(217,185,105,.09),rgba(255,255,255,.018) 46%),#0c0c10}
#${ROOT_ID} .mjc16__final-pay[hidden]{display:none!important}
#${ROOT_ID} .mjc16__final-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
#${ROOT_ID} .mjc16__final-head h3{margin:5px 0 0;color:#fff5b1;font-size:clamp(21px,5vw,30px);line-height:1.2}
#${ROOT_ID} .mjc16__final-amount{flex:0 0 auto;text-align:right;color:#f0d78f;font-size:clamp(24px,7vw,38px);font-weight:950;letter-spacing:-.04em}
#${ROOT_ID} .mjc16__final-amount small{display:block;color:#aaa29a;font-size:9px;letter-spacing:.12em}
#${ROOT_ID} .mjc16__pay-methods{display:grid;gap:10px;margin-top:16px}
#${ROOT_ID} .mjc16__pay-method{padding:13px 14px;border:1px solid rgba(255,255,255,.09);border-radius:15px;background:rgba(255,255,255,.018);color:#e8e1d7;font-size:12px;font-weight:700;line-height:1.55;overflow-wrap:anywhere}
#${ROOT_ID} .mjc16__pay-method strong{display:block;color:#fff5b1;font-size:10px;letter-spacing:.08em}
#${ROOT_ID} .mjc16__pay-qr{width:180px;max-width:70%;margin:4px auto;padding:9px;border-radius:14px;background:#fff}
#${ROOT_ID} .mjc16__proof-form{display:grid;gap:10px;margin-top:15px;padding-top:15px;border-top:1px solid rgba(255,255,255,.08)}
#${ROOT_ID} .mjc16__proof-file{width:100%;padding:12px;border:1px dashed rgba(217,185,105,.34);border-radius:14px;background:rgba(0,0,0,.20);color:#e8e1d7;font-size:12px}
#${ROOT_ID} .mjc16__proof-submit{min-height:52px;border:0;border-radius:16px;background:linear-gradient(135deg,#f0d78f,#c99f4d);color:#171108;font-size:14px;font-weight:900;cursor:pointer}
#${ROOT_ID} .mjc16__proof-submit:disabled{cursor:wait;opacity:.55}
#${ROOT_ID} .mjc16__proof-status{margin:12px 0 0;padding:13px 14px;border-radius:15px;background:rgba(255,255,255,.025);color:#e8e1d7;font-size:12px;font-weight:700;line-height:1.6}
#${ROOT_ID} .mjc16__proof-status.is-waiting{border:1px solid rgba(240,215,143,.25);color:#fff5b1}
#${ROOT_ID} .mjc16__proof-status.is-paid{border:1px solid rgba(156,227,185,.25);color:#9ce3b9}
#${ROOT_ID} .mjc16__proof-status.is-error{border:1px solid rgba(255,180,168,.25);color:#ffb4a8}
#${ROOT_ID} .mjc16__aftercare{display:flex;align-items:center;justify-content:center;width:100%;min-height:56px;margin-top:12px;border-radius:18px;background:linear-gradient(135deg,#f0d78f,#c99f4d);color:#171108!important;-webkit-text-fill-color:#171108!important;font-size:15px;font-weight:900;text-decoration:none;box-shadow:0 16px 36px rgba(201,159,77,.16)}
#${ROOT_ID} .mjc16__aftercare:focus-visible{outline:3px solid rgba(255,245,177,.24);outline-offset:3px}
@media(min-width:760px){#${ROOT_ID} .mjc16__tracker{padding:24px}#${ROOT_ID} .mjc16__tracker-focus{grid-template-columns:1.3fr .7fr}#${ROOT_ID} .mjc16__timeline-step{flex:1 1 0;min-width:0}}
@media(max-width:560px){#${ROOT_ID} .mjc16__tracker-head{display:grid}#${ROOT_ID} .mjc16__tracker-badge{width:max-content}#${ROOT_ID} .mjc16__timeline{margin-right:-4px}#${ROOT_ID} .mjc16__privacy{display:grid}}
@media(max-width:560px){#${ROOT_ID} .mjc16__final-head{display:grid}#${ROOT_ID} .mjc16__final-amount{text-align:left}}
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
  <section class="mjc16__changes" data-customer-change-panel>
    <div class="mjc16__changes-head">
      <div><div class="mjc16__section-kicker">UPDATE REQUEST</div><h3>ต้องการปรับรายละเอียดงาน?</h3><p>แก้เวลาและสถานที่ หรือส่งคำขอเรื่องวัน เลื่อนงาน ยกเลิก และรายละเอียดเพิ่มเติมให้ MMD ตรวจสอบได้จากหน้านี้</p></div>
    </div>
    <div class="mjc16__change-grid">
      <div class="mjc16__change-card">
        <label for="mjc16ChangeTime">เวลาที่ต้องการ</label>
        <input id="mjc16ChangeTime" data-change-time type="time">
        <button class="mjc16__change-btn" data-change-time-submit type="button">ส่งเวลาใหม่ให้ MMD</button>
      </div>
      <div class="mjc16__change-card">
        <label for="mjc16ChangeLocation">สถานที่ที่ต้องการ</label>
        <input id="mjc16ChangeLocation" data-change-location type="text" maxlength="360" placeholder="ชื่อโรงแรม / สถานที่ / Area">
        <input data-change-map type="url" inputmode="url" placeholder="Google Maps URL (ถ้ามี)">
        <button class="mjc16__change-btn" data-change-location-submit type="button">ส่งสถานที่ใหม่ให้ MMD</button>
      </div>
    </div>
    <div class="mjc16__change-more">
      <div class="mjc16__change-row two">
        <label>แจ้งเพิ่มเติมเกี่ยวกับงานนี้
          <select data-change-type>
            <option value="date_change">ขอเปลี่ยนวัน</option>
            <option value="reschedule">ขอเลื่อนงาน</option>
            <option value="cancellation">ต้องการยกเลิก</option>
            <option value="remark">แจ้งรายละเอียดเพิ่มเติม</option>
          </select>
        </label>
        <label data-change-date-wrap>วันที่ต้องการ
          <input data-change-date type="date">
        </label>
      </div>
      <label>Remark / เหตุผลหรือรายละเอียด
        <textarea data-change-remark maxlength="2000" placeholder="เช่น เที่ยวบินเลื่อน / ต้องเปลี่ยนวัน / ขอแจ้งรายละเอียดเพิ่มเติม"></textarea>
      </label>
      <button class="mjc16__change-btn is-primary" data-change-submit type="button">ส่งคำขอให้ MMD</button>
    </div>
    <p class="mjc16__change-status" data-change-status>การส่งคำขอจะเข้า MMD Review และเก็บรายละเอียดงานเดิมไว้จนกว่าจะตรวจสอบเสร็จ</p>
  </section>
  <section class="mjc16__final-pay" data-final-payment hidden aria-live="polite">
    <div class="mjc16__final-head">
      <div><div class="mjc16__section-kicker">FINAL PAYMENT</div><h3 data-final-title>Model ถึงแล้ว</h3></div>
      <div class="mjc16__final-amount"><small>ยอดคงเหลือ</small><span data-final-amount>—</span></div>
    </div>
    <div class="mjc16__pay-methods" data-final-methods><div class="mjc16__pay-method">กำลังโหลดช่องทางชำระเงิน…</div></div>
    <a class="mjc16__proof-submit" data-final-pay-link href="#" style="display:flex;align-items:center;justify-content:center;text-decoration:none">ชำระยอดคงเหลือ / ส่งสลิป</a>
    <p class="mjc16__proof-status" data-final-proof-status>ระบบจะพาไปหน้า SIGIL PAY เดียวของงานนี้ เพื่อชำระและส่งสลิปครั้งเดียว</p>
  </section>
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
    if (mounted) wireChangePanel();
    return mounted;
  }

  function timeInputValue(value) {
    const raw = clean(value);
    const direct = /^([01]\d|2[0-3]):[0-5]\d$/.exec(raw);
    if (direct) return direct[0];
    const iso = /T([0-2]\d:[0-5]\d)/.exec(raw);
    return iso ? iso[1] : "";
  }

  function setChangeStatus(message, mode = "") {
    const el = $('[data-change-status]');
    if (!el) return;
    el.textContent = message;
    el.classList.remove("is-ok", "is-error");
    if (mode) el.classList.add(mode);
  }

  function changeButtonsDisabled(value) {
    root.querySelectorAll("[data-change-time-submit],[data-change-location-submit],[data-change-submit]").forEach((button) => {
      button.disabled = Boolean(value);
    });
  }

  function syncChangeType() {
    const type = clean($('[data-change-type]')?.value);
    const dateWrap = $('[data-change-date-wrap]');
    if (dateWrap) dateWrap.hidden = !["date_change", "reschedule"].includes(type);
  }

  async function submitChangeRequest(payload) {
    if (changeRequestBusy || !token) return;
    changeRequestBusy = true;
    changeButtonsDisabled(true);
    setChangeStatus("กำลังส่งคำขอให้ MMD…");
    try {
      const response = await fetch(`${API}/v1/confirm/change-request`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        credentials: "omit",
        body: JSON.stringify({ t: token, expected_role: "customer", ...payload }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${response.status}`);
      setChangeStatus(data?.message || "MMD ได้รับคำขอแล้ว · รอตรวจสอบ", "is-ok");
    } catch {
      setChangeStatus("ส่งคำขอไม่สำเร็จ กรุณาลองอีกครั้งหรือติดต่อ MMD", "is-error");
    } finally {
      changeRequestBusy = false;
      changeButtonsDisabled(false);
    }
  }

  function wireChangePanel() {
    const type = $('[data-change-type]');
    if (type && !type.dataset.wired) {
      type.dataset.wired = "1";
      type.addEventListener("change", syncChangeType);
      syncChangeType();
    }

    const timeButton = $('[data-change-time-submit]');
    if (timeButton && !timeButton.dataset.wired) {
      timeButton.dataset.wired = "1";
      timeButton.addEventListener("click", () => {
        const value = clean($('[data-change-time]')?.value);
        if (!value) return setChangeStatus("กรุณาเลือกเวลาที่ต้องการ", "is-error");
        submitChangeRequest({
          request_type: "time_change",
          requested_start_time: value,
          remark: clean($('[data-change-remark]')?.value),
        });
      });
    }

    const locationButton = $('[data-change-location-submit]');
    if (locationButton && !locationButton.dataset.wired) {
      locationButton.dataset.wired = "1";
      locationButton.addEventListener("click", () => {
        const location = clean($('[data-change-location]')?.value);
        const map = clean($('[data-change-map]')?.value);
        if (!location && !map) return setChangeStatus("กรุณาระบุสถานที่หรือ Google Maps URL", "is-error");
        submitChangeRequest({
          request_type: "location_change",
          requested_location_name: location,
          requested_google_map_url: map,
          remark: clean($('[data-change-remark]')?.value),
        });
      });
    }

    const submit = $('[data-change-submit]');
    if (submit && !submit.dataset.wired) {
      submit.dataset.wired = "1";
      submit.addEventListener("click", () => {
        const requestType = clean($('[data-change-type]')?.value);
        const remark = clean($('[data-change-remark]')?.value);
        const date = clean($('[data-change-date]')?.value);
        if (requestType === "cancellation" && remark.length < 3) return setChangeStatus("กรุณาแจ้งเหตุผลสำหรับการยกเลิก", "is-error");
        if (requestType === "remark" && remark.length < 2) return setChangeStatus("กรุณาใส่รายละเอียดที่ต้องการแจ้ง", "is-error");
        if (requestType === "date_change" && !date) return setChangeStatus("กรุณาเลือกวันที่ต้องการ", "is-error");
        submitChangeRequest({
          request_type: requestType,
          requested_date: date,
          remark,
        });
      });
    }
  }

  function seedChangeFields(payload) {
    const time = $('[data-change-time]');
    const location = $('[data-change-location]');
    const map = $('[data-change-map]');
    if (time && !time.dataset.seeded) {
      time.value = timeInputValue(payload?.start_time);
      time.dataset.seeded = "1";
    }
    if (location && !location.dataset.seeded) {
      location.value = clean(payload?.location_name);
      location.dataset.seeded = "1";
    }
    if (map && !map.dataset.seeded) {
      map.value = clean(payload?.google_map_url);
      map.dataset.seeded = "1";
    }
  }

  function money(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? `${amount.toLocaleString("th-TH", { maximumFractionDigits: 2 })} THB` : "—";
  }

  function setProofStatus(message, mode = "") {
    const status = $('[data-final-proof-status]');
    if (!status) return;
    status.textContent = message;
    status.classList.remove("is-waiting", "is-paid", "is-error");
    if (mode) status.classList.add(mode);
  }

  function renderPaymentMethods(data, expectedRef) {
    if (expectedRef !== instructionsRef) return;
    const methods = $('[data-final-methods]');
    if (!methods) return;
    if (!data?.available) {
      methods.innerHTML = `<div class="mjc16__pay-method">${data?.reason === "payment_verified" ? "ยอดนี้ยืนยันแล้ว" : "รับหลักฐานแล้ว · MMD กำลังตรวจยอด"}</div>`;
      return;
    }
    const instruction = data.instructions || {};
    const rows = [];
    if (instruction.promptpay?.enabled) {
      rows.push(`<div class="mjc16__pay-method"><strong>PROMPTPAY</strong>${html(instruction.promptpay.display_ref)}</div>`);
      if (/^https:\/\//i.test(clean(instruction.promptpay.qr_url))) {
        rows.push(`<img class="mjc16__pay-qr" src="${html(instruction.promptpay.qr_url)}" alt="PromptPay QR สำหรับยอดคงเหลือ">`);
      }
    }
    if (instruction.bank_transfer?.enabled) {
      rows.push(`<div class="mjc16__pay-method"><strong>BANK TRANSFER</strong>${html(instruction.bank_transfer.bank_name_th)} · ${html(instruction.bank_transfer.account_name_th)} · ${html(instruction.bank_transfer.account_number)}</div>`);
    }
    if (instruction.paypal_card?.enabled && /^https:\/\//i.test(clean(instruction.paypal_card.url))) {
      rows.push(`<a class="mjc16__pay-method" href="${html(instruction.paypal_card.url)}" target="_blank" rel="noopener"><strong>CARD / PAYPAL</strong>เปิดหน้าชำระเงิน ↗</a>`);
    }
    methods.innerHTML = rows.join("") || '<div class="mjc16__pay-method">กรุณาติดต่อ MMD เพื่อรับช่องทางชำระเงิน</div>';
  }

  async function loadPaymentInstructions(paymentRef) {
    if (!paymentRef || instructionsLoading) return;
    instructionsLoading = true;
    instructionsRef = paymentRef;
    try {
      const response = await fetch(`${API}/v1/confirm/payment-instructions`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        credentials: "omit",
        body: JSON.stringify({ t: token }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false || clean(data.payment_ref) !== paymentRef) throw new Error("payment_instructions_failed");
      renderPaymentMethods(data, paymentRef);
    } catch {
      if (instructionsRef === paymentRef) {
        const methods = $('[data-final-methods]');
        if (methods) methods.innerHTML = '<div class="mjc16__pay-method">โหลดช่องทางชำระเงินไม่สำเร็จ กรุณาลองใหม่หรือติดต่อ MMD</div>';
      }
    } finally {
      instructionsLoading = false;
    }
  }

  function renderFinalPayment(payload) {
    const panel = $('[data-final-payment]');
    const payment = payload?.payment;
    const active = Boolean(payment && payment.stage === "final" && clean(payload.payment_ref));
    if (!panel) return;
    panel.hidden = !active;
    if (!active) {
      instructionsRef = "";
      return;
    }

    const amount = $('[data-final-amount]');
    if (amount) amount.textContent = money(payment.amount_due_thb);
    const payLink = $('[data-final-pay-link]');
    const canonicalPayUrl = token ? `/sigil/pay?t=${encodeURIComponent(token)}` : "";

    if (payment.verified) {
      if (payLink) payLink.hidden = true;
      setProofStatus("ชำระยอดคงเหลือเรียบร้อย · Model สามารถเริ่มงานได้", "is-paid");
      const methods = $('[data-final-methods]');
      if (methods) methods.innerHTML = '<div class="mjc16__pay-method"><strong>PAYMENT VERIFIED</strong>MMD ตรวจและยืนยันยอดเรียบร้อยแล้ว</div>';
      return;
    }
    if (payment.proof_received) {
      if (payLink) payLink.hidden = true;
      setProofStatus("รับหลักฐานแล้ว · MMD กำลังตรวจยอด · ไม่ต้องส่งซ้ำ", "is-waiting");
      const methods = $('[data-final-methods]');
      if (methods) methods.innerHTML = '<div class="mjc16__pay-method"><strong>PENDING REVIEW</strong>ระบบรับสลิปแล้วและกำลังรอ MMD ตรวจยอด</div>';
      return;
    }

    if (payLink) {
      payLink.hidden = !canonicalPayUrl;
      if (canonicalPayUrl) payLink.href = canonicalPayUrl;
    }
    setProofStatus("กดชำระยอดคงเหลือ ระบบจะเปิด SIGIL PAY ของงานเดิมเพื่อชำระและส่งสลิป");
    if (instructionsRef !== clean(payload.payment_ref)) loadPaymentInstructions(clean(payload.payment_ref));
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
    seedChangeFields(payload);
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
    renderFinalPayment(payload);
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
