import { SYSTEM_LIGHT } from "../../webflow/global/sigil-brand-v1.mjs";

export function renderHypeConsole() {
  // Keep esbuild's naming helper inside the browser payload, not the Worker scope.
  const clientScript = '(()=>{const __name=(target,value)=>{Object.defineProperty(target,"name",{value,configurable:true});return target;};return (' + hypeConsoleClient.toString() + ')();})();';
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>HYPE · MY MMD Console</title><style>
  @media(max-width:991px){body.sigil-directory-offset #hype-console{padding-top:52px}}
  html,body{margin:0;background:#fff}#hype-console{font:16px/1.6 system-ui,sans-serif;color:#272b30;min-height:100svh;letter-spacing:0}#hype-console *{box-sizing:border-box}#hype-console [hidden]{display:none!important}#hype-console a{color:#17655b;text-underline-offset:4px}#hype-console header{border-bottom:1px solid #d7dce0;padding:16px 20px}#hype-console .hc-bar{max-width:1120px;margin:auto;display:flex;align-items:center;justify-content:space-between;gap:16px}#hype-console .hc-brand svg{width:155px;height:30px;display:block}#hype-console main{max-width:1120px;margin:auto;padding:24px 16px 48px}#hype-console .hc-heading{display:flex;align-items:center;gap:12px;margin-bottom:24px}#hype-console h1{font-size:28px;margin:0}#hype-console h2{font-size:20px;margin:0 0 16px}#hype-console .hc-badge{font-size:13px;font-weight:600;background:#e7f3ef;color:#17655b;padding:4px 8px;border-radius:4px}#hype-console .hc-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-bottom:1px solid #c7ccd2;margin-bottom:24px;gap:4px}#hype-console button,#hype-console input,#hype-console select,#hype-console textarea{font:inherit;border:1px solid #aab1b8;border-radius:6px;color:inherit;background:#fff}#hype-console button{min-height:46px;padding:10px 16px;cursor:pointer}#hype-console button:disabled{cursor:not-allowed;opacity:.5}#hype-console .hc-tabs button{border:0;border-bottom:3px solid transparent;border-radius:0;min-height:70px;padding:10px 6px;font-size:15px}#hype-console .hc-tabs button[aria-selected=true]{border-bottom-color:#a34c1d;background:#fff0e2;font-weight:700}#hype-console .hc-layout{display:grid;gap:28px}#hype-console .hc-search{display:flex;gap:8px}#hype-console input{min-height:48px;padding:10px 12px;min-width:0;width:100%}#hype-console label{display:block;margin-bottom:8px;font-weight:600}#hype-console .hc-primary{background:#272b30;color:#fff;border-color:#272b30}#hype-console .hc-search button{flex-shrink:0}#hype-console .hc-status{min-height:26px;font-size:14px;color:#545c66;margin:14px 0}#hype-console .hc-status[data-error=true]{color:#a22f39}#hype-console .hc-results{list-style:none;margin:0;padding:0}#hype-console .hc-results li{border-bottom:1px solid #d7dce0}#hype-console .hc-result{display:block;width:100%;text-align:left;border:0;border-radius:0;padding:16px 12px;border-left:3px solid transparent;overflow-wrap:anywhere}#hype-console .hc-result[aria-pressed=true]{background:#eef7f4;border-left-color:#17655b}#hype-console .hc-result strong,#hype-console .hc-result span{display:block}#hype-console .hc-result span{font-size:14px;color:#545c66;margin-top:4px}#hype-console .hc-workspace{border-top:1px solid #c7ccd2;padding-top:24px}#hype-console .hc-selected{font-size:14px;overflow-wrap:anywhere;color:#545c66;margin-bottom:16px}#hype-console select{display:block;width:100%;padding:10px;min-height:48px;margin-bottom:14px}#hype-console textarea{display:block;width:100%;padding:14px;min-height:240px;resize:vertical;line-height:1.8;margin:18px 0 12px}#hype-console .hc-draft-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}#hype-console .hc-note{font-size:13px;color:#545c66;margin-top:24px}#hype-console :focus-visible{outline:3px solid #17655b;outline-offset:3px}#hype-console .hc-meta{font-size:13px;color:#545c66;overflow-wrap:anywhere}#hype-console .hc-empty{padding:24px 0;color:#545c66}@media(min-width:800px){#hype-console main{padding:32px 24px 60px}#hype-console .hc-layout{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:40px}#hype-console .hc-workspace{border-top:0;border-left:1px solid #c7ccd2;padding:0 0 0 32px}#hype-console .hc-tabs{max-width:640px}#hype-console .hc-tabs button{min-height:56px}}@media(max-width:360px){#hype-console header{padding:12px}#hype-console .hc-bar{gap:8px}#hype-console .hc-brand svg{width:120px}#hype-console .hc-bar>a{font-size:14px}}
  </style></head><body><div id="hype-console"><header><div class="hc-bar"><span class="hc-brand">${SYSTEM_LIGHT}</span><a href="/internal/admin/dashboard">กลับ Console</a></div></header><main><div class="hc-heading"><h1>HYPE</h1><span class="hc-badge">อ่านอย่างเดียว</span></div><div class="hc-tabs" role="tablist" aria-label="หมวดงาน"><button role="tab" id="hc-tab-member" aria-selected="true" aria-controls="hc-panel" data-lane="member">สมัครสมาชิก</button><button role="tab" id="hc-tab-applicant" aria-selected="false" aria-controls="hc-panel" tabindex="-1" data-lane="applicant">สมัครโมเดล</button><button role="tab" id="hc-tab-model" aria-selected="false" aria-controls="hc-panel" tabindex="-1" data-lane="model">โมเดลเดิม</button></div><div id="hc-panel" role="tabpanel" aria-labelledby="hc-tab-member" class="hc-layout"><section aria-label="ค้นหารายการ"><h2 id="hc-title">ผู้สมัครสมาชิก</h2><form id="hc-search-form"><label for="hc-query" id="hc-query-label">ชื่อผู้สมัคร</label><div class="hc-search"><input id="hc-query" type="search" minlength="2" maxlength="80" autocomplete="off" required><button id="hc-search-button" class="hc-primary" type="submit">ค้นหา</button></div></form><p id="hc-status" class="hc-status" role="status" aria-live="polite">พร้อมค้นหา</p><p id="hc-meta" class="hc-meta"></p><ul id="hc-results" class="hc-results" aria-label="ผลการค้นหา"></ul></section><section class="hc-workspace" aria-label="ร่างคำตอบ"><h2>ร่างคำตอบ</h2><p id="hc-selected" class="hc-selected">ยังไม่ได้เลือกรายการ</p><label for="hc-topic">เรื่องที่ต้องการช่วย</label><select id="hc-topic"><option value="next_step">ขั้นตอนถัดไป</option><option value="profile" hidden>แก้ข้อมูลโปรไฟล์</option><option value="access" hidden>เข้า Model Dashboard</option><option value="availability" hidden>แจ้งเวลาสะดวก</option></select><button id="hc-prepare" type="button" disabled>เตรียมร่าง</button><label for="hc-draft" class="hc-note">ฉบับร่าง · รอผู้ดูแลตรวจ</label><textarea id="hc-draft" aria-label="ข้อความร่าง" disabled></textarea><div class="hc-draft-actions"><button id="hc-copy" type="button" disabled>คัดลอก</button><span id="hc-copy-status" class="hc-meta" role="status"></span></div><p id="hc-draft-status" class="hc-status" role="status" aria-live="polite"></p><p class="hc-note">สถานะที่แสดงเป็นข้อมูลรายการต้นทาง ไม่ใช่การยืนยันสมาชิก การชำระเงิน หรือการอนุมัติโมเดล</p></section></div></main></div><script>${clientScript}</script></body></html>`;
}

function hypeConsoleClient() {
  const $ = id => document.getElementById(`hc-${id}`);
  const tabs = [...document.querySelectorAll("#hype-console [role=tab]")];
  const labels = { member: ["ผู้สมัครสมาชิก", "ชื่อผู้สมัคร"], applicant: ["ผู้สมัครโมเดล", "ชื่อผู้สมัคร / ชื่อทำงาน"], model: ["ช่วยโมเดลเดิม", "Model Per Rename / ชื่อโฟลเดอร์"] };
  const statuses = { new: "รายการใหม่", pending: "รอดำเนินการ", in_review: "อยู่ระหว่างตรวจ", pending_review: "รอตรวจ", waitlisted: "รอคิวพิจารณา", new_review: "รายการใหม่รอตรวจ", approved: "บันทึกว่า approved", rejected: "บันทึกว่า rejected", active: "ทะเบียน active", inactive: "ทะเบียน inactive", unknown: "ยังไม่ทราบสถานะ" };
  let lane = "member", selected = null, epoch = 0;
  function clearDraft() { $("draft").value = ""; $("draft").disabled = true; $("copy").disabled = true; $("copy-status").textContent = ""; $("draft-status").textContent = ""; }
  function reset() { epoch++; selected = null; $("results").replaceChildren(); $("meta").textContent = ""; $("selected").textContent = "ยังไม่ได้เลือกรายการ"; $("prepare").disabled = true; $("search-button").disabled = false; clearDraft(); }
  function status(text, error = false) { $("status").textContent = text; $("status").dataset.error = String(error); }
  async function api(action, body) {
    const response = await fetch(`/v1/admin/hype/${action}`, { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000) });
    const data = await response.json();
    if (!response.ok || data.ok !== true) throw new Error(response.status === 401 || response.status === 403 ? "กรุณาเข้าสู่ Console ด้วยบัญชีผู้ดูแลอีกครั้ง" : "ยังอ่านข้อมูลไม่ได้ ลองใหม่อีกครั้งครับ");
    return data;
  }
  function switchLane(tab) {
    lane = tab.dataset.lane; reset();
    for (const item of tabs) { item.setAttribute("aria-selected", String(item === tab)); item.tabIndex = item === tab ? 0 : -1; }
    $("panel").setAttribute("aria-labelledby", tab.id);
    $("title").textContent = labels[lane][0]; $("query-label").textContent = labels[lane][1]; $("query").value = "";
    $("topic").value = "next_step";
    for (const option of $("topic").options) { option.hidden = option.value !== "next_step" && lane !== "model"; option.disabled = option.hidden; }
    status("พร้อมค้นหา");
  }
  for (const tab of tabs) {
    tab.onclick = () => switchLane(tab);
    tab.onkeydown = event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const index = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (tabs.indexOf(tab) + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      switchLane(tabs[index]); tabs[index].focus();
    };
  }
  $("query").oninput = () => { reset(); status("พร้อมค้นหา"); };
  $("topic").onchange = () => { epoch++; clearDraft(); $("prepare").disabled = !selected; };
  $("search-form").onsubmit = async event => {
    event.preventDefault(); reset(); const current = epoch;
    $("search-button").disabled = true; status("กำลังค้นหา…");
    try {
      const data = await api("search", { lane, query: $("query").value.trim() });
      if (epoch !== current) return;
      $("meta").textContent = `${data.source} · ${new Date(data.checked_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })} · ${data.items.length} รายการ`;
      status(data.truncated ? "แสดง 20 รายการแรก กรุณาระบุชื่อให้ชัดขึ้น" : data.items.length ? "เลือกรายการที่ต้องการตรวจ" : "ไม่พบรายการที่ตรงกัน ยังสรุปสถานะไม่ได้");
      for (const item of data.items) {
        const li = document.createElement("li"), button = document.createElement("button"), name = document.createElement("strong"), detail = document.createElement("span");
        button.type = "button"; button.className = "hc-result"; button.setAttribute("aria-pressed", "false");
        name.textContent = item.name; detail.textContent = [statuses[item.status] || statuses.unknown, item.date].filter(Boolean).join(" · ");
        button.append(name, detail); li.append(button); $("results").append(li);
        button.onclick = () => {
          epoch++; clearDraft(); selected = item;
          for (const row of $("results").querySelectorAll("button")) row.setAttribute("aria-pressed", String(row === button));
          $("selected").textContent = item.name; $("prepare").disabled = false;
        };
      }
    } catch (error) { if (epoch === current) { reset(); status(error.message, true); } }
    finally { if (epoch === current || !$("results").children.length) $("search-button").disabled = false; }
  };
  $("prepare").onclick = async () => {
    if (!selected) return;
    clearDraft(); const current = ++epoch; $("prepare").disabled = true; $("draft-status").textContent = "กำลังอ่านรายการล่าสุด…";
    try {
      const data = await api("draft", { lane, record_id: selected.id, topic: $("topic").value });
      if (epoch !== current) return;
      $("selected").textContent = data.item.name; $("draft").value = data.draft; $("draft").disabled = false; $("copy").disabled = false;
      $("draft-status").textContent = "รอผู้ดูแลตรวจ · ยังไม่ได้ส่ง";
    } catch (error) { if (epoch === current) { clearDraft(); $("draft-status").textContent = error.message; } }
    finally { if (epoch === current) $("prepare").disabled = false; }
  };
  $("copy").onclick = async () => {
    if ($("draft").disabled || !$("draft").value.trim()) return;
    try { await navigator.clipboard.writeText($("draft").value); $("copy-status").textContent = "คัดลอกแล้ว · ยังไม่ได้ส่ง"; }
    catch { $("draft").focus(); $("draft").select(); $("copy-status").textContent = "คัดลอกจากช่องข้อความได้เลย"; }
  };
  $("draft").oninput = () => { $("copy").disabled = !$("draft").value.trim(); $("copy-status").textContent = ""; };
  window.addEventListener("pagehide", reset);
}
