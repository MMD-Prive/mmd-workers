(function () {
  "use strict";

  const VERSION = "1.0.0";
  const JOBS_PATH = "/v1/admin/dashboard?view=jobs&page_size=50";
  const SAFETY_PATH = "/studio/api/model/location/safety-check";
  const LOGIN_PATH = "/internal/admin/login";
  const MAX_JOB_PAGES = 6;
  const FIRST_POINT_POLL_MS = 10000;
  const FIRST_POINT_MAX_POLLS = 6;

  const REASONS = [
    ["model_unreachable", "ติดต่อ Model ไม่ได้"],
    ["arrival_disputed", "มีข้อสงสัยเรื่องการถึงสถานที่"],
    ["separation_disputed", "มีข้อสงสัยเรื่องการแยกจากกันหลังงาน"],
    ["session_integrity", "ตรวจความถูกต้องของ Active Job"],
    ["safety_incident", "เหตุด้านความปลอดภัย"],
    ["model_requested_help", "Model ขอให้ช่วยตรวจตำแหน่ง"],
  ];
  const DURATIONS = [15, 30, 60];

  const root = document.getElementById("mmd-os-v1") || document.querySelector("[data-control-room]");
  if (!root || root.querySelector("[data-mmd-safety-location-control]")) return;

  let jobs = [];
  let selectedSessionId = "";
  let selectedDuration = 15;
  let snapshot = null;
  let firstPointTimer = 0;
  let firstPointPolls = 0;
  let countdownTimer = 0;
  let busy = false;

  const style = document.createElement("style");
  style.setAttribute("data-mmd-safety-location-style", VERSION);
  style.textContent = `
[data-mmd-safety-location-control]{--slc-line:rgba(217,184,108,.18);--slc-line-soft:rgba(255,255,255,.08);--slc-gold:#d9b86c;--slc-gold2:#f0d79a;--slc-text:#f4efe6;--slc-muted:#948c80;--slc-panel:#0d0c0a;--slc-good:#91c986;--slc-warn:#dfa85b;--slc-bad:#d88679;margin-top:12px;border:1px solid var(--slc-line);border-radius:18px;background:linear-gradient(145deg,rgba(217,184,108,.055),rgba(255,255,255,.012)),var(--slc-panel);color:var(--slc-text);overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue","Noto Sans Thai","Noto Sans",Arial,sans-serif}
[data-mmd-safety-location-control] *{box-sizing:border-box}
.mmdslc__head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:18px 18px 15px;border-bottom:1px solid var(--slc-line-soft)}
.mmdslc__k{margin:0;color:var(--slc-gold);font-size:8px;font-weight:800;letter-spacing:.14em}
.mmdslc__head h2{margin:6px 0 0;font-size:20px;line-height:1.2;letter-spacing:-.02em}
.mmdslc__head p{max-width:760px;margin:7px 0 0;color:var(--slc-muted);font-size:9px;line-height:1.55}
.mmdslc__status{display:inline-flex;align-items:center;gap:7px;min-height:28px;padding:0 9px;border:1px solid var(--slc-line-soft);border-radius:999px;color:var(--slc-muted);font-size:7px;white-space:nowrap}
.mmdslc__status i{width:7px;height:7px;border-radius:50%;background:#6d665d}
.mmdslc__status[data-tone="active"]{color:var(--slc-good);border-color:rgba(145,201,134,.25)}.mmdslc__status[data-tone="active"] i{background:var(--slc-good);box-shadow:0 0 10px rgba(145,201,134,.4)}
.mmdslc__status[data-tone="warn"]{color:var(--slc-warn)}.mmdslc__status[data-tone="warn"] i{background:var(--slc-warn)}
.mmdslc__status[data-tone="bad"]{color:var(--slc-bad)}.mmdslc__status[data-tone="bad"] i{background:var(--slc-bad)}
.mmdslc__body{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(300px,.95fr);gap:12px;padding:14px}
.mmdslc__pane{min-width:0;padding:14px;border:1px solid var(--slc-line-soft);border-radius:14px;background:rgba(0,0,0,.14)}
.mmdslc__paneTitle{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px}.mmdslc__paneTitle b{font-size:10px}.mmdslc__paneTitle span{color:var(--slc-muted);font-size:7px}
.mmdslc__field{display:grid;gap:6px;margin-top:10px}.mmdslc__field:first-of-type{margin-top:0}.mmdslc__field label,.mmdslc__field>span{color:var(--slc-muted);font-size:7px;font-weight:700;letter-spacing:.05em}
.mmdslc__field select,.mmdslc__field textarea{width:100%;border:1px solid var(--slc-line-soft);border-radius:10px;background:#090806;color:var(--slc-text);outline:none}.mmdslc__field select{height:42px;padding:0 11px;font-size:9px}.mmdslc__field textarea{min-height:72px;padding:10px 11px;resize:vertical;font:inherit;font-size:9px;line-height:1.5}.mmdslc__field select:focus,.mmdslc__field textarea:focus{border-color:rgba(217,184,108,.45)}
.mmdslc__sessionMeta{margin-top:8px;padding:9px 10px;border:1px solid var(--slc-line-soft);border-radius:10px;color:var(--slc-muted);font-size:8px;line-height:1.5}.mmdslc__sessionMeta b{color:var(--slc-text)}
.mmdslc__durations{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.mmdslc__durations button{height:38px;border:1px solid var(--slc-line-soft);border-radius:10px;background:#090806;color:var(--slc-muted);font-size:8px;font-weight:800;cursor:pointer}.mmdslc__durations button.is-active{border-color:rgba(217,184,108,.42);background:rgba(217,184,108,.09);color:var(--slc-gold2)}
.mmdslc__actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}.mmdslc__btn{min-height:38px;padding:0 12px;border:1px solid var(--slc-line);border-radius:10px;background:transparent;color:var(--slc-gold2);font:inherit;font-size:8px;font-weight:800;cursor:pointer}.mmdslc__btn--primary{border-color:transparent;background:linear-gradient(135deg,#f0d79a,#b68b48);color:#171108}.mmdslc__btn--danger{border-color:rgba(216,134,121,.35);color:#efaaa0}.mmdslc__btn:disabled{opacity:.35;cursor:not-allowed}
.mmdslc__readout{display:grid;gap:8px}.mmdslc__notice{padding:10px;border:1px solid var(--slc-line-soft);border-radius:10px;color:var(--slc-muted);font-size:8px;line-height:1.55}.mmdslc__notice strong{color:var(--slc-text)}
.mmdslc__liveCard{display:none;padding:13px;border:1px solid rgba(145,201,134,.22);border-radius:12px;background:rgba(145,201,134,.035)}.mmdslc__liveCard.is-visible{display:block}.mmdslc__liveTop{display:flex;justify-content:space-between;gap:10px;align-items:center}.mmdslc__liveTop strong{font-size:10px}.mmdslc__countdown{color:var(--slc-gold2);font-size:9px;font-variant-numeric:tabular-nums}.mmdslc__coord{margin-top:12px;padding:12px;border:1px solid var(--slc-line-soft);border-radius:10px;background:#080806}.mmdslc__coord[data-empty="true"]{color:var(--slc-muted)}.mmdslc__coordLabel{color:var(--slc-muted);font-size:7px}.mmdslc__coordValue{display:block;margin-top:5px;font-size:19px;letter-spacing:-.02em;font-variant-numeric:tabular-nums;word-break:break-word}.mmdslc__coordMeta{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:9px}.mmdslc__coordMeta span{padding:7px;border:1px solid var(--slc-line-soft);border-radius:8px;color:var(--slc-muted);font-size:7px;line-height:1.4}.mmdslc__coordMeta b{display:block;margin-top:2px;color:var(--slc-text);font-size:8px}
.mmdslc__error{min-height:18px;margin-top:8px;color:var(--slc-bad);font-size:8px;line-height:1.45}.mmdslc__privacy{padding:10px 14px 13px;color:#756e64;font-size:7px;line-height:1.55;border-top:1px solid var(--slc-line-soft)}
@media(max-width:900px){.mmdslc__body{grid-template-columns:1fr}}
@media(max-width:560px){[data-mmd-safety-location-control]{border-radius:14px}.mmdslc__head{display:grid;padding:14px}.mmdslc__body{padding:10px}.mmdslc__pane{padding:12px}.mmdslc__coordMeta{grid-template-columns:1fr}.mmdslc__actions{display:grid}.mmdslc__btn{width:100%}}
`;
  document.head.appendChild(style);

  const panel = document.createElement("section");
  panel.setAttribute("data-mmd-safety-location-control", VERSION);
  panel.setAttribute("aria-label", "MMD Safety Location Check");
  panel.innerHTML = `
    <div class="mmdslc__head">
      <div>
        <p class="mmdslc__k">SAFETY LOCATION CHECK · INTERNAL ONLY</p>
        <h2>เช็กตำแหน่ง Model ระหว่าง Active Job</h2>
        <p>ใช้เฉพาะเหตุด้านความปลอดภัย/ความถูกต้องของงาน ระบบเป็นแบบชั่วคราว 15/30/60 นาที เก็บเฉพาะพิกัดล่าสุด และทุกการเปิด/อ่าน/หยุดถูก audit</p>
      </div>
      <span class="mmdslc__status" data-slc-status data-tone="idle"><i></i><b>OFF</b></span>
    </div>
    <div class="mmdslc__body">
      <div class="mmdslc__pane">
        <div class="mmdslc__paneTitle"><b>1 · เลือกงานและเหตุผล</b><span>Worker เป็นผู้ตัดสินว่า Active หรือไม่</span></div>
        <div class="mmdslc__field">
          <label for="mmdslc-session">Active Job / Session</label>
          <select id="mmdslc-session" data-slc-session><option value="">กำลังโหลดงาน…</option></select>
          <div class="mmdslc__sessionMeta" data-slc-session-meta>เลือกงานก่อนเปิด Safety Check</div>
        </div>
        <div class="mmdslc__field">
          <label for="mmdslc-reason">เหตุผล</label>
          <select id="mmdslc-reason" data-slc-reason>${REASONS.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select>
        </div>
        <div class="mmdslc__field">
          <span>ระยะเวลา</span>
          <div class="mmdslc__durations" data-slc-durations>${DURATIONS.map((minutes) => `<button type="button" data-minutes="${minutes}" class="${minutes === 15 ? "is-active" : ""}">${minutes} นาที</button>`).join("")}</div>
        </div>
        <div class="mmdslc__field">
          <label for="mmdslc-note">บันทึกเพิ่มเติม (ไม่บังคับ)</label>
          <textarea id="mmdslc-note" data-slc-note maxlength="600" placeholder="เขียนเฉพาะบริบทที่จำเป็นต่อเหตุการณ์"></textarea>
        </div>
        <div class="mmdslc__actions">
          <button class="mmdslc__btn mmdslc__btn--primary" type="button" data-slc-start disabled>เปิด Safety Check</button>
          <button class="mmdslc__btn" type="button" data-slc-reload>โหลดรายการงานใหม่</button>
        </div>
        <div class="mmdslc__error" data-slc-error aria-live="polite"></div>
      </div>
      <div class="mmdslc__pane">
        <div class="mmdslc__paneTitle"><b>2 · พิกัดล่าสุด</b><span>ไม่มี route history</span></div>
        <div class="mmdslc__readout">
          <div class="mmdslc__notice" data-slc-notice><strong>OFF</strong><br>Safety Check ยังไม่ทำงาน</div>
          <div class="mmdslc__liveCard" data-slc-live>
            <div class="mmdslc__liveTop"><strong>Safety Check ACTIVE</strong><span class="mmdslc__countdown" data-slc-countdown>—</span></div>
            <div class="mmdslc__coord" data-slc-coord data-empty="true">ยังไม่ได้รับพิกัดล่าสุดจากอุปกรณ์ของ Model</div>
            <div class="mmdslc__actions">
              <button class="mmdslc__btn" type="button" data-slc-refresh>Refresh latest location</button>
              <button class="mmdslc__btn mmdslc__btn--danger" type="button" data-slc-stop>Stop Safety Check</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="mmdslc__privacy">พิกัดนี้เป็น internal safety data เท่านั้น · ไม่ส่งให้ลูกค้า · ไม่เก็บประวัติเส้นทาง · พิกัดล่าสุดหมดอายุภายใน 180 วินาที · การอนุญาต Location ของอุปกรณ์ Model ยังเป็นข้อบังคับและระบบไม่สามารถ bypass ได้</div>
  `;

  const canonicalToday = root.id === "mmd-os-v1" ? root.querySelector('[data-view="today"]') : null;
  const fallbackMain = root.querySelector(".crx__main");
  if (canonicalToday) canonicalToday.appendChild(panel);
  else if (fallbackMain) {
    const metrics = fallbackMain.querySelector(".crx__metrics");
    if (metrics && metrics.parentNode) metrics.insertAdjacentElement("afterend", panel);
    else fallbackMain.appendChild(panel);
  } else root.appendChild(panel);

  const $ = (selector) => panel.querySelector(selector);
  const sessionSelect = $("[data-slc-session]");
  const reasonSelect = $("[data-slc-reason]");
  const noteInput = $("[data-slc-note]");
  const startButton = $("[data-slc-start]");
  const refreshButton = $("[data-slc-refresh]");
  const stopButton = $("[data-slc-stop]");
  const reloadButton = $("[data-slc-reload]");

  function loginUrl() {
    return LOGIN_PATH + "?next=" + encodeURIComponent(location.pathname + location.search);
  }

  async function api(path, options) {
    const response = await fetch(path, Object.assign({
      credentials: "include",
      headers: { Accept: "application/json" },
    }, options || {}));
    let body = null;
    try { body = await response.json(); } catch (_) { body = null; }
    if (response.status === 401) {
      location.assign(loginUrl());
      throw new Error("admin_session_required");
    }
    if (!response.ok) {
      const error = new Error(body && body.error ? String(body.error) : "request_failed");
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body || {};
  }

  function setError(message) {
    const node = $("[data-slc-error]");
    if (node) node.textContent = message || "";
  }

  function setStatus(label, tone) {
    const node = $("[data-slc-status]");
    if (!node) return;
    node.dataset.tone = tone || "idle";
    const text = node.querySelector("b");
    if (text) text.textContent = label;
  }

  function jobLabel(job) {
    const id = String(job && job.id || "");
    const title = String(job && job.title || id || "Job");
    const when = String(job && (job.when || job.time) || "");
    const status = String(job && job.status || "");
    return [title, when, status].filter(Boolean).join(" · ");
  }

  function renderJobs() {
    const current = selectedSessionId;
    sessionSelect.textContent = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = jobs.length ? "เลือกงาน…" : "ไม่พบรายการงานจากระบบ";
    sessionSelect.appendChild(placeholder);
    jobs.forEach((job) => {
      const option = document.createElement("option");
      option.value = String(job.id || "");
      option.textContent = jobLabel(job);
      sessionSelect.appendChild(option);
    });
    if (current && jobs.some((job) => String(job.id || "") === current)) sessionSelect.value = current;
  }

  async function loadJobs() {
    if (busy) return;
    busy = true;
    setError("");
    reloadButton.disabled = true;
    try {
      const all = [];
      for (let page = 1; page <= MAX_JOB_PAGES; page += 1) {
        const body = await api(JOBS_PATH + "&page=" + page);
        if (Array.isArray(body.jobs)) all.push.apply(all, body.jobs);
        if (!body.pagination || !body.pagination.has_next) break;
      }
      const seen = new Set();
      jobs = all.filter((job) => {
        const id = String(job && job.id || "").trim();
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      renderJobs();
      if (!jobs.length) setError("ยังไม่มีรายการงานที่ระบบส่งมาให้เลือก");
    } catch (error) {
      if (error.message !== "admin_session_required") setError(error.status === 403 ? "บัญชีนี้ไม่มีสิทธิ์เปิด Safety Location Check" : "โหลดรายการงานไม่สำเร็จ");
      jobs = [];
      renderJobs();
    } finally {
      reloadButton.disabled = false;
      busy = false;
    }
  }

  function selectedJob() {
    return jobs.find((job) => String(job.id || "") === selectedSessionId) || null;
  }

  function renderSessionMeta() {
    const node = $("[data-slc-session-meta]");
    if (!node) return;
    const job = selectedJob();
    if (!selectedSessionId || !job) {
      node.textContent = "เลือกงานก่อนเปิด Safety Check";
      return;
    }
    const status = snapshot && snapshot.session_state ? snapshot.session_state : (job.status || "กำลังตรวจ");
    node.textContent = jobLabel(job) + " · Worker state: " + status;
  }

  function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);
  }

  function renderLocation(locationData) {
    const node = $("[data-slc-coord]");
    if (!node) return;
    node.textContent = "";
    if (!locationData || typeof locationData.lat !== "number" || typeof locationData.lng !== "number") {
      node.dataset.empty = "true";
      node.textContent = "ยังไม่ได้รับพิกัดล่าสุดจากอุปกรณ์ของ Model";
      return;
    }
    node.dataset.empty = "false";
    const label = document.createElement("span");
    label.className = "mmdslc__coordLabel";
    label.textContent = "LATEST COORDINATE";
    const value = document.createElement("strong");
    value.className = "mmdslc__coordValue";
    value.textContent = Number(locationData.lat).toFixed(6) + ", " + Number(locationData.lng).toFixed(6);
    const meta = document.createElement("div");
    meta.className = "mmdslc__coordMeta";
    const fields = [
      ["Accuracy", locationData.accuracy_m == null ? "—" : Math.round(Number(locationData.accuracy_m)) + " m"],
      ["Captured", formatDateTime(locationData.captured_at)],
      ["Received", formatDateTime(locationData.received_at)],
    ];
    fields.forEach(([name, text]) => {
      const item = document.createElement("span");
      item.textContent = name;
      const strong = document.createElement("b");
      strong.textContent = text;
      item.appendChild(strong);
      meta.appendChild(item);
    });
    node.append(label, value, meta);
  }

  function stopFirstPointPolling() {
    if (firstPointTimer) window.clearTimeout(firstPointTimer);
    firstPointTimer = 0;
    firstPointPolls = 0;
  }

  function stopCountdown() {
    if (countdownTimer) window.clearInterval(countdownTimer);
    countdownTimer = 0;
  }

  function updateCountdown() {
    const node = $("[data-slc-countdown]");
    const expiresAt = snapshot && snapshot.safety_check && snapshot.safety_check.expires_at;
    if (!node || !expiresAt) return;
    const remaining = Date.parse(expiresAt) - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) {
      node.textContent = "หมดเวลา";
      stopCountdown();
      window.setTimeout(() => refreshSnapshot({ silent: true }), 250);
      return;
    }
    const total = Math.ceil(remaining / 1000);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    node.textContent = minutes + ":" + String(seconds).padStart(2, "0") + " เหลือ";
  }

  function startCountdown() {
    stopCountdown();
    updateCountdown();
    countdownTimer = window.setInterval(updateCountdown, 1000);
  }

  function renderSnapshot() {
    renderSessionMeta();
    const live = $("[data-slc-live]");
    const notice = $("[data-slc-notice]");
    const active = Boolean(snapshot && snapshot.safety_check && snapshot.safety_check.active);
    const activeJob = Boolean(snapshot && snapshot.active_job);

    if (!selectedSessionId) {
      setStatus("OFF", "idle");
      notice.innerHTML = "<strong>OFF</strong><br>เลือกงานเพื่อเช็กสถานะ Safety Location";
      live.classList.remove("is-visible");
      startButton.disabled = true;
      stopFirstPointPolling();
      stopCountdown();
      renderLocation(null);
      return;
    }

    if (!activeJob) {
      setStatus("NOT ACTIVE", "warn");
      notice.innerHTML = "<strong>เปิดไม่ได้</strong><br>Worker ยืนยันว่างานนี้ไม่ได้อยู่ใน Active Job lifecycle";
      live.classList.remove("is-visible");
      startButton.disabled = true;
      stopFirstPointPolling();
      stopCountdown();
      renderLocation(null);
      return;
    }

    if (!active) {
      setStatus("OFF", "idle");
      notice.innerHTML = "<strong>พร้อมเปิด</strong><br>งานนี้ผ่าน Active Job gate แล้ว เลือกเหตุผลและระยะเวลาก่อนเริ่ม";
      live.classList.remove("is-visible");
      startButton.disabled = busy;
      stopFirstPointPolling();
      stopCountdown();
      renderLocation(null);
      return;
    }

    setStatus("ACTIVE", "active");
    notice.innerHTML = "<strong>กำลังทำงาน</strong><br>ระบบรับเฉพาะ latest point จากอุปกรณ์ Model และจะหยุดเองเมื่อหมดเวลา/งานออกจาก Active lifecycle";
    live.classList.add("is-visible");
    startButton.disabled = true;
    renderLocation(snapshot.location || null);
    startCountdown();
  }

  async function refreshSnapshot(options) {
    const opts = options || {};
    if (!selectedSessionId || busy && !opts.allowBusy) return null;
    if (!opts.silent) setError("");
    if (!opts.allowBusy) busy = true;
    refreshButton.disabled = true;
    stopButton.disabled = true;
    try {
      const body = await api(SAFETY_PATH + "?session_id=" + encodeURIComponent(selectedSessionId));
      snapshot = body.data || null;
      renderSnapshot();
      return snapshot;
    } catch (error) {
      if (error.message !== "admin_session_required" && !opts.silent) {
        setError(error.status === 403 ? "บัญชีนี้ไม่มีสิทธิ์ดู Safety Location" : "อ่านสถานะ Safety Location ไม่สำเร็จ");
      }
      if (error.status === 404 || error.status === 409) snapshot = null;
      renderSnapshot();
      return null;
    } finally {
      refreshButton.disabled = false;
      stopButton.disabled = false;
      if (!opts.allowBusy) busy = false;
    }
  }

  function pollForFirstPoint() {
    stopFirstPointPolling();
    if (!snapshot || !snapshot.safety_check || !snapshot.safety_check.active || snapshot.location) return;
    const tick = async () => {
      if (!selectedSessionId || firstPointPolls >= FIRST_POINT_MAX_POLLS) {
        stopFirstPointPolling();
        return;
      }
      firstPointPolls += 1;
      const data = await refreshSnapshot({ silent: true });
      if (!data || !data.safety_check || !data.safety_check.active || data.location) {
        stopFirstPointPolling();
        return;
      }
      firstPointTimer = window.setTimeout(tick, FIRST_POINT_POLL_MS);
    };
    firstPointTimer = window.setTimeout(tick, FIRST_POINT_POLL_MS);
  }

  async function startSafetyCheck() {
    if (!selectedSessionId || busy) return;
    busy = true;
    setError("");
    startButton.disabled = true;
    try {
      const payload = {
        session_id: selectedSessionId,
        reason_code: String(reasonSelect.value || ""),
        duration_minutes: selectedDuration,
      };
      const note = String(noteInput.value || "").trim();
      if (note) payload.note = note.slice(0, 600);
      const body = await api(SAFETY_PATH, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      snapshot = body.data || null;
      noteInput.value = "";
      renderSnapshot();
      pollForFirstPoint();
    } catch (error) {
      if (error.message !== "admin_session_required") {
        const messages = {
          active_job_required: "งานนี้ออกจาก Active Job แล้ว จึงเปิด Safety Check ไม่ได้",
          safety_location_check_already_active: "Safety Check ของงานนี้เปิดอยู่แล้ว กำลังโหลดสถานะล่าสุด",
          safety_reason_code_invalid: "เหตุผลไม่ผ่าน policy ของ Worker",
          safety_duration_invalid: "ระยะเวลาต้องเป็น 15, 30 หรือ 60 นาที",
          owner_admin_required: "บัญชีนี้ไม่มีสิทธิ์เปิด Safety Check",
        };
        setError(messages[error.message] || "เปิด Safety Check ไม่สำเร็จ");
        if (error.message === "safety_location_check_already_active") {
          busy = false;
          await refreshSnapshot();
          return;
        }
      }
    } finally {
      busy = false;
      renderSnapshot();
    }
  }

  async function stopSafetyCheck() {
    if (!selectedSessionId || busy) return;
    busy = true;
    setError("");
    stopButton.disabled = true;
    stopFirstPointPolling();
    try {
      const payload = {
        session_id: selectedSessionId,
        action: "stop",
        reason_code: "manual_stop",
      };
      const checkId = snapshot && snapshot.safety_check && snapshot.safety_check.check_id;
      if (checkId) payload.check_id = checkId;
      const body = await api(SAFETY_PATH, {
        method: "DELETE",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      snapshot = body.data || null;
      renderSnapshot();
    } catch (error) {
      if (error.message !== "admin_session_required") setError(error.message === "safety_check_id_mismatch" ? "Safety Check เปลี่ยนไปจากหน้าจอนี้ กรุณา Refresh ก่อน Stop" : "Stop Safety Check ไม่สำเร็จ");
    } finally {
      busy = false;
      stopButton.disabled = false;
      renderSnapshot();
    }
  }

  sessionSelect.addEventListener("change", async () => {
    stopFirstPointPolling();
    stopCountdown();
    selectedSessionId = String(sessionSelect.value || "").trim();
    snapshot = null;
    setError("");
    renderSnapshot();
    if (selectedSessionId) await refreshSnapshot();
  });

  $("[data-slc-durations]").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-minutes]");
    if (!button) return;
    const minutes = Number(button.dataset.minutes);
    if (!DURATIONS.includes(minutes)) return;
    selectedDuration = minutes;
    panel.querySelectorAll("button[data-minutes]").forEach((node) => node.classList.toggle("is-active", node === button));
  });

  startButton.addEventListener("click", startSafetyCheck);
  refreshButton.addEventListener("click", () => refreshSnapshot());
  stopButton.addEventListener("click", stopSafetyCheck);
  reloadButton.addEventListener("click", loadJobs);

  window.addEventListener("focus", () => {
    if (selectedSessionId && snapshot && snapshot.safety_check && snapshot.safety_check.active) refreshSnapshot({ silent: true });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && selectedSessionId && snapshot && snapshot.safety_check && snapshot.safety_check.active) refreshSnapshot({ silent: true });
  });

  renderSnapshot();
  loadJobs();
})();
