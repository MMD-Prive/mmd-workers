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
:root{color-scheme:dark;--bg:#070604;--panel:#14110d;--panel2:#1e1a13;--line:rgba(216,170,74,.28);--line2:rgba(255,255,255,.12);--text:#fff8e8;--muted:rgba(255,248,232,.68);--gold:#d8ad55;--gold2:#ffe19a;--bad:#ffb0a5;--good:#a7e0b8;--font:Inter,"Noto Sans Thai",ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 12% -8%,rgba(216,170,74,.16),transparent 33%),linear-gradient(145deg,#050403,#0b0906 58%,#000);color:var(--text);font-family:var(--font);-webkit-font-smoothing:antialiased}a{color:inherit;text-decoration:none}button,input,select,textarea{font:inherit}.mmdop{min-height:100vh;padding:14px}.mmdop__shell{width:min(1040px,100%);margin:0 auto}.mmdop__topbar,.card,.status,.results button,.linkRow{border:1px solid var(--line);background:linear-gradient(145deg,rgba(20,17,13,.94),rgba(0,0,0,.75));box-shadow:0 16px 44px rgba(0,0,0,.32)}.mmdop__topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:20px}.mmdop__brand{display:flex;align-items:center;gap:10px}.mmdop__logo{width:42px;height:42px;border:1px solid rgba(216,170,74,.4);border-radius:14px;display:grid;place-items:center;background:rgba(216,170,74,.08)}.mmdop__logo img{width:32px}.mmdop__brand strong{display:block;font-size:14px;letter-spacing:.04em}.mmdop__brand small{display:block;margin-top:2px;color:var(--muted);font-size:11px}.mmdop__ghost,.btn{min-height:42px;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:0 14px;border:1px solid var(--line2);border-radius:999px;background:rgba(255,255,255,.05);color:var(--text);font-weight:900;cursor:pointer}.btn.gold{border-color:rgba(255,225,154,.62);background:linear-gradient(135deg,#ffe49d,#c99b3f);color:#120d05}.btn.soft{color:var(--gold2);background:rgba(216,170,74,.08)}.btn:disabled{opacity:.46;cursor:not-allowed}.hero{margin-top:12px;padding:20px;border:1px solid var(--line);border-radius:24px;background:linear-gradient(145deg,rgba(23,19,14,.96),rgba(0,0,0,.76))}.kicker,.label,.step{color:var(--gold);font-size:11px;font-weight:950;letter-spacing:.13em;text-transform:uppercase}.hero h1{margin:8px 0 6px;font-size:clamp(36px,7vw,64px);line-height:.96;letter-spacing:-.05em}.hero p,.card p,.status,.hint{color:var(--muted);line-height:1.58}.steps{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:16px}.step{padding:9px;border:1px solid var(--line2);border-radius:13px;background:rgba(255,255,255,.035);text-align:center}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}.card{border-radius:22px;padding:16px}.card h2{margin:4px 0 10px;font-size:25px;line-height:1.05;letter-spacing:-.035em}.searchbar{display:grid;grid-template-columns:1fr auto auto;gap:8px}.field{display:grid;gap:7px}.field span{color:var(--gold);font-size:11px;font-weight:950;letter-spacing:.1em;text-transform:uppercase}.input,.textarea,select{width:100%;min-height:46px;border:1px solid var(--line2);border-radius:14px;background:rgba(0,0,0,.42);color:var(--text);padding:0 12px;outline:none}.textarea{min-height:96px;padding:12px;resize:vertical;line-height:1.55}.form{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.form .wide{grid-column:1/-1}.results{display:grid;gap:9px;margin-top:10px}.results button{width:100%;display:grid;grid-template-columns:42px 1fr auto;gap:10px;align-items:center;padding:11px;border-radius:16px;color:inherit;text-align:left}.results button.selected{border-color:rgba(255,225,154,.68);background:rgba(216,170,74,.12)}.avatar{width:42px;height:42px;border:1px solid rgba(216,170,74,.34);border-radius:13px;display:grid;place-items:center;color:var(--gold2);font-weight:950;background:rgba(216,170,74,.08)}.results strong{display:block}.results p{margin:3px 0 0;color:var(--muted);font-size:13px;line-height:1.4}.tag{display:inline-flex;margin:4px 5px 0 0;padding:3px 8px;border:1px solid var(--line2);border-radius:999px;color:var(--muted);font-size:11px;font-weight:800}.status{margin-top:12px;padding:12px 14px;border-radius:18px}.status.good{border-color:rgba(167,224,184,.45);color:#e9fff0;background:rgba(96,180,118,.08)}.status.bad{border-color:rgba(255,176,165,.5);color:#ffe8e4;background:rgba(210,83,66,.1)}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}.summary div{border:1px solid var(--line2);border-radius:16px;padding:10px;background:rgba(255,255,255,.035)}.summary b{display:block;margin-top:5px;word-break:break-word}.links{display:grid;gap:8px;margin-top:10px}.linkRow{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:10px 12px;border-radius:16px}.linkRow span{color:var(--muted);font-size:12px}.linkRow a{display:block;margin-top:3px;color:var(--gold2);word-break:break-all;font-size:13px}.hidden{display:none!important}@media(max-width:760px){.mmdop{padding:8px}.mmdop__topbar{position:sticky;top:0;z-index:3;background:rgba(8,6,4,.94);backdrop-filter:blur(14px)}.hero{padding:15px;border-radius:19px}.hero h1{font-size:38px}.steps,.grid,.summary,.form,.searchbar{grid-template-columns:1fr}.card{padding:14px;border-radius:18px}.results button{grid-template-columns:38px 1fr}.results button .btn{grid-column:1/-1}.btn,.mmdop__ghost{width:100%}.linkRow{grid-template-columns:1fr}.mmdop__brand small{display:none}}
</style>
</head>
<body>${body}</body>
</html>`, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function topbar(title: string): string {
  return `<header class="mmdop__topbar"><div class="mmdop__brand"><div class="mmdop__logo"><img src="https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/68f881dc4d79c18ac98c4140_MMD%20PRIVE%20Logo.png" alt="MMD"></div><div><strong>${esc(title)}</strong><small>Boss Per operator surface</small></div></div><a class="mmdop__ghost" href="/internal/admin/control-room">Control Room</a></header>`;
}

const createSessionConfig = `window.MMD_CREATE_SESSION_CONFIG={adminBase:"",mock:new URLSearchParams(location.search).has("mock"),debug:new URLSearchParams(location.search).has("debug"),endpoints:{authMe:"/v1/admin/auth/me",ping:"/v1/admin/ping",clientLookup:"/v1/admin/clients/lineage-lookup",recentClients:"/v1/admin/clients/recent",modelSearch:"/v1/admin/models/search",saveDraft:"/v1/admin/job/draft",createSession:"/v1/admin/create-session",pushLine:"/v1/admin/line/push"}};`;

export function renderCreateSessionPage(_env: InternalPageEnv): Response {
  return page("MMD SIGIL Create Session", `<section class="mmdop" data-mmd-create-session-pro data-admin-base=""><main class="mmdop__shell">
    ${topbar("Create Session / Client Lineage")}
    <section class="hero"><div class="kicker">Compatibility surface</div><h1>Create Session</h1><p>ค้นลูกค้าจาก package / member / LINE lineage ก่อน แล้วค่อยสร้าง session เดิมผ่าน create-session.js</p><div class="searchbar" style="margin-top:12px"><input class="input" type="text" placeholder="ชื่อ / LINE / เบอร์ / package" data-op-client-query><button class="btn gold" type="button" data-op-search-client>Search</button><button class="btn" type="button" data-op-load-recent>Recent</button></div></section>
    <section class="card" style="margin-top:12px"><h2>เลือกลูกค้าจาก lineage</h2><p>หน้านี้ใช้ create-session.js เดิมสำหรับ compatibility</p><div class="status">ค้นหาลูกค้าก่อนสร้าง session</div></section>
  </main><script>${createSessionConfig}</script><script src="/a/create-session.js"></script></section>`);
}

const createJobScript = `(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const clientQuery = $("job-client-query");
  const modelQuery = $("job-model-query");
  const clientResults = $("client-result-list");
  const modelResults = $("model-result-list");
  const status = $("create-job-status");
  const output = $("create-job-output");
  const createButton = $("create-job-button");
  const publishButton = $("publish-job-board");
  const copyBoardButton = $("copy-job-board-link");
  const boardStatus = $("job-board-status");
  const boardText = $("job-board-text");
  let selectedClient = null;
  let selectedModel = null;
  let broadcastLink = "";

  function text(value) { return String(value || "").trim(); }
  function first(value) { return text(value).slice(0, 1).toUpperCase() || "?"; }
  function escapeHtml(value) { return String(value || "").replace(/[&<>\"']/g, function(c) { return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c] || c; }); }
  function pickRows(data) { return data && (data.clients || data.results || data.records || data.items || data.models || data.rows) || []; }
  function setStatus(node, message, bad) { node.textContent = message; node.className = "status " + (bad ? "bad" : "good"); }
  function money() { const value = Number($("amount_thb").value || ""); return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0; }
  function clientName(row) { return text(row.per_name || row.client_name || row.name || row.display_name || row.nickname || row.line_display_name || row.username || row.id || row.record_id); }
  function clientId(row) { return text(row.client_id || row.record_id || row.id || row.airtable_id || row.line_record_id); }
  function clientSession(row) { return text(row.session_id || row.latest_session_id || row.last_session_id); }
  function clientMeta(row) { return [row.package, row.tier, row.membership_status, row.line_display_name, row.username, row.phone].filter(Boolean).map(text).join(" · "); }
  function modelName(row) { return text(row.display_name || row.model_name || row.name || row.alias || row.stage_name || row.nickname || row.model_id || row.id || row.record_id); }
  function modelKey(row) { return text(row.model_id || row.model_key || row.code || row.alias || row.record_id || row.id || modelName(row)); }
  function modelMeta(row) { return [row.category, row.tier, row.group, row.city, row.status, row.height_weight].filter(Boolean).map(text).join(" · "); }
  function niceError(error) { const raw = text(error); if (raw === "not_found") return "ไม่พบผลจากคำนี้ · ลองชื่ออื่น / Recent / Per name / LINE / เบอร์"; return raw || "backend unavailable"; }

  async function apiJson(path, init) {
    const res = await fetch(path, Object.assign({ credentials: "include", headers: { accept: "application/json" } }, init || {}));
    const data = await res.json().catch(function() { return {}; });
    if (res.status === 404 || data.error === "not_found") return { ok: true, records: [], lookup_empty: true };
    if (!res.ok || data.ok === false) throw new Error(niceError(data.error && (data.error.message || data.error.code) || data.error || data.message || "request_failed"));
    return data;
  }

  function refreshSummary() {
    $("summary-client").textContent = selectedClient ? clientName(selectedClient) : "ยังไม่เลือก";
    $("summary-model").textContent = selectedModel ? modelName(selectedModel) : (text($("job-model-key").value) || "รอเลือก");
    $("summary-scope").textContent = $("job-visibility").value === "private" ? "Private" : "Public";
    $("summary-payment").textContent = money().toLocaleString("en-US") + " THB";
  }

  function renderClientRows(rows) {
    clientResults.__rows = rows;
    if (!rows.length) { clientResults.innerHTML = '<div class="status">ยังไม่เจอลูกค้า · ลอง Recent หรือค้นด้วย Per name / LINE / เบอร์</div>'; return; }
    clientResults.innerHTML = rows.map(function(row, index) {
      const selected = selectedClient && clientId(selectedClient) === clientId(row);
      const tag = text(row.match_type || row.source || row.status || "candidate");
      return '<button type="button" class="' + (selected ? 'selected' : '') + '" data-client-index="' + index + '"><div class="avatar">' + escapeHtml(first(clientName(row))) + '</div><div><strong>' + escapeHtml(clientName(row) || clientId(row) || 'Unnamed client') + '</strong><p>' + escapeHtml(clientMeta(row) || 'LINE / package evidence pending') + '</p><span class="tag">' + escapeHtml(tag) + '</span></div><b class="btn soft">เลือก</b></button>';
    }).join("");
    clientResults.querySelectorAll("[data-client-index]").forEach(function(button) { button.addEventListener("click", function() { selectClient(rows[Number(button.dataset.clientIndex)]); }); });
  }

  function selectClient(row) {
    selectedClient = row || null;
    $("job-client-id").value = selectedClient ? clientId(selectedClient) : "";
    $("job-client-name").value = selectedClient ? clientName(selectedClient) : "";
    const session = selectedClient ? clientSession(selectedClient) : "";
    if (session) $("job-session-id").value = session;
    renderClientRows(clientResults.__rows || []);
    refreshSummary();
    setStatus(status, selectedClient ? "เลือกลูกค้าแล้ว · ต่อไปค้น/เลือกโมเดล" : "เลือกลูกค้าก่อน", !selectedClient);
  }

  function renderModelRows(rows) {
    modelResults.__rows = rows;
    if (!rows.length) { modelResults.innerHTML = '<div class="status">ยังไม่เจอโมเดล · ลองชื่อเล่น / RUN / EMs / GWs / Jasper</div>'; return; }
    modelResults.innerHTML = rows.map(function(row, index) {
      const selected = selectedModel && modelKey(selectedModel) === modelKey(row);
      return '<button type="button" class="' + (selected ? 'selected' : '') + '" data-model-index="' + index + '"><div class="avatar">' + escapeHtml(first(modelName(row))) + '</div><div><strong>' + escapeHtml(modelName(row) || modelKey(row) || 'Unnamed model') + '</strong><p>' + escapeHtml(modelMeta(row) || modelKey(row)) + '</p><span class="tag">' + escapeHtml(modelKey(row)) + '</span></div><b class="btn soft">เลือก</b></button>';
    }).join("");
    modelResults.querySelectorAll("[data-model-index]").forEach(function(button) { button.addEventListener("click", function() { selectModel(rows[Number(button.dataset.modelIndex)]); }); });
  }

  function selectModel(row) {
    selectedModel = row || null;
    $("job-model-key").value = selectedModel ? modelKey(selectedModel) : "";
    renderModelRows(modelResults.__rows || []);
    refreshSummary();
    setStatus(status, selectedModel ? "เลือกโมเดลแล้ว · ใส่งานและราคาได้เลย" : "เลือกโมเดลก่อน", !selectedModel);
  }

  async function loadClients(kind) {
    const q = text(clientQuery.value);
    if (kind !== "recent" && !q) { setStatus(status, "พิมพ์ชื่อลูกค้า / LINE / เบอร์ หรือกด Recent", true); return; }
    clientResults.innerHTML = '<div class="status">กำลังค้นลูกค้า...</div>';
    try {
      const data = kind === "recent"
        ? await apiJson("/v1/admin/clients/recent")
        : await apiJson("/v1/admin/clients/lineage-lookup", { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ query: q, canonical_only: false, allow_manual_fallback: true, source: "create_job_owner_ui" }) });
      const rows = pickRows(data);
      renderClientRows(rows);
      setStatus(status, rows.length ? "เจอลูกค้า " + rows.length + " รายการ · แตะเลือก 1 คน" : "ไม่เจอลูกค้า · ลอง Recent / Per name / LINE / เบอร์", rows.length === 0);
    } catch (error) {
      clientResults.innerHTML = '<div class="status bad">ค้นลูกค้าไม่สำเร็จ · ' + escapeHtml(niceError(error && error.message)) + '</div>';
      setStatus(status, "ค้นลูกค้าไม่สำเร็จ · " + niceError(error && error.message), true);
    }
  }

  async function loadModels() {
    const q = text(modelQuery.value || $("job-model-key").value);
    if (!q) { setStatus(status, "พิมพ์ชื่อโมเดล / RUN / EMs / GWs ก่อนค้นหา", true); return; }
    modelResults.innerHTML = '<div class="status">กำลังค้นโมเดล...</div>';
    try {
      const params = new URLSearchParams();
      params.set("q", q);
      params.set("scope", $("job-visibility").value === "private" ? "private" : "public");
      const data = await apiJson("/v1/admin/models/search?" + params.toString());
      const rows = pickRows(data);
      renderModelRows(rows);
      setStatus(status, rows.length ? "เจอโมเดล " + rows.length + " รายการ · แตะเลือก 1 คน" : "ไม่เจอโมเดล · ตรวจชื่อ/RUN/scope แล้วค้นใหม่", rows.length === 0);
    } catch (error) {
      modelResults.innerHTML = '<div class="status bad">ค้นโมเดลไม่สำเร็จ · ' + escapeHtml(niceError(error && error.message)) + '</div>';
      setStatus(status, "ค้นโมเดลไม่สำเร็จ · " + niceError(error && error.message), true);
    }
  }

  function renderLinks(data) {
    const urls = [];
    const push = function(label, value, note) { if (value) urls.push({ label: label, value: String(value), note: note || "" }); };
    push("Customer Payment URL", data.customer_payment_url || data.payment_url || data.customerPaymentUrl, "ส่งให้ลูกค้าก่อน");
    push("Customer Confirmation URL", data.customer_confirmation_url || data.customerConfirmationUrl || data.member_confirmation_url, "หลัง Official Verify");
    push("Model App URL", data.model_app_url || data.modelJobAppUrl || data.model_url, "หลัง Official Verify / ส่งให้น้อง");
    push("Admin Job URL", data.admin_job_url || data.admin_url, "ไว้ให้เปอร์ดูต่อ");
    output.innerHTML = urls.length ? urls.map(function(item, index) {
      return '<div class="linkRow"><div><span>' + escapeHtml(item.label + (item.note ? ' · ' + item.note : '')) + '</span><a href="' + escapeHtml(item.value) + '" target="_blank" rel="noreferrer">' + escapeHtml(item.value) + '</a></div><button class="btn soft" type="button" data-copy-url="' + index + '">Copy</button></div>';
    }).join("") : '<div class="status">สร้างงานแล้ว แต่ response ยังไม่ส่ง URL กลับมา</div>';
    output.__urls = urls;
    output.querySelectorAll("[data-copy-url]").forEach(function(button) { button.addEventListener("click", async function() { const item = output.__urls[Number(button.dataset.copyUrl)]; if (!item) return; try { await navigator.clipboard.writeText(item.value); button.textContent = "Copied"; } catch { button.textContent = "Copy ไม่ได้"; } }); });
  }

  async function createJob() {
    const payload = {
      client_id: $("job-client-id").value,
      client_name: $("job-client-name").value,
      client_lookup_key: clientQuery.value,
      session_id: $("job-session-id").value,
      model_lookup_key: $("job-model-key").value,
      model_name: selectedModel ? modelName(selectedModel) : $("job-model-key").value,
      amount_thb: money(),
      job_visibility: $("job-visibility").value,
      job_date: $("job-date").value,
      start_time: $("job-start").value,
      duration: $("job-duration").value,
      location_name: $("job-location").value,
      payment_mode: $("job-payment-mode").value,
      note: $("job-note").value,
      source: "worker_rendered_create_job_owner_ui_v2"
    };
    if (!payload.client_id && !payload.session_id && !payload.client_name) { setStatus(status, "เลือกลูกค้าก่อนสร้างงาน", true); return; }
    if (!payload.model_lookup_key) { setStatus(status, "เลือกหรือพิมพ์โมเดลก่อนสร้างงาน", true); return; }
    if (!payload.amount_thb) { setStatus(status, "ใส่ราคา Amount THB ก่อน", true); return; }
    createButton.disabled = true;
    setStatus(status, "Creating job...", false);
    try {
      const res = await fetch("/v1/admin/create-job", { method: "POST", credentials: "include", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(function() { return {}; });
      if (!res.ok || data.ok === false) throw new Error(data.error && (data.error.message || data.error.code) || data.error || data.message || "create_job_failed");
      renderLinks(data.data || data);
      setStatus(status, "Job created · ส่ง Customer Payment URL ก่อนเท่านั้น", false);
    } catch (error) {
      setStatus(status, "ยัง create job ไม่สำเร็จ · " + niceError(error && error.message), true);
    } finally {
      createButton.disabled = false;
    }
  }

  async function publishBoard() {
    if (!text(boardText.value)) { setStatus(boardStatus, "ใส่รายละเอียดกระดานก่อน", true); return; }
    publishButton.disabled = true;
    copyBoardButton.disabled = true;
    broadcastLink = "";
    try {
      const budget = money();
      const payload = { board_text: boardText.value.trim(), world: $("job-visibility").value, job_date: $("job-date").value, start_time: $("job-start").value, duration: $("job-duration").value, area: $("job-location").value, compensation: budget ? budget.toLocaleString("en-US") + " บาท" : "", owner_note: $("job-note").value };
      const res = await fetch("/v1/admin/job-board/publish", { method: "POST", credentials: "include", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json().catch(function() { return {}; });
      if (!res.ok || data.ok !== true || !data.broadcast_url) throw new Error(data.error || data.message || "job_board_publish_failed");
      broadcastLink = String(data.broadcast_url);
      if (!broadcastLink.startsWith("https://www.mmdbkk.com/sigil/model/login?")) throw new Error("broadcast_link_contract_failed");
      copyBoardButton.disabled = false;
      setStatus(boardStatus, "Published · Copy LIFF Login V2 link ได้", false);
    } catch (error) {
      setStatus(boardStatus, "ยังลงกระดานไม่สำเร็จ · " + niceError(error && error.message), true);
    } finally {
      publishButton.disabled = false;
    }
  }

  $("search-client-button").addEventListener("click", function() { loadClients("search"); });
  $("load-recent-clients").addEventListener("click", function() { loadClients("recent"); });
  $("search-model-button").addEventListener("click", loadModels);
  createButton.addEventListener("click", createJob);
  publishButton.addEventListener("click", publishBoard);
  copyBoardButton.addEventListener("click", async function() { if (!broadcastLink) return; try { await navigator.clipboard.writeText(broadcastLink); setStatus(boardStatus, "คัดลอก Broadcast Link แล้ว", false); } catch { setStatus(boardStatus, "คัดลอกลิงก์ไม่สำเร็จ", true); } });
  clientQuery.addEventListener("keydown", function(event) { if (event.key === "Enter") loadClients("search"); });
  modelQuery.addEventListener("keydown", function(event) { if (event.key === "Enter") loadModels(); });
  ["job-visibility", "job-model-key", "amount_thb"].forEach(function(id) { $(id).addEventListener("input", refreshSummary); $(id).addEventListener("change", refreshSummary); });
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  $("job-date").value = yyyy + "-" + mm + "-" + dd;
  refreshSummary();
})();`;

export function renderCreateJobPage(): Response {
  return page("MMD Create Job", `<section class="mmdop" data-cj-flow="owner-real-v2"><main class="mmdop__shell">
    ${topbar("Create Job")}
    <section class="hero">
      <div class="kicker">Simple Owner Mode · Real Flow</div>
      <h1>สร้างงาน</h1>
      <p>เริ่มจากลูกค้า → เลือกโมเดล → ใส่งาน/ราคา → ได้ Customer Payment URL ก่อน ส่วนลิงก์ลูกค้า/โมเดลปล่อยหลัง Official Verify เท่านั้น</p>
      <div class="steps"><div class="step">01 ลูกค้า</div><div class="step">02 โมเดล</div><div class="step">03 งาน/ราคา</div><div class="step">04 URLs</div></div>
    </section>

    <section class="summary" aria-label="Create Job summary">
      <div><span class="label">Customer</span><b id="summary-client">ยังไม่เลือก</b></div>
      <div><span class="label">Model</span><b id="summary-model">รอเลือก</b></div>
      <div><span class="label">Scope</span><b id="summary-scope">Public</b></div>
      <div><span class="label">Payment</span><b id="summary-payment">0 THB</b></div>
    </section>

    <section class="grid">
      <section class="card" data-cj-primary-flow="customer-search">
        <span class="label">Step 01</span><h2>เลือกลูกค้า</h2>
        <div class="searchbar"><input class="input" id="job-client-query" placeholder="Per name / LINE / เบอร์ / package" autocomplete="off"><button class="btn gold" id="search-client-button" type="button">ค้นหา</button><button class="btn" id="load-recent-clients" type="button">Recent</button></div>
        <input id="job-client-id" type="hidden"><input id="job-client-name" type="hidden"><input id="job-session-id" type="hidden">
        <div class="results" id="client-result-list"><div class="status">กด Recent หรือค้นชื่อลูกค้าก่อน</div></div>
      </section>

      <section class="card" data-cj-primary-flow="model-search">
        <span class="label">Step 02</span><h2>เลือกโมเดล</h2>
        <div class="searchbar"><input class="input" id="job-model-query" placeholder="JASPER / EMs01 / GWs19 / RUN"><button class="btn gold" id="search-model-button" type="button">ค้นโมเดล</button></div>
        <label class="field" style="margin-top:10px"><span>Model key ที่จะส่งสร้างงาน</span><input class="input" id="job-model-key" placeholder="เลือกจากผลค้นหา หรือพิมพ์เอง"></label>
        <div class="results" id="model-result-list"><div class="status">ค้นแล้วแตะเลือกโมเดล</div></div>
      </section>
    </section>

    <section class="card" style="margin-top:12px">
      <span class="label">Step 03</span><h2>รายละเอียดงาน</h2>
      <div class="form">
        <label class="field"><span>Public / Private</span><select id="job-visibility"><option value="public">Public Work</option><option value="private">Private Work</option></select></label>
        <label class="field"><span>Amount THB</span><input class="input" id="amount_thb" name="amount_thb" type="number" min="1" step="1" required placeholder="10000"></label>
        <label class="field"><span>Job Date</span><input class="input" id="job-date" type="date"></label>
        <label class="field"><span>Start Time</span><input class="input" id="job-start" type="time" step="1800"></label>
        <label class="field"><span>Duration</span><input class="input" id="job-duration" placeholder="90m / 3h / overnight" value="90m"></label>
        <label class="field"><span>Area / Province</span><input class="input" id="job-location" list="province-list" placeholder="สุขุมวิท / กรุงเทพฯ"><datalist id="province-list"><option value="กรุงเทพฯ"><option value="นนทบุรี"><option value="ปทุมธานี"><option value="ชลบุรี"><option value="เชียงใหม่"><option value="ภูเก็ต"></datalist></label>
        <label class="field"><span>Payment mode</span><select id="job-payment-mode"><option value="full">เต็มจำนวน</option><option value="deposit">มัดจำ</option><option value="final">ส่วนที่เหลือ</option></select></label>
        <label class="field wide"><span>Internal Note</span><textarea class="textarea" id="job-note" placeholder="brief / ข้อควรระวัง / operation note"></textarea></label>
      </div>
      <button class="btn gold" id="create-job-button" type="button" style="margin-top:12px">Create Job</button>
      <div class="status" id="create-job-status">เลือกลูกค้า + โมเดล แล้วใส่งาน/ราคา</div>
      <div class="links" id="create-job-output"></div>
    </section>

    <section class="card" style="margin-top:12px" data-cj-secondary-flow="model-job-board">
      <span class="label">Optional</span><h2>ลงกระดานงาน</h2>
      <p>ใช้เฉพาะงานที่ยังหาโมเดลอยู่ · Broadcast Link ต้องเป็น LIFF Login V2</p>
      <textarea id="job-board-text" maxlength="1000" class="textarea" placeholder="รายละเอียด public-safe สำหรับโมเดล"></textarea>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn soft" id="publish-job-board" type="button">ลงกระดานงาน</button><button class="btn" id="copy-job-board-link" type="button" disabled>Copy Broadcast Link</button></div>
      <div class="status" id="job-board-status">ยังไม่ได้ publish</div>
    </section>
  </main><script>${createJobScript}</script></section>`);
}
