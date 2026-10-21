const PREFIX = "/male-massage/therapists";
const PAGES = new Set([`${PREFIX}/login`, `${PREFIX}/me`, `${PREFIX}/app`]);

export async function maybeHandleTherapistWorkspace(request, env = {}) {
  // A single behavior contract remains in mms-worker when presentation changes.
  if (env.MMS_THERAPIST_UI_SOURCE !== "native") return null;
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "");
  // LINE first opens the registered LIFF endpoint, sometimes without query parameters.
  const liffEndpoint = path === PREFIX;
  if (!PAGES.has(path) && !liffEndpoint) return null;
  if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405, headers: { allow: "GET, HEAD" } });
  const login = liffEndpoint || path === `${PREFIX}/login`;
  const headers = new Headers({
    "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store",
    "x-mmd-route-owner": "member-dashboard-chat-worker", "x-mmd-ui-source": "mms-native-workspace-v1",
    "x-mmd-behavior-owner": "mms-worker", "x-robots-tag": "noindex, nofollow, noarchive",
    "referrer-policy": "no-referrer", "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; script-src 'unsafe-inline' https://static.line-scdn.net; style-src 'unsafe-inline'; connect-src 'self' https://*.line.me https://*.line-scdn.net; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  });
  let status = 200;
  if (path === `${PREFIX}/app`) {
    if (!env.MMS_WORKER?.fetch) status = 503;
    else {
      try {
        const url = new URL(request.url); url.pathname = `${PREFIX}/api/app/access`; url.search = "";
        const gate = await env.MMS_WORKER.fetch(new Request(url, { headers: { cookie: request.headers.get("cookie") || "", accept: "application/json" } }));
        if (gate.status === 401) { headers.set("location", new URL(`${PREFIX}/login`, request.url).href); return new Response(null, { status: 302, headers }); }
        const body = await gate.json().catch(() => null);
        status = gate.status === 403 || (gate.ok && body?.data?.can_open === false) ? 403 : gate.ok && body?.ok === true && body?.data?.access === "approved" && body?.data?.can_open === true ? 200 : 503;
      } catch (_) { status = 503; }
    }
  }
  return new Response(request.method === "HEAD" ? null : renderTherapistWorkspace(login), { status, headers });
}

export function renderTherapistWorkspace(login = false) {
  // Wrangler may retain __name calls inside therapistClient.toString(); the inline script needs its own helper.
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>MY THERAPIST · MMS</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f4f5ef;color:#20392b;font:16px/1.6 system-ui,-apple-system,sans-serif}main{max-width:760px;margin:auto;padding:20px 18px calc(28px + env(safe-area-inset-bottom))}header{display:flex;align-items:center;justify-content:space-between;gap:16px}h1{font-size:25px;margin:6px 0}h2{font-size:20px;margin:0 0 12px}h3{font-size:17px;margin:0}p{margin:8px 0}.muted{color:#5c6d60;font-size:14px}.card{background:#fff;border:1px solid #dce2d6;border-radius:18px;padding:18px;margin:14px 0}.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}button,.button{border:0;border-radius:12px;min-height:48px;padding:10px 16px;font:inherit;cursor:pointer;background:#24563c;color:#fff;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}button.alt,.button.alt{background:#e9eee4;color:#24563c}button:disabled{opacity:.5;cursor:wait}input,textarea,select{width:100%;font:inherit;border:1px solid #c8d3c4;border-radius:10px;padding:10px;margin:4px 0 12px;background:white;color:#20392b}label{display:block;font-size:14px}nav{display:flex;gap:8px;margin:20px 0;overflow:auto}nav button{white-space:nowrap;background:#e9eee4;color:#24563c}nav button[aria-selected=true]{background:#24563c;color:white}#notice{min-height:26px}#notice.error{color:#8f2f20}.badge{font-size:13px;padding:4px 10px;border-radius:30px;background:#e9eee4}a{color:#24563c}img{width:100px;height:120px;object-fit:cover;border-radius:10px}section[hidden],[hidden]{display:none!important}.course{border-top:1px solid #ddd;padding-top:12px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}#detail{white-space:normal}.address{white-space:pre-line}#coverage-zones{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0 14px}.zone-choice{display:flex;align-items:center;gap:8px;padding:10px;border:1px solid #dce2d6;border-radius:10px;background:#fbfcf9}.zone-choice input{width:20px;height:20px;margin:0;flex:none}.area-note{padding:12px;border-radius:12px;background:#f1f5eb}@media(max-width:480px){#coverage-zones{grid-template-columns:1fr}}button:focus-visible,a:focus-visible{outline:3px solid #ad8544;outline-offset:3px}@media(max-width:480px){main{padding:16px 14px 28px}.grid{grid-template-columns:1fr}}
  </style></head><body><main data-mms-shell="native-workspace-v1" data-login="${login}"><header><div><div class="muted">MMS · MALE MASSAGE</div><h1>MY THERAPIST</h1></div><a href="https://lin.ee/NkfXMu7">ติดต่อพี่เปอร์</a></header><p id="notice" role="status" aria-live="polite">กำลังตรวจสอบบัญชีครับ</p>
  <button id="retry" class="alt" type="button">ลองตรวจอีกครั้ง</button><section id="entry" class="card" hidden><h2>เข้าพื้นที่ Therapist</h2><p>ใช้ LINE ที่เชื่อมกับโปรไฟล์ MMS ของคุณครับ</p><button id="line-login" type="button">ยืนยันผ่าน LINE</button><p><a href="https://liff.line.me/2011425652-YqK1F6y8">เปิดใน LINE Mini App ↗</a></p><p class="muted">หากยังไม่ได้เชื่อมบัญชี ให้ใช้ลิงก์เปิดสิทธิ์จากพี่เปอร์</p></section>
  <div id="workspace" hidden><section class="card"><h2 id="greeting"></h2><p id="readiness"></p><label>สถานะรับงาน<select id="availability"><option value="Available">Online · รับงานที่ตรงพื้นที่</option><option value="Unavailable">Offline · งดรับงาน</option><option value="Paused">พักรับงานชั่วคราว</option></select></label><p class="muted">เมื่อ Online คุณจะเห็นงานที่ตรงกับเขตบริการและคอร์สที่ยืนยันแล้ว เลือกดูรายละเอียดก่อนตอบรับได้ครับ</p><button id="save-availability">บันทึกสถานะ</button><button class="alt" id="refresh">รีเฟรช</button></section>
  <nav aria-label="พื้นที่ทำงาน"><button data-tab="offers" aria-selected="true">งานเสนอให้คุณ</button><button data-tab="jobs" aria-selected="false">งานของฉัน</button><button data-tab="profile" aria-selected="false">โปรไฟล์และคอร์ส</button></nav>
  <section id="offers"><div id="offer-list"></div></section><section id="jobs" hidden><div id="job-list"></div></section>
  <section id="profile" hidden><form id="profile-form" class="card"><h2>โปรไฟล์ของคุณ</h2><label>ชื่อที่แสดง<input id="display-name" required maxlength="120"></label><label>แนะนำตัว<textarea id="intro" maxlength="600"></textarea></label><div class="area-note"><h3>เขตที่สะดวกรับงาน</h3><p class="muted">เลือกพื้นที่หลักและพื้นที่ที่รับงานได้ ไม่ต้องระบุที่อยู่บ้านหรือเปิด GPS ครับ</p><label>เขตหลัก<select id="base-zone"><option value="">ยังไม่เลือกเขตหลัก</option></select></label><div id="coverage-zones" aria-label="เขตที่รับงานได้"></div><p id="zone-status" class="muted" role="status">กำลังโหลดเขตบริการครับ</p></div><label>การแสดงโปรไฟล์<select id="visibility"><option value="hidden">เก็บไว้ส่วนตัว</option><option value="public">แสดงโปรไฟล์</option></select></label><h3>คอร์สบริการ</h3><p class="muted">ราคาคอร์สยังไม่รวมค่าเดินทาง ยอดงานจริงต้องได้รับการสรุปก่อนครับ</p><div id="courses"></div><button type="button" class="alt" id="add-course">เพิ่มคอร์ส</button><button type="submit">บันทึกโปรไฟล์</button></form><section class="card"><h2>รูปโปรไฟล์</h2><p class="muted">เลือกได้ไม่เกิน 6 รูปสำหรับแสดงในโปรไฟล์ เก็บรูปทั้งหมดได้ไม่เกิน 12 รูป</p><div id="photos" class="row"></div><label>เพิ่มรูป JPEG / PNG / WebP ไม่เกิน 10 MB<input id="upload" type="file" accept="image/jpeg,image/png,image/webp"></label><button id="save-photos">บันทึกรูปที่แสดง</button></section></section>
  <section id="detail" class="card" hidden></section><div class="row"><button id="logout" class="alt">ออกจากบัญชี</button></div></div></main>
  ${login ? '<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>' : ''}<script>const __name = (target, value) => Object.defineProperty(target, "name", { value, configurable: true });(${therapistClient.toString()})();</script></body></html>`;
}

export function therapistClient() {
  const P = "/male-massage/therapists";
  const A = P + "/api/app";
  const $ = (id) => document.getElementById(id);
  let access = null, profile = null, tab = "offers", refreshing = false;
  const actionKeys = new Map();
  const messages = {
    LIFF_UNAVAILABLE: "ยังเปิด LINE Login ไม่ได้ครับ ลองเปิดผ่าน LINE Mini App ด้านล่าง",
    LIFF_INIT_TIMEOUT: "LINE ยังไม่ตอบกลับครับ ลองเปิดผ่าน LINE Mini App ด้านล่าง",
    THERAPIST_SESSION_REQUIRED: "กรุณายืนยันผ่าน LINE อีกครั้งครับ",
    THERAPIST_SESSION_INVALID: "บัญชีหมดเวลาแล้ว กรุณายืนยันผ่าน LINE อีกครั้งครับ",
    THERAPIST_LINK_REQUIRED: "LINE นี้ยังไม่เชื่อมกับ Therapist ครับ ใช้ลิงก์เปิดสิทธิ์จากพี่เปอร์ก่อน",
    THERAPIST_ACCESS_DENIED: "บัญชี Therapist ยังไม่พร้อมใช้งานครับ ติดต่อพี่เปอร์เพื่อตรวจสถานะ",
    MY_MMS_ACCESS_REQUIRED: "กำลังรออนุมัติสิทธิ์แอปจากพี่เปอร์ครับ",
    EXPIRED: "งานหมดเวลารับแล้วครับ", TAKEN: "งานนี้มีคนรับแล้วครับ",
    INVALID_JOB_TRANSITION: "สถานะงานเปลี่ยนไปแล้วครับ กดรีเฟรชเพื่อตรวจอีกครั้ง",
  };
  function notice(text, error = false) { $("notice").textContent = text; $("notice").className = error ? "error" : ""; }
  function node(tag, text, className) { const el = document.createElement(tag); if (text != null) el.textContent = text; if (className) el.className = className; return el; }
  function button(text, callback, alt = false) { const el = node("button", text, alt ? "alt" : ""); el.type = "button"; el.addEventListener("click", () => busy(el, callback)); return el; }
  async function busy(el, fn) { if (el.disabled) return; el.disabled = true; try { await fn(); } catch (e) { notice(messages[e.code] || "ยังทำรายการไม่สำเร็จครับ ลองอีกครั้งได้ ข้อมูลเดิมยังอยู่", true); } finally { el.disabled = false; } }
  async function api(path, options = {}) {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...options, signal: controller.signal });
      if (response.status === 204) return null;
      const body = await response.json();
      if (!response.ok || body.ok !== true) {
        const e = new Error(body?.error?.code || "UNAVAILABLE"); e.code = body?.error?.code; e.status = response.status;
        if (response.status === 401) { $("workspace").hidden = true; $("entry").hidden = false; $("line-login").onclick = () => location.assign(P + "/login"); }
        throw e;
      }
      return body.data;
    } finally { clearTimeout(timer); }
  }
  const json = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  function setAccess(data) {
    access = data;
    $("greeting").textContent = data.display_name || "Therapist";
    $("availability").value = data.availability_status || "Unavailable";
    $("save-availability").disabled = data.can_open !== true;
    $("readiness").textContent = !data.can_open ? "กำลังรออนุมัติสิทธิ์แอปจากพี่เปอร์ครับ" : !data.matching_enabled ? "เข้าแอปได้แล้ว · พี่เปอร์ยังไม่ได้เปิดการจับคู่งานให้บัญชีนี้" : !data.verified_skills?.length ? "เข้าแอปได้แล้ว · รอยืนยันคอร์สที่รับงานได้" : data.availability_status !== "Available" ? "คุณอยู่สถานะ Offline · เปลี่ยนเป็น Online เมื่อพร้อมรับงานครับ" : "คุณ Online · งานที่ตรงเขตและคอร์สจะแสดงให้ตรวจดูก่อนตอบรับครับ";
  }
  async function refresh() {
    if (refreshing) return; refreshing = true;
    try {
      setAccess(await api(A + "/access"));
      $("entry").hidden = true; $("workspace").hidden = false;
      await loadTab(); notice("ข้อมูลล่าสุดพร้อมแล้วครับ");
    } finally { refreshing = false; }
  }
  async function loadTab() {
    $("detail").hidden = true;
    if (tab === "profile") { await loadProfile(); return; }
    const list = $(tab === "offers" ? "offer-list" : "job-list"); list.replaceChildren();
    if (!access?.can_open) { list.append(node("p", "เปิดดูงานได้หลังพี่เปอร์อนุมัติสิทธิ์แอปครับ")); return; }
    const data = await api(A + "/" + tab);
    if (!Array.isArray(data)) throw new Error("INVALID_DATA");
    if (!data.length) { list.append(node("p", tab === "offers" ? "ยังไม่มีงานเสนอให้คุณครับ" : "ยังไม่มีงานที่คุณรับครับ", "card")); return; }
    for (const item of data) {
      const card = node("article", null, "card"); card.append(node("h3", item.serviceLabel), node("p", [item.scheduledLabel, item.durationLabel, item.areaLabel].filter(Boolean).join(" · ")), node("p", stateLabel(item.state), "badge"), node("p", item.payoutLabel ? "ส่วนแบ่งของคุณ: " + item.payoutLabel : "ส่วนแบ่ง: รอพี่เปอร์สรุป"));
      card.append(button("ดูรายละเอียด", () => detail(item.jobId, tab))); list.append(card);
    }
  }
  function stateLabel(state) { return ({ OFFERED: "รอตอบรับ", ACCEPTED: "รับงานแล้ว", IN_PROGRESS: "กำลังให้บริการ", COMPLETED: "จบงานแล้ว", CANCELLED: "ยกเลิกแล้ว", EXPIRED: "หมดเวลารับ", TAKEN: "มีคนรับแล้ว", DECLINED: "ปฏิเสธแล้ว" })[state] || "กำลังตรวจสอบ"; }
  async function detail(id, lane) {
    if (!/^mmsjob_[a-f0-9]{24}$/.test(id)) throw new Error("INVALID_JOB_ID");
    const item = await api(A + "/" + lane + "/" + id);
    const panel = $("detail"); panel.replaceChildren(); panel.hidden = false;
    panel.append(node("h2", item.serviceLabel), node("p", stateLabel(item.state)), node("p", [item.scheduledLabel, item.durationLabel, item.areaLabel].filter(Boolean).join(" · ")));
    if (item.pricing) {
      const q = item.pricing;
      const money = (v) => Number(v).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
      panel.append(node("p", "ค่าคอร์ส " + money(q.course_amount_thb) + " + ค่าเดินทาง " + money(q.travel_amount_thb) + " = ยอดเต็ม " + money(q.full_amount_thb) + " บาท"), node("p", "MMS 30%: " + money(q.mms_share_thb) + " · ส่วนของคุณ 70%: " + money(q.therapist_share_thb) + " บาท"), node("p", "ยอดส่วนแบ่งตามงาน ยังไม่ใช่การยืนยันว่าจ่ายแล้วครับ", "muted"));
    }
    for (const [label, value] of [["ส่วนแบ่งของคุณ", item.payoutLabel || "รอพี่เปอร์สรุป"], ["การเดินทาง", item.travelLabel], ["หมายเหตุ", item.noteLabel || item.payoutNote]]) if (value) panel.append(node("p", label + ": " + value, "address"));
    if (item.disclosure?.locationUnlocked) {
      panel.append(node("p", item.disclosure.addressLabel, "address"));
      for (const value of [item.disclosure.customerDisplayLabel, item.disclosure.contactLabel]) if (value) panel.append(node("p", value));
      const map = item.disclosure.mapUrl; if (map && /^https:\/\//.test(map)) { const link = node("a", "เปิดแผนที่"); link.href = map; link.target = "_blank"; link.rel = "noreferrer noopener"; panel.append(link); }
    }
    if (lane === "offers" && item.state === "OFFERED") {
      const expiry = Date.parse(item.expiresAt);
      const inTime = Number.isFinite(expiry) && expiry > Date.now();
      const canAccept = inTime && Boolean(item.payoutLabel);
      panel.append(node("p", !inTime ? "งานหมดเวลารับ หรือยังตรวจเวลาไม่ได้ครับ" : !item.payoutLabel ? "รอพี่เปอร์สรุปส่วนแบ่งก่อนตอบรับครับ" : "ตอบรับก่อน " + new Date(expiry).toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok" })));
      const accept = button("รับงานนี้", () => act(id, "accept", "offers", "ACCEPTED")); accept.disabled = !canAccept; panel.append(accept);
      const decline = button("ไม่สะดวก", () => act(id, "decline", "offers", "DECLINED"), true); decline.disabled = !inTime; panel.append(decline);
    }
    if (lane === "jobs" && item.state === "ACCEPTED") panel.append(button("เริ่มให้บริการ", () => act(id, "start", "jobs", "IN_PROGRESS")));
    if (lane === "jobs" && item.state === "IN_PROGRESS") panel.append(button("ยืนยันจบงาน", async () => { if (window.confirm("ให้บริการเสร็จแล้ว ยืนยันจบงานนี้ครับ?")) await act(id, "complete", "jobs", "COMPLETED"); }));
    if (item.state === "COMPLETED") panel.append(node("p", "จบงานแล้ว · สถานะการจ่ายส่วนแบ่งยังต้องตรวจจาก MMS ครับ", "muted"));
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function act(id, action, lane, expected) {
    const key = id + ":" + action;
    if (!actionKeys.has(key)) actionKeys.set(key, crypto.randomUUID());
    const data = await api(A + "/" + lane + "/" + id + "/" + action, json("POST", { requestKey: actionKeys.get(key) }));
    if (data.state !== expected) { const e = new Error("STATE_CHANGED"); e.code = "INVALID_JOB_TRANSITION"; throw e; }
    actionKeys.delete(key); await refresh(); notice(stateLabel(data.state) + "ครับ");
  }
  function courseRow(course = {}) {
    const row = node("div", null, "course");
    for (const [field, label, type, value] of [["name", "ชื่อคอร์ส", "text", course.name || ""], ["duration_minutes", "ระยะเวลา (นาที)", "number", course.duration_minutes || 60], ["price_thb", "ราคาคอร์ส (บาท)", "number", course.price_thb ?? 0]]) {
      const title = node("label", label); const input = node("input"); input.type = type; input.dataset.field = field; input.value = value; input.required = true;
      if (field === "duration_minutes") { input.min = 30; input.max = 360; input.step = 30; } if (field === "price_thb") { input.min = 0; input.max = 99999; input.step = 1; } if (field === "name") input.maxLength = 80;
      title.append(input); row.append(title);
    }
    row.append(button("ลบคอร์ส", () => row.remove(), true)); $("courses").append(row);
  }
  async function loadServiceZones() {
    const base = $("base-zone"); const coverage = $("coverage-zones"); const status = $("zone-status");
    base.replaceChildren(node("option", "ยังไม่เลือกเขตหลัก")); base.children[0].value = "";
    coverage.replaceChildren(); base.dataset.ready = "false";
    try {
      const catalog = await api(A + "/service-zones");
      const zones = Array.isArray(catalog.zones) ? catalog.zones : [];
      if (!zones.length) throw new Error("SERVICE_ZONE_CATALOG_EMPTY");
      for (const zone of zones) {
        const option = node("option", zone.label_th + (zone.province_label_th ? " · " + zone.province_label_th : ""));
        option.value = zone.code; base.append(option);
        const label = node("label", null, "zone-choice"); const check = node("input"); check.type = "checkbox"; check.dataset.serviceZone = zone.code;
        label.append(check, node("span", zone.label_th + (zone.province_label_th ? " · " + zone.province_label_th : ""))); coverage.append(label);
      }
      const saved = profile?.service_zones || {};
      base.value = saved.base_service_zone_code || "";
      const selected = new Set(saved.coverage_service_zone_codes || []);
      for (const label of coverage.children) {
        const check = label.children[0]; check.checked = selected.has(check.dataset.serviceZone);
      }
      base.dataset.ready = "true";
      status.textContent = "เลือกได้สูงสุด 30 เขต · ระบบเสนอเฉพาะงานในเขตที่เลือกครับ";
    } catch (_) {
      status.textContent = "ตอนนี้โหลดรายชื่อเขตไม่ได้ โปรไฟล์ส่วนอื่นยังบันทึกได้ครับ";
    }
  }
  async function loadProfile() {
    profile = await api(P + "/api/auth/profile");
    $("display-name").value = profile.display_name || ""; $("intro").value = profile.intro || ""; $("visibility").value = profile.profile_visibility || "hidden";
    await loadServiceZones();
    $("courses").replaceChildren(); for (const course of profile.courses || []) courseRow(course);
    $("photos").replaceChildren(); for (const photo of profile.photos || []) {
      const wrap = node("label"); const image = node("img"); image.alt = photo.file_name || "รูปโปรไฟล์"; image.src = photo.preview_url;
      const check = node("input"); check.type = "checkbox"; check.dataset.photo = photo.id; check.checked = photo.selected_public === true;
      wrap.append(image, check, node("span", "แสดงรูปนี้"), button("ลบรูป", async () => { if (window.confirm("ลบรูปนี้ครับ?")) { await api(P + "/api/auth/profile/photos/" + photo.id, { method: "DELETE" }); await loadProfile(); } }, true)); $("photos").append(wrap);
    }
  }
  for (const el of document.querySelectorAll("[data-tab]")) el.onclick = () => busy(el, async () => {
    tab = el.dataset.tab; for (const name of ["offers", "jobs", "profile"]) $(name).hidden = name !== tab;
    for (const other of document.querySelectorAll("[data-tab]")) other.setAttribute("aria-selected", String(other === el)); await loadTab();
  });
  $("save-availability").onclick = () => busy($("save-availability"), async () => { setAccess(await api(A + "/availability", json("PUT", { availability_status: $("availability").value }))); notice("บันทึกสถานะรับงานแล้วครับ"); });
  $("refresh").onclick = () => busy($("refresh"), refresh);
  $("retry").onclick = () => busy($("retry"), async () => { if (document.querySelector("main").dataset.login === "true") await login(); else await refresh(); });
  $("add-course").onclick = () => { if ($("courses").children.length < 8) courseRow(); else notice("เพิ่มคอร์สได้ไม่เกิน 8 คอร์สครับ", true); };
  $("profile-form").onsubmit = (event) => { event.preventDefault(); const submit = $("profile-form").querySelector('[type="submit"]'); busy(submit, async () => {
    const courses = Array.from($("courses").children).map((row) => Object.fromEntries(Array.from(row.querySelectorAll("[data-field]")).map((input) => [input.dataset.field, input.type === "number" ? Number(input.value) : input.value])));
    const payload = { display_name: $("display-name").value, intro: $("intro").value, profile_visibility: $("visibility").value, courses };
    if ($("base-zone").dataset.ready === "true") {
      const base = $("base-zone").value;
      const selected = Array.from($("coverage-zones").querySelectorAll("[data-service-zone]")).filter((check) => check.checked).map((check) => check.dataset.serviceZone);
      if (base && !selected.includes(base)) selected.push(base);
      if ((base && !selected.length) || (!base && selected.length)) { notice("เลือกเขตหลักและเขตที่รับงานให้สอดคล้องกันครับ", true); return; }
      payload.base_service_zone_code = base;
      payload.coverage_service_zone_codes = selected;
    }
    await api(P + "/api/auth/profile", json("PUT", payload)); await loadProfile(); notice("บันทึกโปรไฟล์และเขตบริการแล้วครับ");
  }); };
  $("upload").onchange = () => busy($("upload"), async () => {
    const file = $("upload").files?.[0]; if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) { notice("เลือก JPEG / PNG / WebP ไม่เกิน 10 MB ครับ", true); return; }
    await api(P + "/api/auth/profile/photos", { method: "POST", headers: { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name) }, body: file }); $("upload").value = ""; await loadProfile(); notice("เพิ่มรูปแล้วครับ");
  });
  $("save-photos").onclick = () => busy($("save-photos"), async () => {
    const ids = Array.from(document.querySelectorAll("[data-photo]")).filter((el) => el.checked).map((el) => el.dataset.photo);
    if (ids.length > 6) { notice("เลือกรูปแสดงได้ไม่เกิน 6 รูปครับ", true); return; }
    await api(P + "/api/auth/profile/photos/public", json("PUT", { photo_ids: ids })); await loadProfile(); notice("บันทึกรูปที่แสดงแล้วครับ");
  });
  $("logout").onclick = () => busy($("logout"), async () => { await api(P + "/api/auth/logout", { method: "POST" }); location.assign(P + "/login"); });
  $("line-login").onclick = () => location.assign(P + "/login");
  async function login() {
    $("entry").hidden = false;
    const storageKey = "mms-therapist-invite-v1";
    const recoveryKey = "mms-therapist-line-recovery-v1";
    const url = new URL(location.href);
    const hash = new URLSearchParams(url.hash.slice(1));
    const nested = url.searchParams.get("liff.state") || url.searchParams.get("liff_state") || "";
    const primary = url.pathname.replace(/\/$/, "") === P || ["code", "liff.state", "liff_state"].some(key => url.searchParams.has(key));
    const state = new URL(nested || P + "/login", url.origin);
    let invite = url.searchParams.get("invite") || hash.get("invite") || state.searchParams.get("invite") || new URLSearchParams(state.hash.slice(1)).get("invite") || "";
    const storage = {
      get(key) { try { return window.sessionStorage.getItem(key); } catch (_) { return null; } },
      set(key, value) { try { window.sessionStorage.setItem(key, value); } catch (_) {} },
      remove(key) { try { window.sessionStorage.removeItem(key); } catch (_) {} },
    };
    if (invite) storage.set(storageKey, JSON.stringify({ token: invite, until: Date.now() + 30 * 60 * 1000 }));
    else {
      try { const saved = JSON.parse(storage.get(storageKey)); if (saved?.until > Date.now()) invite = saved.token || ""; else storage.remove(storageKey); } catch (_) { storage.remove(storageKey); }
    }
    if (!invite && !primary) { try { await api(P + "/api/auth/me"); location.replace(P + "/app"); return; } catch (_) {} }
    // Keep the invitation in the redirect too if browser storage is unavailable.
    const redirect = new URL(P + "/login", url.origin);
    if (invite) redirect.hash = new URLSearchParams({ invite }).toString();
    function recoverLine() {
      if (storage.get(recoveryKey) || url.searchParams.get("line_recovery") === "1") { notice("LINE ยังยืนยันบัญชีไม่ได้ครับ ติดต่อพี่เปอร์เพื่อตรวจ LINE Login", true); return; }
      storage.set(recoveryKey, "1");
      redirect.searchParams.set("line_recovery", "1");
      window.liff.logout();
      window.liff.login({ redirectUri: redirect.href });
    }
    notice("ยืนยันผ่าน LINE เพื่อเข้าพื้นที่ Therapist ครับ");
    async function authenticate() {
      if (!window.liff) { const e = new Error("LIFF_UNAVAILABLE"); e.code = "LIFF_UNAVAILABLE"; throw e; }
      let timeout;
      try {
        await Promise.race([
          window.liff.init({ liffId: "2011425652-YqK1F6y8" }),
          new Promise((_, reject) => { timeout = setTimeout(() => { const e = new Error("LIFF_INIT_TIMEOUT"); e.code = "LIFF_INIT_TIMEOUT"; reject(e); }, 12000); }),
        ]);
      } finally { clearTimeout(timeout); }
      if (!window.liff.isLoggedIn()) { notice("กำลังเปิด LINE เพื่อยืนยันบัญชีครับ"); window.liff.login({ redirectUri: redirect.href }); return; }
      const token = window.liff.getIDToken();
      if (!token) { recoverLine(); return; }
      try {
        await api(P + "/api/auth/line", json("POST", { id_token: token, ...(invite ? { invite_token: invite } : {}) }));
      } catch (e) {
        // api() normally changes this handler on 401; preserve the auth retry.
        $("line-login").onclick = () => busy($("line-login"), authenticate);
        if (e.code === "LINE_ID_TOKEN_INVALID") { recoverLine(); return; }
        throw e;
      }
      storage.remove(storageKey); storage.remove(recoveryKey);
      history.replaceState(null, "", P + "/login"); location.replace(P + "/app");
    }
    $("line-login").onclick = () => busy($("line-login"), authenticate);
    await busy($("line-login"), authenticate);
  }
  if (document.querySelector("main").dataset.login === "true") login().catch(() => notice("กรุณาลองยืนยันผ่าน LINE อีกครั้งครับ", true));
  else refresh().catch((e) => { notice(messages[e.code] || "ยังตรวจสอบบัญชีไม่ได้ครับ กดรีเฟรชหรือติดต่อพี่เปอร์", true); if (e.status === 403) { $("entry").hidden = false; } });
}

