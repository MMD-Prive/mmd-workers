export interface InternalPageEnv {
  ADMIN_WORKER_BASE_URL?: string;
  PUBLIC_WEB_BASE_URL?: string;
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function page(title: string, body: string): Response {
  return new Response(`<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
<meta name="robots" content="noindex,nofollow" />
<title>${esc(title)}</title>
<style>
:root{color-scheme:dark;--bg:#050403;--panel:#12100d;--soft:rgba(255,255,255,.055);--line:rgba(214,170,69,.24);--line2:rgba(255,255,255,.12);--text:#fff8e8;--muted:rgba(255,248,232,.66);--gold:#d6aa45;--gold2:#ffe08b;--red:#ff8d8d;--green:#8ed5a9;--font:Inter,"Noto Sans Thai",ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 16% 0%,rgba(214,170,69,.14),transparent 30%),linear-gradient(135deg,#050403,#0b0907 56%,#000);color:var(--text);font-family:var(--font);-webkit-font-smoothing:antialiased}a{color:inherit;text-decoration:none}button,input,select,textarea{font:inherit}.mmdop{min-height:100vh;padding:18px}.mmdop__shell{width:min(1480px,100%);margin:0 auto}.mmdop__topbar,.mmdop__panel,.mmdop__clientSearch,.mmdop__commandLeft,.mmdop__railCard,.mmdop__status{border:1px solid var(--line);border-radius:26px;background:linear-gradient(145deg,rgba(18,15,11,.92),rgba(0,0,0,.78));box-shadow:0 22px 64px rgba(0,0,0,.42)}.mmdop__topbar{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px}.mmdop__brand{display:flex;gap:12px;align-items:center}.mmdop__logo{width:48px;height:48px;border-radius:17px;display:grid;place-items:center;border:1px solid rgba(214,170,69,.35);background:rgba(214,170,69,.08)}.mmdop__logo img{width:38px}.mmdop__brand strong,.mmdop__kicker,.mmdop__panelHead span,.mmdop__step,.mmdop__field span,.mmdop__railCard span{color:var(--gold);letter-spacing:.13em;text-transform:uppercase;font-size:11px;font-weight:950}.mmdop__brand small{display:block;color:var(--muted);margin-top:2px}.mmdop__ghost,.mmdop__btn{min-height:42px;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:0 14px;border-radius:999px;border:1px solid var(--line2);background:rgba(255,255,255,.045);color:var(--text);font-weight:900;cursor:pointer}.mmdop__btn--gold{border-color:rgba(255,224,139,.58);background:linear-gradient(135deg,#ffe48b,#c99937 58%,#f8d876);color:#0b0703}.mmdop__btn--soft{border-color:rgba(214,170,69,.32);color:var(--gold2);background:rgba(214,170,69,.08)}.mmdop__btn:disabled{opacity:.42;cursor:not-allowed}.mmdop__command{display:grid;grid-template-columns:minmax(0,1fr) minmax(360px,.72fr);gap:16px;margin-top:16px}.mmdop__commandLeft,.mmdop__clientSearch{padding:clamp(22px,3vw,34px)}h1{margin:14px 0 0;font-size:clamp(42px,5.2vw,76px);line-height:.92;letter-spacing:-.055em}h2{margin:6px 0 6px;font-size:clamp(26px,2.6vw,38px);line-height:1;letter-spacing:-.035em}p{color:var(--muted);line-height:1.68}.mmdop__flowMini,.mmdop__progress,.mmdop__summary,.mmdop__layout,.mmdop__formGrid,.mmdop__searchBar,.mmdop__copyRow{display:grid;gap:12px}.mmdop__flowMini{grid-template-columns:repeat(6,1fr);margin-top:22px}.mmdop__step,.mmdop__summary article{border:1px solid var(--line2);border-radius:16px;background:rgba(255,255,255,.035);padding:12px}.mmdop__step.is-active{color:#090704;background:linear-gradient(135deg,#ffe48b,#c99937);border-color:rgba(255,224,139,.58)}.mmdop__summary{grid-template-columns:repeat(5,1fr);margin-top:14px}.mmdop__summary strong{display:block;margin-top:7px;font-size:18px;word-break:break-word}.mmdop__layout{grid-template-columns:minmax(0,1fr) 320px;margin-top:16px;align-items:start}.mmdop__main,.mmdop__rail{display:grid;gap:14px}.mmdop__rail{position:sticky;top:16px}.mmdop__railCard{padding:18px}.mmdop__railCard strong{display:block;margin-top:8px;font-size:24px;line-height:1.08;letter-spacing:-.03em}.mmdop__panel{overflow:hidden}.mmdop__panelHead{display:flex;justify-content:space-between;gap:14px;padding:20px 22px;border-bottom:1px solid var(--line2)}.mmdop__section{padding:20px 22px}.mmdop__formGrid--2{grid-template-columns:repeat(2,1fr)}.mmdop__formGrid--3{grid-template-columns:repeat(3,1fr)}.mmdop__formGrid--4{grid-template-columns:repeat(4,1fr)}.mmdop__searchBar{grid-template-columns:1fr auto auto}.mmdop__input,.mmdop__textarea{width:100%;min-height:49px;border-radius:15px;border:1px solid var(--line2);background:rgba(0,0,0,.42);color:var(--text);padding:0 14px;outline:none}.mmdop__input--big{min-height:56px;font-size:16px}.mmdop__textarea{min-height:116px;padding:13px 14px;resize:vertical;line-height:1.6}.mmdop__field span{display:block;margin-bottom:7px}.mmdop__empty{min-height:92px;display:grid;place-items:center;text-align:center;border:1px dashed var(--line2);border-radius:18px;color:var(--muted);background:rgba(255,255,255,.025);padding:14px}.mmdop__clientResults{display:grid;gap:10px;margin-top:14px}.mmdop__clientCard{width:100%;display:grid;grid-template-columns:52px 1fr auto;gap:12px;align-items:center;padding:14px;border-radius:20px;border:1px solid var(--line2);background:rgba(0,0,0,.36);color:inherit;text-align:left;cursor:pointer}.mmdop__clientCard.is-selected{border-color:rgba(255,224,139,.58);background:rgba(214,170,69,.09)}.mmdop__avatar{width:52px;height:52px;border-radius:17px;display:grid;place-items:center;color:var(--gold2);border:1px solid rgba(214,170,69,.25);background:rgba(214,170,69,.08);font-weight:950}.mmdop__tag{display:inline-flex;margin:3px 5px 0 0;border-radius:999px;border:1px solid var(--line2);padding:3px 8px;color:var(--muted);font-size:11px;font-weight:850}.mmdop__copyRow{grid-template-columns:repeat(3,max-content);display:flex;gap:10px;flex-wrap:wrap}.mmdop__status{padding:15px 17px}.is-ok{border-color:rgba(142,213,169,.34)!important;color:rgba(224,255,236,.95)!important;background:rgba(142,213,169,.075)!important}.is-bad{border-color:rgba(255,141,141,.34)!important;color:rgba(255,222,222,.96)!important;background:rgba(255,141,141,.075)!important}.mmdop__secondary{border-color:rgba(255,255,255,.1);opacity:.96}.mmdop__secondary .mmdop__panelHead span{color:rgba(255,224,139,.72)}@media(max-width:1040px){.mmdop__command,.mmdop__layout{grid-template-columns:1fr}.mmdop__rail{position:static;grid-template-columns:repeat(2,1fr)}.mmdop__summary{grid-template-columns:repeat(2,1fr)}.mmdop__flowMini{grid-template-columns:repeat(3,1fr)}}@media(max-width:720px){.mmdop{padding:12px}.mmdop__topbar,.mmdop__panelHead{flex-direction:column;align-items:flex-start}.mmdop__searchBar,.mmdop__formGrid--2,.mmdop__formGrid--3,.mmdop__formGrid--4,.mmdop__rail{grid-template-columns:1fr}.mmdop__clientCard{grid-template-columns:52px 1fr}.mmdop__clientCard .mmdop__btn{grid-column:1/-1}.mmdop__btn,.mmdop__ghost{width:100%}}
</style>
</head>
<body>${body}</body>
</html>`, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function topbar(title: string): string {
  return `<header class="mmdop__topbar"><div class="mmdop__brand"><div class="mmdop__logo"><img src="https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/68f881dc4d79c18ac98c4140_MMD%20PRIVE%20Logo.png" alt="MMD"></div><div><strong>${esc(title)}</strong><small>Boss Per operator surface</small></div></div><a class="mmdop__ghost" href="/internal/admin/control-room">Control Room</a></header>`;
}

const createSessionConfig = `window.MMD_CREATE_SESSION_CONFIG={adminBase:"",mock:new URLSearchParams(location.search).has("mock"),debug:new URLSearchParams(location.search).has("debug"),endpoints:{authMe:"/v1/admin/auth/me",ping:"/v1/admin/ping",clientLookup:"/v1/admin/clients/lineage-lookup",recentClients:"/v1/admin/clients/recent",modelSearch:"/v1/admin/models/search",saveDraft:"/v1/admin/job/draft",createSession:"/v1/admin/create-session",pushLine:"/v1/admin/line/push"}};`;

export function renderCreateSessionPage(_env: InternalPageEnv): Response {
  return page("MMD SIGIL Create Session", `<section class="mmdop" data-mmd-create-session-pro data-admin-base=""><main class="mmdop__shell">
    ${topbar("Create Session / Client Lineage")}
    <section class="mmdop__command">
      <div class="mmdop__commandLeft"><div class="mmdop__kicker">Operator Surface · Worker-rendered</div><h1>Find client. Verify lineage. Create session.</h1><p>ค้นลูกค้าจาก package / member / LINE lineage ก่อน แล้วค่อยเลือก Public หรือ Private, เลือกแฟ้ม Model, ตรวจ Telegram Gate และให้ backend คืนลิงก์พร้อม <code>?t=</code></p><div class="mmdop__flowMini"><div class="mmdop__step is-active">01 Client</div><div class="mmdop__step">02 Work</div><div class="mmdop__step">03 Model</div><div class="mmdop__step">04 Gate</div><div class="mmdop__step">05 Create</div><div class="mmdop__step">06 Output</div></div></div>
      <aside class="mmdop__clientSearch"><div><span>First Action</span><h2>Client Lineage Search</h2><p>ค้นจากชื่อเล่น / username / เบอร์ / LINE / package / legacy tag</p></div><div class="mmdop__searchBar"><input class="mmdop__input mmdop__input--big" type="text" placeholder="เช่น รัช VIP, line_user_id, premium" data-op-client-query /><button class="mmdop__btn mmdop__btn--gold" type="button" data-op-search-client>Search</button><button class="mmdop__btn" type="button" data-op-load-recent>Recent</button></div></aside>
    </section>
    <section class="mmdop__panel" style="margin-top:16px;"><div class="mmdop__panelHead"><div><span>Step 01</span><h2>เลือกลูกค้าจาก lineage</h2><p>หน้านี้ยังใช้ create-session.js เดิมสำหรับ compatibility</p></div></div><div class="mmdop__section"><div class="mmdop__empty">ค้นหาลูกค้าก่อนสร้าง session</div></div></section>
  </main><script>${createSessionConfig}</script><script src="/a/create-session.js"></script></section>`);
}

export function renderCreateJobPage(): Response {
  return page("MMD Create Job", `<section class="mmdop" data-cj-flow="customer-first"><main class="mmdop__shell">
    ${topbar("Create Job · Customer First")}
    <section class="mmdop__command">
      <div class="mmdop__commandLeft">
        <div class="mmdop__kicker">Owner Workspace · Canonical route</div>
        <h1>Create Job.</h1>
        <p><code>/internal/admin/jobs/create-job</code> ต้องเริ่มจากลูกค้าก่อน ไม่เริ่มจาก Model หรือ Job Board</p>
        <div class="mmdop__flowMini" aria-label="Create Job flow">
          <div class="mmdop__step is-active" data-cj-step="customer">01 Customer</div>
          <div class="mmdop__step" data-cj-step="scope">02 Scope</div>
          <div class="mmdop__step" data-cj-step="model">03 Model</div>
          <div class="mmdop__step" data-cj-step="details">04 Details</div>
          <div class="mmdop__step" data-cj-step="payment">05 Payment</div>
          <div class="mmdop__step" data-cj-step="output">06 Output</div>
        </div>
      </div>
      <aside class="mmdop__clientSearch" id="client-search" data-cj-primary-flow="customer-search">
        <div><span>First Action</span><h2>Customer Search</h2><p>ค้นจาก Per name, LINE, เบอร์, username, package, tier หรือ note ย้อนหลัง</p></div>
        <div class="mmdop__searchBar"><input class="mmdop__input mmdop__input--big" id="job-client-query" placeholder="เช่น Shane, Book EI, line user id, เบอร์, VIP" autocomplete="off" /><button class="mmdop__btn mmdop__btn--gold" id="search-client-button" type="button">ค้นลูกค้า</button><button class="mmdop__btn" id="load-recent-clients" type="button">Recent</button></div>
      </aside>
    </section>

    <section class="mmdop__summary" aria-label="Create Job summary">
      <article><span>Customer</span><strong id="summary-client">ยังไม่เลือก</strong></article>
      <article><span>Scope</span><strong id="summary-scope">Public</strong></article>
      <article><span>Model</span><strong id="summary-model">รอเลือก</strong></article>
      <article><span>Payment</span><strong id="summary-payment">0 THB</strong></article>
      <article><span>Output</span><strong>Payment URL first</strong></article>
    </section>

    <section class="mmdop__layout">
      <div class="mmdop__main">
        <section class="mmdop__panel" id="client-results" data-cj-step-panel="customer">
          <div class="mmdop__panelHead"><div><span>Step 01</span><h2>เลือกลูกค้าก่อนสร้างงาน</h2><p>ถ้าไม่เจอลูกค้า ให้ค้นด้วยชื่อที่ Per ใช้, LINE OFC, เบอร์, package หรือ note ก่อน ไม่ต้องจำ Session ID เอง</p></div><button class="mmdop__btn" id="clear-client" type="button">Clear</button></div>
          <div class="mmdop__section"><div class="mmdop__clientResults" id="client-result-list"><div class="mmdop__empty">ค้นหาลูกค้าก่อนสร้างงาน — หน้านี้ไม่เริ่มจาก Model แล้วค่ะ</div></div></div>
        </section>

        <section class="mmdop__panel" id="selected-client-panel" data-cj-step-panel="lineage">
          <div class="mmdop__panelHead"><div><span>Step 02</span><h2>Customer lineage</h2><p>ข้อมูลลูกค้าที่เลือกจะถูกส่งไปกับ create job payload เพื่อให้ backend resolve ต่อแบบ fail-closed</p></div></div>
          <div class="mmdop__section">
            <div class="mmdop__formGrid mmdop__formGrid--3">
              <label class="mmdop__field"><span>Client ID</span><input class="mmdop__input" id="job-client-id" readonly placeholder="เลือกจากผลค้นหา" /></label>
              <label class="mmdop__field"><span>Client / Per Name</span><input class="mmdop__input" id="job-client-name" placeholder="ชื่อลูกค้า" /></label>
              <label class="mmdop__field"><span>Session ID · optional</span><input class="mmdop__input" id="job-session-id" placeholder="ถ้ามี session เดิม ระบบจะเติมให้" /></label>
            </div>
          </div>
        </section>

        <section class="mmdop__panel" data-cj-step-panel="scope-model-details">
          <div class="mmdop__panelHead"><div><span>Steps 03-05</span><h2>สร้างงานแบบไม่งง</h2><p>เลือก scope → ใส่โมเดล → วันเวลา/พื้นที่ → ราคา แล้วค่อย Create Job</p></div></div>
          <div class="mmdop__section">
            <div class="mmdop__formGrid mmdop__formGrid--4">
              <label class="mmdop__field"><span>Public / Private</span><select class="mmdop__input" id="job-visibility"><option value="public">Public Work</option><option value="private">Private Work</option></select></label>
              <label class="mmdop__field"><span>Model Lookup Key</span><input class="mmdop__input" id="job-model-key" placeholder="JASPER / EMs01 / rec..." /></label>
              <label class="mmdop__field"><span>Job Date</span><input class="mmdop__input" id="job-date" type="date" /></label>
              <label class="mmdop__field"><span>Start Time</span><input class="mmdop__input" id="job-start" type="time" /></label>
              <label class="mmdop__field"><span>Duration</span><input class="mmdop__input" id="job-duration" placeholder="3 ชั่วโมง / overnight" /></label>
              <label class="mmdop__field"><span>Area / Province</span><input class="mmdop__input" id="job-location" placeholder="สุขุมวิท / กรุงเทพฯ" /></label>
              <label class="mmdop__field"><span>Amount THB</span><input class="mmdop__input" id="amount_thb" name="amount_thb" type="number" min="1" step="1" required placeholder="10000" /></label>
              <label class="mmdop__field"><span>Payment mode</span><select class="mmdop__input" id="job-payment-mode"><option value="full">เต็มจำนวน</option><option value="deposit">มัดจำ</option><option value="final">ส่วนที่เหลือ</option></select></label>
            </div>
            <label class="mmdop__field" style="display:block;margin-top:12px;"><span>Internal Note</span><textarea class="mmdop__textarea" id="job-note" placeholder="รายละเอียด operation ภายใน / ข้อควรระวัง / brief"></textarea></label>
            <div class="mmdop__copyRow" style="margin-top:16px;"><button class="mmdop__btn mmdop__btn--gold" id="create-job-button" type="button">Create Job</button><a class="mmdop__btn" href="/internal/admin/jobs/create-session">Open full lineage workspace</a></div>
            <div class="mmdop__status" id="create-job-status" style="margin-top:16px;">Ready · เริ่มจากค้นลูกค้า</div>
          </div>
        </section>

        <section class="mmdop__panel mmdop__secondary" id="job-board-panel" data-cj-secondary-flow="model-job-board">
          <div class="mmdop__panelHead"><div><span>Optional</span><h2>Model Job Board / ลงกระดานงาน</h2><p>ใช้เฉพาะเมื่อยังไม่เลือกโมเดล · เป็น flow รองหลังจากรู้ customer/scope แล้ว</p></div></div>
          <div class="mmdop__section">
            <label class="mmdop__field" style="display:flex;align-items:center;gap:10px;"><input id="job-board-enabled" type="checkbox" style="width:20px;min-height:20px;" /><span>เปิดรับ Model / ลงกระดานงาน</span></label>
            <label class="mmdop__field" style="display:block;margin-top:12px;"><span>รายละเอียดลงกระดาน · <b id="job-board-count">0 / 1000</b></span><textarea id="job-board-text" maxlength="1000" class="mmdop__textarea" placeholder="อธิบายงาน วันเวลา พื้นที่ สิ่งที่ต้องทำ และข้อมูล public-safe ที่ Model ควรรู้ก่อนกดสนใจ"></textarea></label>
            <div class="mmdop__formGrid mmdop__formGrid--2" style="margin-top:12px;"><label class="mmdop__field"><span>เพศลูกค้า · สำหรับ Private cover</span><select class="mmdop__input" id="job-customer-gender"><option value="unspecified">ไม่ระบุ</option><option value="male">ชาย</option><option value="female">หญิง</option><option value="couple">คู่ ชาย-หญิง</option><option value="mixed">หลายเพศ</option></select></label><label class="mmdop__field"><span>Budget บน Private cover</span><select class="mmdop__input" id="job-budget-disclosure"><option value="hidden">BUDGET · PRIVATE</option><option value="show">แสดงงบที่กรอกไว้</option></select></label></div>
            <p style="margin:12px 0 0;color:var(--muted);font-size:13px;line-height:1.55;">เพศลูกค้าใช้ structured field นี้เท่านั้น · ไม่เดาจากชื่อ รสนิยม รูป หรือ Model preference</p>
            <div class="mmdop__copyRow" style="margin-top:16px;"><button class="mmdop__btn mmdop__btn--soft" id="publish-job-board" type="button">ลงกระดานงาน</button><button class="mmdop__btn" id="copy-job-board-link" type="button" disabled>Copy Broadcast Link</button></div>
            <div class="mmdop__status" id="job-board-status" style="margin-top:16px;">ยังไม่ได้ publish · Broadcast Link จะออกเป็น LIFF Login V2 เท่านั้น</div>
          </div>
        </section>
      </div>
      <aside class="mmdop__rail"><div class="mmdop__railCard"><span>Next Action</span><strong id="next-action">Find Customer</strong><p id="next-copy">ค้นลูกค้าก่อน แล้วระบบจะค่อยไป scope/model/details</p></div><div class="mmdop__railCard"><span>Rule</span><strong>Payment first</strong><p>หลัง Create Job ส่งได้เฉพาะ Customer Payment URL ก่อน Official Verify</p></div></aside>
    </section>
  </main>
  <script>
  (() => {
    const $ = (id) => document.getElementById(id);
    const clientQuery = $("job-client-query");
    const resultList = $("client-result-list");
    const searchClientButton = $("search-client-button");
    const recentClientButton = $("load-recent-clients");
    const clearClientButton = $("clear-client");
    const status = $("create-job-status");
    const createButton = $("create-job-button");
    const boardEnabled = $("job-board-enabled");
    const boardText = $("job-board-text");
    const boardCount = $("job-board-count");
    const boardStatus = $("job-board-status");
    const publishButton = $("publish-job-board");
    const copyButton = $("copy-job-board-link");
    let selectedClient = null;
    let broadcastLink = "";

    function text(value) { return String(value || "").trim(); }
    function setStatus(node, message, bad) { node.textContent = message; node.classList.remove("is-ok", "is-bad"); node.classList.add(bad ? "is-bad" : "is-ok"); }
    function amount() { const value = Number($("amount_thb")?.value || ""); return Number.isFinite(value) && value > 0 ? value : 0; }
    function escapeHtml(value) { return String(value || "").replace(/[&<>\"']/g, function(c) { return {"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;","'":"&#39;"}[c] || c; }); }
    function first(value) { return String(value || "?").trim().slice(0, 1).toUpperCase() || "?"; }
    function pickRows(data) { return data.clients || data.results || data.records || data.items || data.rows || []; }
    function clientName(row) { return text(row.per_name || row.client_name || row.name || row.display_name || row.nickname || row.line_display_name || row.username || row.id || row.record_id); }
    function clientId(row) { return text(row.client_id || row.record_id || row.id || row.airtable_id || row.line_record_id); }
    function clientSession(row) { return text(row.session_id || row.latest_session_id || row.last_session_id); }
    function clientMeta(row) { return [row.package, row.tier, row.membership_status, row.line_display_name, row.username].filter(Boolean).map(text).join(" · "); }

    function selectClient(row) {
      selectedClient = row || null;
      const name = selectedClient ? clientName(selectedClient) : "";
      $("job-client-id").value = selectedClient ? clientId(selectedClient) : "";
      $("job-client-name").value = name;
      const session = selectedClient ? clientSession(selectedClient) : "";
      if (session) $("job-session-id").value = session;
      $("summary-client").textContent = name || "ยังไม่เลือก";
      $("next-action").textContent = name ? "Fill job details" : "Find Customer";
      $("next-copy").textContent = name ? "ใส่ scope/model/details ต่อได้เลย" : "ค้นลูกค้าก่อน แล้วระบบจะค่อยไป scope/model/details";
      renderClientRows(resultList.__rows || []);
    }

    function renderClientRows(rows) {
      resultList.__rows = rows;
      if (!rows.length) { resultList.innerHTML = '<div class="mmdop__empty">ยังไม่เจอลูกค้า ลองค้นด้วย Per name, LINE, เบอร์ หรือ package</div>'; return; }
      resultList.innerHTML = rows.map(function(row, index) {
        const id = clientId(row);
        const name = clientName(row);
        const meta = clientMeta(row) || "LINE / package evidence pending";
        const selected = selectedClient && clientId(selectedClient) === id;
        const tag = text(row.match_type || row.source || row.status || "candidate");
        return '<button type="button" class="mmdop__clientCard '+(selected ? 'is-selected' : '')+'" data-client-index="'+index+'"><div class="mmdop__avatar">'+escapeHtml(first(name))+'</div><div><strong>'+escapeHtml(name || id || 'Unnamed client')+'</strong><p>'+escapeHtml(meta)+'</p><span class="mmdop__tag">'+escapeHtml(tag)+'</span></div><b class="mmdop__btn mmdop__btn--soft">เลือก</b></button>';
      }).join("");
      resultList.querySelectorAll("[data-client-index]").forEach(function(button) { button.addEventListener("click", function() { selectClient(rows[Number(button.dataset.clientIndex)]); }); });
    }

    async function loadClients(kind) {
      const q = text(clientQuery.value);
      if (kind !== "recent" && !q) { setStatus(status, "พิมพ์ชื่อลูกค้า / LINE / เบอร์ / package ก่อนค้นหา", true); return; }
      resultList.innerHTML = '<div class="mmdop__empty">กำลังค้นลูกค้า...</div>';
      setStatus(status, kind === "recent" ? "กำลังโหลดลูกค้าล่าสุด..." : "กำลังค้นลูกค้า...", false);
      try {
        const path = kind === "recent" ? "/v1/admin/clients/recent" : "/v1/admin/clients/lineage-lookup?q=" + encodeURIComponent(q);
        const res = await fetch(path, { credentials: "include", headers: { accept: "application/json" } });
        const data = await res.json().catch(function() { return {}; });
        if (!res.ok || data.ok === false) throw new Error(data.error || "client_lookup_failed");
        const rows = pickRows(data);
        renderClientRows(rows);
        setStatus(status, rows.length ? "เจอลูกค้า " + rows.length + " รายการ · เลือก 1 คนเพื่อสร้างงาน" : "ไม่เจอลูกค้าในผลค้นหา", rows.length === 0);
      } catch (error) {
        resultList.innerHTML = '<div class="mmdop__empty">ค้นลูกค้าไม่สำเร็จ · '+escapeHtml(error && error.message || 'backend unavailable')+'</div>';
        setStatus(status, "ค้นลูกค้าไม่สำเร็จ · " + String(error && error.message || "backend unavailable"), true);
      }
    }

    function refreshBoardState() { boardCount.textContent = String(boardText.value.length) + " / 1000"; publishButton.disabled = !boardEnabled.checked || !boardText.value.trim(); }
    function refreshSummary() { $("summary-scope").textContent = $("job-visibility").value === "private" ? "Private" : "Public"; $("summary-model").textContent = text($("job-model-key").value) || "รอเลือก"; $("summary-payment").textContent = amount().toLocaleString("en-US") + " THB"; }

    searchClientButton.addEventListener("click", function() { loadClients("search"); });
    recentClientButton.addEventListener("click", function() { loadClients("recent"); });
    clientQuery.addEventListener("keydown", function(event) { if (event.key === "Enter") loadClients("search"); });
    clearClientButton.addEventListener("click", function() { selectedClient = null; $("job-client-id").value = ""; $("job-client-name").value = ""; $("job-session-id").value = ""; $("summary-client").textContent = "ยังไม่เลือก"; renderClientRows(resultList.__rows || []); setStatus(status, "ล้างลูกค้าแล้ว · ค้นหาใหม่ได้เลย", false); });
    ["job-visibility", "job-model-key", "amount_thb"].forEach(function(id) { $(id).addEventListener("input", refreshSummary); $(id).addEventListener("change", refreshSummary); });
    boardEnabled.addEventListener("change", refreshBoardState);
    boardText.addEventListener("input", refreshBoardState);
    refreshBoardState();
    refreshSummary();

    createButton?.addEventListener("click", async () => {
      const payload = {
        client_id: $("job-client-id")?.value || "",
        client_name: $("job-client-name")?.value || "",
        client_lookup_key: clientQuery?.value || "",
        session_id: $("job-session-id")?.value || "",
        amount_thb: amount(),
        job_visibility: $("job-visibility")?.value || "public",
        job_date: $("job-date")?.value || "",
        start_time: $("job-start")?.value || "",
        duration: $("job-duration")?.value || "",
        location_name: $("job-location")?.value || "",
        model_lookup_key: $("job-model-key")?.value || "",
        payment_mode: $("job-payment-mode")?.value || "full",
        note: $("job-note")?.value || "",
        source: "worker_rendered_create_job_customer_first"
      };
      if (!payload.client_id && !payload.session_id && !payload.client_name) return setStatus(status, "กรุณาค้นหาและเลือกลูกค้าก่อนสร้างงาน", true);
      if (!payload.amount_thb) return setStatus(status, "กรุณาใส่ Amount THB มากกว่า 0", true);
      createButton.disabled = true;
      setStatus(status, "Creating job...", false);
      try {
        const res = await fetch("/v1/admin/create-job", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) throw new Error(typeof data.error === "string" ? data.error : data.error?.message || "create_job_failed");
        setStatus(status, "Job created · ส่ง Customer Payment URL ก่อน: " + (data.job_id || data.session_id || data.id || "OK"), false);
      } catch (error) {
        setStatus(status, "ยัง create job ไม่สำเร็จ · " + String(error?.message || "backend unavailable"), true);
      } finally {
        createButton.disabled = false;
      }
    });

    publishButton?.addEventListener("click", async () => {
      if (!boardEnabled.checked || !boardText.value.trim()) return;
      const visibility = $("job-visibility")?.value || "public";
      const budget = amount();
      const payload = { board_text: boardText.value.trim(), world: visibility, job_date: $("job-date")?.value || "", start_time: $("job-start")?.value || "", duration: $("job-duration")?.value || "", area: $("job-location")?.value || "", compensation: budget ? budget.toLocaleString("en-US") + " บาท" : "", customer_gender: $("job-customer-gender")?.value || "unspecified", budget_disclosure_approved: visibility === "private" && $("job-budget-disclosure")?.value === "show", owner_note: $("job-note")?.value || "" };
      publishButton.disabled = true;
      copyButton.disabled = true;
      broadcastLink = "";
      setStatus(boardStatus, "กำลัง publish งานเข้ากระดาน...", false);
      try {
        const res = await fetch("/v1/admin/job-board/publish", { method: "POST", credentials: "include", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(payload) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok !== true || !data.broadcast_url) throw new Error(data.error || "job_board_publish_failed");
        broadcastLink = String(data.broadcast_url);
        if (!broadcastLink.startsWith("https://www.mmdbkk.com/sigil/model/login?")) throw new Error("broadcast_link_contract_failed");
        copyButton.disabled = false;
        setStatus(boardStatus, "Published · " + String(data.job_id || "") + " · พร้อม Copy LIFF Login V2 link", false);
      } catch (error) {
        setStatus(boardStatus, "ยังลงกระดานไม่สำเร็จ · " + String(error?.message || "backend unavailable"), true);
      } finally {
        refreshBoardState();
      }
    });

    copyButton?.addEventListener("click", async () => { if (!broadcastLink) return; try { await navigator.clipboard.writeText(broadcastLink); setStatus(boardStatus, "คัดลอก Broadcast Link แล้ว · Model จะเข้า LIFF Login V2 ก่อน", false); } catch { setStatus(boardStatus, "คัดลอกลิงก์ไม่สำเร็จ", true); } });
  })();
  </script></section>`);
}
