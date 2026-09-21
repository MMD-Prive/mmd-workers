import { PARTNER_OPERATIONS_JS, PARTNER_OPERATIONS_CSS } from "./partner-operations";

export const PARTNER_CONTROL_ROOM_JS = String.raw`
(function () {
  "use strict";
  var params = new URLSearchParams(window.location.search);
  var token = params.get("t") || "";
  var root = document.querySelector("[data-partner-control-room]");
  if (!root || !token) return;

  var state = { data:null, model:null, vault:null, vaultEnvelope:null, vaultPin:"", vaultRevision:null, vaultReady:false, vaultQueue:Promise.resolve(), vaultConflict:false, authBlocked:false, view:"home" };
  var $ = function (selector, parent) { return (parent || document).querySelector(selector); };
  var $$ = function (selector, parent) { return Array.prototype.slice.call((parent || document).querySelectorAll(selector)); };
  var esc = function (value) { return String(value == null ? "" : value).replace(/[&<>\"']/g, function (c) { return ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c]; }); };
  var money = function (value) { return Number(value || 0).toLocaleString("th-TH") + " THB"; };
  var dateTime = function (value) { if (!value) return "—"; var d = new Date(value); return isNaN(d.getTime()) ? esc(value) : d.toLocaleString("th-TH", { dateStyle:"medium", timeStyle:"short", timeZone:"Asia/Bangkok" }); };
  var uid = function (prefix) { var bytes = new Uint8Array(10); crypto.getRandomValues(bytes); return prefix + Array.prototype.map.call(bytes, function (b) { return b.toString(16).padStart(2,"0"); }).join(""); };
  var signInMessage = "เข้าสู่ระบบด้วย LINE อีกครั้งเพื่อเปิดพื้นที่พาร์ทเนอร์";

  function blockPartnerAccess() {
    state.authBlocked = true;
    state.data = null; state.model = null; state.vault = null;
    state.vaultPin = ""; state.vaultSalt = null; state.vaultEnvelope = null;
    state.vaultReady = false; state.vaultConflict = true;
    $(".pcr-shell", root).hidden = true;
    var reconnect = $("[data-reconnect-line]", root);
    if (reconnect) reconnect.hidden = false;
    $$("dialog", root).forEach(function (dialog) { dialog.close(); });
    $$("form", root).forEach(function (form) { form.reset(); });
    $$('[data-vault-pin],[data-general-note],[data-private-travel],[name^="private_"]', root).forEach(function (field) { field.value = ""; });
    $$('[data-jobs],[data-models],[data-earnings],[data-private-events],[data-model-history],[data-model-contacts],[data-activity],[data-console-history],[data-agreements],[data-performance]', root).forEach(function (el) { el.replaceChildren(); });
    setFlash(signInMessage, "error");
  }

  function api(path, options) {
    if (state.authBlocked) return Promise.reject(new Error(signInMessage));
    var joiner = path.indexOf("?") === -1 ? "?" : "&";
    return fetch(path + joiner + "t=" + encodeURIComponent(token), Object.assign({}, options || {}, {referrerPolicy:"no-referrer",cache:"no-store",credentials:"omit"})).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (payload) {
        if (response.status === 401) blockPartnerAccess();
        if (state.authBlocked) throw new Error(signInMessage);
        if (!response.ok || !payload.ok) {
          var code = payload.error && typeof payload.error === "object" ? payload.error.code : payload.error;
          var messages = {vault_conflict:"ข้อมูลถูกแก้จากอีกอุปกรณ์ กรุณาสำรองแล้วโหลด Vault ใหม่ก่อนบันทึก",vault_revision_required:"กรุณาโหลด Vault ใหม่ก่อนบันทึก",job_already_closed:"งานนี้ปิดแล้ว",explicit_share_required:"กรุณายืนยัน Share with MMD",official_verify_required:"รอ MMD ตรวจสอบการชำระเงินก่อนยืนยันงาน",partner_confirmation_already_final:"งานนี้บันทึกคำตอบแล้ว กรุณารีเฟรชสถานะ",partner_not_active:"บัญชีพาร์ทเนอร์อยู่ระหว่างการตรวจสอบ",partner_not_recognized:"รอ Boss Per ตรวจสอบบัญชีพาร์ทเนอร์",telegram_binding_conflict:"กรุณาติดต่อ MMD เพื่อตรวจสอบบัญชี Telegram"};
          throw new Error(messages[code] || "กรุณาลองอีกครั้ง หรือติดต่อ MMD เพื่อตรวจสอบรายการ");
        }
        return payload;
      });
    });
  }

  function setFlash(message, tone) {
    if (state.authBlocked) { message = signInMessage; tone = "error"; }
    var flash = $("[data-flash]", root);
    if (!flash) return;
    flash.textContent = message || "";
    flash.dataset.tone = tone || "neutral";
    flash.hidden = !message;
  }

  function showView(name) {
    state.view = name;
    $$('[data-view-panel]', root).forEach(function (panel) { panel.hidden = panel.dataset.viewPanel !== name; });
    $$('[data-view]', root).forEach(function (button) { button.setAttribute("aria-current", button.dataset.view === name ? "page" : "false"); });
  }

  function renderMetrics(data) {
    var summary = data.summary || {};
    var metrics = $("[data-metrics]", root);
    metrics.innerHTML = [
      ["โมเดลในสังกัด", summary.activeModels || 0],
      ["งานที่ต้องดู", summary.upcomingJobs || 0],
      ["รอจ่าย", money(summary.pendingAmount)],
      ["จ่ายแล้ว", money(summary.paidAmount)]
    ].map(function (item) { return '<article><span>' + esc(item[0]) + '</span><strong>' + esc(item[1]) + '</strong></article>'; }).join("");
  }

  function jobCard(job) {
    var note = state.vault && state.vault.travel_notes ? (state.vault.travel_notes[job.session_record_id] || "") : "";
    var finalLabel = job.status === "confirmed" ? "ยืนยันงานแล้ว" : job.status === "declined" ? "แจ้งรับงานไม่ได้แล้ว" : "";
    var actions = finalLabel ? '<div class="pcr-job-locked" role="status"><b>' + finalLabel + '</b></div>' : job.confirmation_allowed === true
      ? '<div class="pcr-actions"><button type="button" data-job-action="confirm">Confirm</button><button type="button" data-job-action="changes" class="ghost">ขอแก้ไข</button><button type="button" data-job-action="decline" class="danger">ปฏิเสธ</button></div>'
      : '<div class="pcr-job-locked" role="status"><b>รอ Official Verify</b><span>ยืนยันหรือเปลี่ยนสถานะงานได้หลังระบบตรวจสอบการชำระเงินแล้ว</span></div>';
    return '<article class="pcr-job" data-job="' + esc(job.session_record_id) + '">' +
      '<div class="pcr-job-main"><div><span class="pcr-status">' + esc(job.status || "pending") + '</span><h3>' + esc(job.model_name) + '</h3></div><strong>' + dateTime(job.start_at || job.date) + '</strong></div>' +
      '<dl><div><dt>งาน</dt><dd>' + esc(job.work_type || job.work_lane || "MMD assignment") + '</dd></div><div><dt>สถานที่</dt><dd>' + esc(job.location) + '</dd></div><div><dt>ลูกค้า</dt><dd>' + esc(job.client_alias) + '</dd></div></dl>' +
      actions +
      '<label class="pcr-private-field"><span>Private travel note · MMD อ่านไม่ได้</span><textarea data-private-travel placeholder="เช่น เดินทางถึงกรุงเทพฯ วันที่…" ' + (state.vault ? "" : "disabled") + '>' + esc(note) + '</textarea></label>' +
      '</article>';
  }

  function renderJobs(data) {
    var jobs = data.jobs || [];
    var target = $("[data-jobs]", root);
    target.innerHTML = jobs.length ? jobs.map(jobCard).join("") : '<div class="pcr-empty">ยังไม่มีงานที่ผูกกับ Partner นี้</div>';
  }

  function modelCard(model) {
    var image = model.image_url ? '<img src="' + esc(model.image_url) + '" alt="">' : '<span>' + esc(String(model.display_name || "M").slice(0,1)) + '</span>';
    var proposal = model.sales_control && model.sales_control.proposal ? model.sales_control.proposal : null;
    var approved = model.sales_control && model.sales_control.approved_policy;
    var visibility = approved ? approved.sales_visibility : "off";
    return '<article class="pcr-model" data-model="' + esc(model.model_record_id) + '">' +
      '<div class="pcr-model-image">' + image + '</div><div class="pcr-model-copy"><div class="pcr-model-title"><div><h3>' + esc(model.display_name) + '</h3><p>' + esc(model.height_cm || "—") + ' cm · ' + esc(model.weight_kg || "—") + ' kg</p></div><span class="pcr-switch is-' + esc(visibility) + '">' + (approved ? (visibility === "on" ? "ON · ตามตารางที่อนุมัติ" : "OFF · ตามตารางที่อนุมัติ") : "รอตรวจ / ยังไม่เปิดขาย") + '</span></div>' +
      '<p>' + esc(model.sales_copy || model.profile_summary || model.skills_summary || "ยังไม่มีข้อความแนะนำตัว") + '</p>' +
      '<div class="pcr-meta"><span>' + esc(model.referral_status) + '</span><span>' + esc(model.availability_status) + '</span>' + (model.profile_request_status ? '<span>Profile: ' + esc(model.profile_request_status) + '</span>' : '') + '</div>' +
      (proposal ? '<p>เรทถึงตัว '+esc(money(proposal.partner_source_rate_thb))+' · เรทขายที่เสนอ '+esc(money(proposal.customer_sell_rate_thb))+' · '+esc(proposal.status)+'</p>' : '') + '<button type="button" data-edit-model>Edit model & sales control</button></div></article>';
  }

  function renderModels(data) {
    var target = $("[data-models]", root);
    var models = data.models || [];
    var pending = (data.model_changes || []).filter(function (item) { return item.action === "add_model" && item.status === "review"; });
    target.innerHTML = models.map(modelCard).join("") + pending.map(function (item) {
      return '<article class="pcr-model pending"><div class="pcr-model-image"><span>+</span></div><div class="pcr-model-copy"><h3>' + esc(item.payload.display_name || "New model") + '</h3><p>กำลังรอการตรวจจาก MMD</p><div class="pcr-meta"><span>Review</span></div></div></article>';
    }).join("") || '<div class="pcr-empty">ยังไม่มีโมเดลในสังกัด</div>';
  }

  function renderEarnings(data) {
    var rows = data.commissions || [];
    $("[data-earnings]", root).innerHTML = rows.length ? '<div class="pcr-table"><table><thead><tr><th>Job</th><th>Model</th><th>ฐาน</th><th>Commission</th><th>Status</th></tr></thead><tbody>' + rows.map(function (row) {
      return '<tr><td>' + esc(row.jobId) + '</td><td>' + esc(row.model) + '</td><td>' + esc(money(row.basisAmount)) + '</td><td>' + esc(money(row.commission)) + '</td><td>' + esc(row.statusLabel) + '</td></tr>';
    }).join("") + '</tbody></table></div>' : '<div class="pcr-empty">ยังไม่มีรายการรายได้</div>';
  }

  function renderTelegram(data) {
    var partner = data.partner || {};
    var target = $("[data-telegram]", root);
    target.innerHTML = partner.telegram_connected
      ? '<div><b>Telegram connected</b><span>' + esc(partner.telegram_username ? "@" + String(partner.telegram_username).replace(/^@/,"") : "Verified") + '</span></div><i aria-hidden="true">✓</i>'
      : '<div><b>เชื่อม Telegram เพื่อรับงาน</b><span>กด Connect Telegram แล้วกด Start ในแชต จากนั้นกลับมาหน้านี้</span></div><button type="button" data-connect-telegram>Connect Telegram</button>';
  }

  function hydrate(data) {
    if (state.authBlocked) return;
    if (!state.data) setFlash("");
    state.data = data;
    $(".pcr-shell", root).hidden = false;
    $("[data-loading]", root).textContent = "";
    $("[data-partner-name]", root).textContent = (data.partner && data.partner.name) || "SĪGIL Partner";
    renderMetrics(data); renderJobs(data); renderModels(data); renderEarnings(data); renderTelegram(data);
    bindDynamic(); renderOperations(data);
  }

  function bindDynamic() {
    $$('[data-edit-model]', root).forEach(function (button) { button.onclick = function () { openModelEditor(button.closest('[data-model]').dataset.model); }; });
    $$('[data-job-action]', root).forEach(function (button) { button.onclick = function () { submitJobAction(button); }; });
    var connect = $("[data-connect-telegram]", root);
    if (connect) connect.onclick = connectTelegram;
    $$('[data-private-travel]', root).forEach(function (field) { field.onchange = function () { if (!state.vault) return; var id = field.closest('[data-job]').dataset.job; state.vault.travel_notes[id] = field.value; saveVault().catch(function(error){setFlash(error.message,"error");}); }; });
  }

  function connectTelegram(event) {
    var button = event.currentTarget; button.disabled = true;
    api("/v1/partner/telegram/connect", { method:"POST", headers:{"content-type":"application/json"}, body:"{}" }).then(function (payload) {
      if (payload.telegram_connected) return load();
      if (!payload.connect_url) throw new Error("Telegram link unavailable");
      var target = new URL(payload.connect_url);
      if (target.protocol !== "https:" || target.hostname !== "t.me" || target.username || target.password || !target.searchParams.get("start")) throw new Error("กรุณาลองเชื่อม Telegram อีกครั้ง");
      window.location.href = target.href;
    }).catch(function (error) { button.disabled = false; setFlash(error.message,"error"); });
  }

  function submitJobAction(button) {
    var card = button.closest('[data-job]');
    var job = (state.data.jobs || []).find(function (item) { return item.session_record_id === card.dataset.job; });
    if (!job || job.confirmation_allowed !== true) return setFlash("งานนี้ยังรอ Official Verify จึงยังยืนยันไม่ได้","error");
    var action = button.dataset.jobAction;
    if(action === "confirm" && state.vaultEnvelope && !state.vault)return ensurePrivate();
    if(action === "confirm" && conflictFor(job).length)return setFlash("คิวชนกับรายการอื่น กรุณาจัดการคิวก่อนยืนยันงาน","error");
    var note = action === "confirm" ? "" : window.prompt(action === "changes" ? "ต้องการแก้ไขอะไร (ข้อความนี้แชร์กับ MMD)" : "เหตุผลที่ปฏิเสธ (ข้อความนี้แชร์กับ MMD)", "");
    if (note === null) return;
    button.disabled = true;
    api("/v1/partner/jobs/action", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({session_record_id:card.dataset.job,action:action,note:note}) }).then(function () {
      setFlash("อัปเดตสถานะงานแล้ว","success"); return load();
    }).catch(function (error) { button.disabled = false; setFlash(error.message,"error"); });
  }

  function openModelEditor(modelId) {
    var model = (state.data.models || []).find(function (item) { return item.model_record_id === modelId; });
    if (!model) return;
    state.model = model;
    var dialog = $("[data-model-dialog]", root);
    var form = $("[data-model-form]", dialog);
    form.reset();
    form.elements.display_name.value = model.display_name || "";
    form.elements.age.value = model.age || "";
    form.elements.height_cm.value = model.height_cm || "";
    form.elements.weight_kg.value = model.weight_kg || "";
    form.elements.profile_summary.value = model.profile_summary || "";
    form.elements.skills_summary.value = model.skills_summary || "";
    form.elements.experience_summary.value = model.experience_summary || "";
    form.elements.sales_copy.value = model.sales_copy || "";
    var urls = model.portfolio_urls || [];
    form.elements.portfolio_url_1.value = urls[0] || ""; form.elements.portfolio_url_2.value = urls[1] || ""; form.elements.portfolio_url_3.value = urls[2] || "";
    var proposal = model.sales_control && model.sales_control.proposal ? model.sales_control.proposal : {};
    form.elements.partner_source_rate_thb.value = proposal.partner_source_rate_thb || "";
    form.elements.customer_sell_rate_thb.value = proposal.customer_sell_rate_thb || "";
    form.elements.sales_visibility.value = proposal.sales_visibility || "off";
    var audiences = proposal.audience_scope || [];
    $$('[name="audience_scope"]', form).forEach(function (input) { input.checked = audiences.indexOf(input.value) !== -1; });
    form.elements.private_note.value = state.vault && state.vault.model_notes ? (state.vault.model_notes[modelId] || "") : "";
    form.elements.private_note.disabled = !state.vault;
    openOperationsModel(model, form);
    dialog.showModal();
  }

  function profilePayload(form, action) {
    return { action:action, model_record_id:state.model && state.model.model_record_id, display_name:form.elements.display_name.value, age:form.elements.age.value, height_cm:form.elements.height_cm.value, weight_kg:form.elements.weight_kg.value, profile_summary:form.elements.profile_summary.value, skills_summary:form.elements.skills_summary.value, experience_summary:form.elements.experience_summary.value, sales_copy:form.elements.sales_copy.value, portfolio_urls:[form.elements.portfolio_url_1.value,form.elements.portfolio_url_2.value,form.elements.portfolio_url_3.value].filter(Boolean), availability_note:form.elements.availability_note.value, share_with_mmd:form.elements.share_with_mmd.checked };
  }

  function submitProfile(event) {
    event.preventDefault(); var form = event.currentTarget;
    if (!form.elements.share_with_mmd.checked) return setFlash("กรุณายืนยัน Share with MMD สำหรับข้อมูลโปรไฟล์ชุดนี้","error");
    var button = form.querySelector('[data-save-profile]'); button.disabled = true;
    api("/v1/partner/models/change", { method:"POST", headers:{"content-type":"application/json","Idempotency-Key":uid("profile_")}, body:JSON.stringify(profilePayload(form,"update_profile")) }).then(function () {
      if (state.vault) { state.vault.model_notes[state.model.model_record_id] = form.elements.private_note.value; return saveVault(); }
    }).then(function () { setFlash("บันทึกโปรไฟล์และส่งให้ MMD ตรวจแล้ว","success"); $("[data-model-dialog]",root).close(); return load(); }).catch(function (error) { setFlash(error.message,"error"); }).finally(function () { button.disabled=false; });
  }

  function submitSales() {
    var form = $("[data-model-form]",root); if(!form.elements.share_with_mmd.checked)return setFlash("กรุณายืนยัน Share with MMD","error"); var audiences = $$('[name="audience_scope"]:checked',form).map(function (input) { return input.value; });
    if (!audiences.length) return setFlash("เลือกกลุ่มลูกค้าอย่างน้อยหนึ่งกลุ่ม","error");
    api("/v1/partner/sales/proposal", { method:"POST", headers:{"content-type":"application/json","Idempotency-Key":uid("sales_")}, body:JSON.stringify({model_record_id:state.model.model_record_id,partner_source_rate_thb:form.elements.partner_source_rate_thb.value,customer_sell_rate_thb:form.elements.customer_sell_rate_thb.value,sales_visibility:form.elements.sales_visibility.value,audience_scope:audiences,share_with_mmd:true,schedule_type:form.elements.schedule_type.value,effective_from_at:bangkokIso(form.elements.effective_from_at.value),effective_until_at:bangkokIso(form.elements.effective_until_at.value),change_reason:"Partner Dashboard control-room proposal"}) }).then(function () { setFlash("ส่ง Sales Control ให้ Boss Per ตรวจแล้ว","success"); return load(); }).catch(function (error) { setFlash(error.message,"error"); });
  }

  function uploadModelFile() {
    var form = $("[data-model-form]",root); var file = form.elements.model_file.files[0];
    if (!file) return setFlash("เลือกไฟล์ก่อนอัปโหลด","error");
    if (!form.elements.share_with_mmd.checked) return setFlash("ไฟล์โปรไฟล์ต้องยืนยัน Share with MMD","error");
    var data = new FormData(); data.append("model_record_id",state.model.model_record_id); data.append("share_with_mmd","true"); data.append("file_category","photo"); data.append("file",file);
    api("/v1/partner/models/upload", {method:"POST",body:data}).then(function () { setFlash("อัปโหลดแล้วและรอ MMD ตรวจ","success"); form.elements.model_file.value="";loadAssets(state.model.model_record_id); }).catch(function (error) { setFlash(error.message,"error"); });
  }

  function removeModel() {
    if (!window.confirm("ส่งคำขอถอดโมเดลนี้ออกจากสังกัด? Canonical Model จะไม่ถูกลบ")) return;
    api("/v1/partner/models/change", {method:"POST",headers:{"content-type":"application/json","Idempotency-Key":uid("remove_")},body:JSON.stringify({action:"remove_model",model_record_id:state.model.model_record_id,reason:"Partner requested roster removal",share_with_mmd:true})}).then(function () { setFlash("ส่งคำขอถอดโมเดลแล้ว","success"); $("[data-model-dialog]",root).close(); return load(); }).catch(function (error) { setFlash(error.message,"error"); });
  }

  function addModel(event) {
    event.preventDefault(); var form=event.currentTarget;
    if (!form.elements.share_with_mmd.checked) return setFlash("กรุณายืนยัน Share with MMD","error");
    var payload={action:"add_model",display_name:form.elements.display_name.value,age:form.elements.age.value,height_cm:form.elements.height_cm.value,weight_kg:form.elements.weight_kg.value,profile_summary:form.elements.profile_summary.value,skills_summary:form.elements.skills_summary.value,experience_summary:form.elements.experience_summary.value,sales_copy:form.elements.sales_copy.value,portfolio_urls:[form.elements.portfolio_url_1.value,form.elements.portfolio_url_2.value,form.elements.portfolio_url_3.value].filter(Boolean),share_with_mmd:true};
    api("/v1/partner/models/change",{method:"POST",headers:{"content-type":"application/json","Idempotency-Key":uid("add_")},body:JSON.stringify(payload)}).then(function(){setFlash("เพิ่มโมเดลเข้าสู่การตรวจแล้ว","success");form.reset();$("[data-add-dialog]",root).close();return load();}).catch(function(error){setFlash(error.message,"error");});
  }

  function b64(bytes) { var binary=""; bytes.forEach(function(b){binary+=String.fromCharCode(b);}); return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,""); }
  function unb64(value) { var base=value.replace(/-/g,"+").replace(/_/g,"/"); while(base.length%4)base+="="; var binary=atob(base); return Uint8Array.from(binary,function(c){return c.charCodeAt(0);}); }
  function vaultKey(pin,salt) { return crypto.subtle.importKey("raw",new TextEncoder().encode(pin),"PBKDF2",false,["deriveKey"]).then(function(key){return crypto.subtle.deriveKey({name:"PBKDF2",salt:salt,iterations:310000,hash:"SHA-256"},key,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);}); }
  function loadVaultEnvelope() { return api("/v1/partner/private-vault").then(function(payload){state.vaultEnvelope=payload.envelope||null;state.vaultRevision=payload.revision||null;state.vaultReady=true;return payload;}); }
  function unlockVault() {
    if(!state.vaultReady)return loadVaultEnvelope().then(unlockVault).catch(function(){setFlash("ยังโหลด Vault ไม่สำเร็จ กรุณาลองใหม่","error");});
    var pin=$("[data-vault-pin]",root).value; if(pin.length<8)return setFlash("Vault PIN ต้องมีอย่างน้อย 8 ตัวอักษร","error");
    var envelope=state.vaultEnvelope; var salt=envelope?unb64(envelope.salt):crypto.getRandomValues(new Uint8Array(16));
    vaultKey(pin,salt).then(function(key){ if(!envelope)return {travel_notes:{},model_notes:{},general_note:""}; return crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(envelope.iv)},key,unb64(envelope.ciphertext)).then(function(plain){return JSON.parse(new TextDecoder().decode(plain));}); }).then(function(data){if(state.authBlocked)return;state.vault=data;state.vaultPin=pin;state.vaultSalt=salt;state.vaultConflict=false;$("[data-vault-pin]",root).value=""; if(!state.vault.travel_notes)state.vault.travel_notes={};if(!state.vault.model_notes)state.vault.model_notes={};$("[data-vault-locked]",root).hidden=true;$("[data-vault-open]",root).hidden=false;$("[data-general-note]",root).value=state.vault.general_note||"";setFlash("Private Vault ปลดล็อกใน browser นี้แล้ว","success");hydrate(state.data);}).catch(function(){setFlash("Vault PIN ไม่ถูกต้อง หรือข้อมูลเสียหาย","error");});
  }
  function saveVault() {
    if(!state.vault||!state.vaultPin)return Promise.reject(new Error("ปลดล็อก Private Vault ก่อนบันทึก"));
    if(state.vaultConflict)return Promise.reject(new Error("Vault ถูกแก้จากอีกอุปกรณ์ กรุณาโหลดใหม่ก่อนบันทึก"));
    state.vault.general_note=$("[data-general-note]",root).value;
    var snapshot=JSON.stringify(state.vault),pin=state.vaultPin,salt=state.vaultSalt||crypto.getRandomValues(new Uint8Array(16));
    var save=state.vaultQueue.catch(function(){}).then(function(){
      if(state.vaultConflict)throw new Error("Vault ถูกแก้จากอีกอุปกรณ์ กรุณาโหลดใหม่ก่อนบันทึก");
      var iv=crypto.getRandomValues(new Uint8Array(12));
      return vaultKey(pin,salt).then(function(key){return crypto.subtle.encrypt({name:"AES-GCM",iv:iv},key,new TextEncoder().encode(snapshot));}).then(function(cipher){
        var envelope={version:1,salt:b64(salt),iv:b64(iv),ciphertext:b64(new Uint8Array(cipher))};
        return api("/v1/partner/private-vault",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({revision:state.vaultRevision,envelope:envelope})}).then(function(payload){state.vaultEnvelope=envelope;state.vaultRevision=payload.revision;state.vaultSalt=salt;setFlash("บันทึก Private Vault แล้ว · MMD อ่านไม่ได้","success");});
      }).catch(function(error){if(error.message.indexOf("อีกอุปกรณ์")!==-1)state.vaultConflict=true;throw error;});
    });state.vaultQueue=save;return save;
  }

  function load() { return api("/v1/partner/dashboard").then(hydrate).catch(function(error){$("[data-loading]",root).textContent=error.message;setFlash(error.message,"error");}); }

  ${PARTNER_OPERATIONS_JS}

  $$('[data-view]',root).forEach(function(button){button.onclick=function(){showView(button.dataset.view);};});
  $("[data-open-add]",root).onclick=function(){$("[data-add-dialog]",root).showModal();};
  $$('[data-close-dialog]',root).forEach(function(button){button.onclick=function(){button.closest("dialog").close();};});
  $("[data-model-form]",root).onsubmit=submitProfile;
  $("[data-save-sales]",root).onclick=submitSales;
  $("[data-upload-model]",root).onclick=uploadModelFile;
  $("[data-remove-model]",root).onclick=removeModel;
  $("[data-add-form]",root).onsubmit=addModel;
  $("[data-unlock-vault]",root).onclick=unlockVault;
  $("[data-save-vault]",root).onclick=function(){saveVault().catch(function(error){setFlash(error.message,"error");});};
  function refreshTelegram(){if(state.data && !state.data.partner.telegram_connected && !document.hidden)load();}
  window.addEventListener("focus", refreshTelegram);
  document.addEventListener("visibilitychange", refreshTelegram);
  $(".pcr-shell",root).hidden=true;
  setFlash("กำลังโหลดข้อมูล Partner…");
  load();
  loadVaultEnvelope().catch(function(){setFlash("Private Vault พร้อมให้ลองเปิดอีกครั้ง ตารางงานยังใช้งานได้","error");});
})();
`;

export const PARTNER_CONTROL_ROOM_CSS = String.raw`
.pcr-job-locked{display:flex;flex-direction:column;gap:4px;padding:12px 14px;border:1px solid rgba(255,230,173,.2);border-radius:14px;background:rgba(230,189,114,.07)}.pcr-job-locked b{color:var(--mmdp-gold-2)}.pcr-job-locked span{color:var(--mmdp-muted);font-size:12px}
.pcr-shell{display:grid;grid-template-columns:240px minmax(0,1fr);gap:24px;margin:0 0 48px}.pcr-side{position:sticky;top:92px;align-self:start;border:1px solid var(--mmdp-line);border-radius:26px;padding:18px;background:rgba(8,6,5,.88);backdrop-filter:blur(18px)}.pcr-side button{width:100%;min-height:46px;margin:3px 0;border:0;border-radius:14px;background:transparent;color:var(--mmdp-muted);text-align:left;font-weight:850;padding:0 14px;cursor:pointer}.pcr-side button[aria-current=page]{background:rgba(230,189,114,.14);color:#fff}.pcr-side small{display:block;color:var(--mmdp-gold);font-weight:900;letter-spacing:.14em;text-transform:uppercase;margin:8px 12px 14px}.pcr-main{min-width:0}.pcr-top{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:18px}.pcr-top h2{margin:0;color:#fff;font-size:clamp(30px,5vw,52px);letter-spacing:-.055em}.pcr-top p{margin:8px 0 0}.pcr-top button,.pcr-actions button,.pcr-model button,.pcr-dialog button,.pcr-telegram button{min-height:44px;padding:0 17px;border:1px solid rgba(255,230,173,.42);border-radius:999px;background:linear-gradient(135deg,#ffe9ac,#c7903f);color:#130c04;font-weight:950;cursor:pointer}.pcr-flash{position:sticky;top:78px;z-index:30;margin-bottom:14px;padding:13px 16px;border-radius:15px;background:#19140e;border:1px solid var(--mmdp-line);color:#fff}.pcr-flash[data-tone=error]{border-color:#a74755;background:#271014}.pcr-flash[data-tone=success]{border-color:#557c5d;background:#0f2115}.pcr-privacy{display:flex;gap:14px;align-items:flex-start;margin:0 0 18px;padding:16px 18px;border:1px solid rgba(106,197,153,.28);border-radius:20px;background:rgba(39,93,69,.12)}.pcr-privacy b{display:block;color:#c9f8da}.pcr-privacy p{margin:4px 0 0!important}.pcr-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:18px}.pcr-metrics article{padding:18px;border:1px solid var(--mmdp-line);border-radius:20px;background:rgba(255,255,255,.045)}.pcr-metrics span{display:block;color:var(--mmdp-muted);font-size:12px}.pcr-metrics strong{display:block;margin-top:8px;color:#fff;font-size:22px}.pcr-telegram{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px;padding:17px;border:1px solid var(--mmdp-line);border-radius:20px;background:rgba(255,255,255,.04)}.pcr-telegram div{display:flex;flex-direction:column;gap:4px}.pcr-telegram span{color:var(--mmdp-muted)}.pcr-telegram i{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#1f6b47;color:#fff}.pcr-section{border:1px solid rgba(255,255,255,.08);border-radius:26px;padding:22px;background:rgba(255,255,255,.035)}.pcr-section-head{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-bottom:16px}.pcr-section h3{margin:0;color:#fff}.pcr-jobs,.pcr-models{display:grid;gap:13px}.pcr-job,.pcr-model{border:1px solid rgba(255,255,255,.09);border-radius:22px;padding:18px;background:rgba(0,0,0,.2)}.pcr-job-main,.pcr-model-title{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.pcr-job h3,.pcr-model h3{margin:6px 0 0;color:#fff}.pcr-job dl{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0}.pcr-job dl div{padding:12px;border-radius:14px;background:rgba(255,255,255,.04)}.pcr-job dt{color:var(--mmdp-muted);font-size:11px}.pcr-job dd{margin:5px 0 0;color:#fff}.pcr-status,.pcr-meta span{display:inline-flex;padding:5px 9px;border:1px solid var(--mmdp-line);border-radius:999px;color:var(--mmdp-gold-2);font-size:11px;font-weight:850}.pcr-actions{display:flex;gap:8px;flex-wrap:wrap}.pcr-actions .ghost{background:transparent;color:#fff}.pcr-actions .danger{background:rgba(160,45,60,.16);border-color:rgba(220,85,104,.38);color:#ffc8d0}.pcr-private-field{display:block;margin-top:14px}.pcr-private-field span{display:block;margin-bottom:7px;color:#9ee5bd;font-size:12px}.pcr-private-field textarea,.pcr-dialog input,.pcr-dialog textarea,.pcr-dialog select,.pcr-vault input,.pcr-vault textarea{width:100%;border:1px solid rgba(255,255,255,.12);border-radius:13px;background:#090705;color:#fff;padding:12px}.pcr-model{display:grid;grid-template-columns:112px minmax(0,1fr);gap:17px}.pcr-model-image{aspect-ratio:4/5;border-radius:16px;overflow:hidden;background:linear-gradient(145deg,#332414,#0d0905);display:grid;place-items:center;color:var(--mmdp-gold);font-size:36px}.pcr-model-image img{width:100%;height:100%;object-fit:cover}.pcr-model-copy p{color:var(--mmdp-muted)}.pcr-meta{display:flex;gap:7px;flex-wrap:wrap;margin:12px 0}.pcr-switch{padding:6px 9px;border-radius:999px;background:#3c171b;color:#ffcbd1;font-size:11px;font-weight:950}.pcr-switch.is-on{background:#153c28;color:#c9f8da}.pcr-table{overflow:auto}.pcr-table table{width:100%;border-collapse:collapse;min-width:680px}.pcr-table th,.pcr-table td{padding:13px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left}.pcr-table th{color:var(--mmdp-gold);font-size:11px;text-transform:uppercase}.pcr-empty{padding:34px;text-align:center;color:var(--mmdp-muted)}.pcr-dialog{width:min(760px,calc(100% - 24px));max-height:92vh;border:1px solid var(--mmdp-line);border-radius:25px;background:#0d0a07;color:#fff;padding:0;box-shadow:0 40px 120px #000}.pcr-dialog::backdrop{background:rgba(0,0,0,.76);backdrop-filter:blur(8px)}.pcr-dialog-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;padding:18px 22px;background:#0d0a07;border-bottom:1px solid rgba(255,255,255,.08)}.pcr-dialog-head h2{margin:0}.pcr-dialog-head button{width:38px;height:38px;padding:0;background:transparent;color:#fff}.pcr-form{padding:22px}.pcr-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.pcr-form label{display:block}.pcr-form label>span{display:block;margin-bottom:7px;color:var(--mmdp-muted);font-size:12px}.pcr-form .wide{grid-column:1/-1}.pcr-form textarea{min-height:90px;resize:vertical}.pcr-form fieldset{grid-column:1/-1;border:1px solid rgba(255,255,255,.09);border-radius:17px;padding:15px}.pcr-form legend{color:var(--mmdp-gold);padding:0 6px}.pcr-checks{display:flex;flex-wrap:wrap;gap:10px}.pcr-checks label{display:flex;align-items:center;gap:7px}.pcr-form-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:18px}.pcr-form-actions .ghost{background:transparent;color:#fff}.pcr-form-actions .danger{margin-left:auto;background:#40151c;color:#ffd3d8}.pcr-consent{display:flex!important;align-items:flex-start;gap:9px;padding:14px;border:1px solid rgba(106,197,153,.28);border-radius:15px;background:rgba(39,93,69,.1)}.pcr-consent input{width:auto;margin-top:4px}.pcr-vault{max-width:720px}.pcr-vault-card{padding:20px;border:1px solid rgba(106,197,153,.28);border-radius:20px;background:rgba(39,93,69,.1)}.pcr-vault-card h3{color:#c9f8da}.pcr-vault-actions{display:flex;gap:8px;margin-top:10px}.pcr-vault-open textarea{min-height:220px}.pcr-vault code{color:#c9f8da}.pcr-nav-mobile{display:none}.pcr-loading{padding:20px;color:var(--mmdp-muted)}
@media(max-width:860px){.pcr-shell{display:block}.pcr-side{position:sticky;top:0;z-index:25;display:flex;gap:5px;overflow:auto;margin:0 -16px 16px;border-radius:0;padding:9px 16px}.pcr-side small{display:none}.pcr-side button{width:auto;white-space:nowrap;padding:0 12px}.pcr-top{align-items:flex-start;flex-direction:column}.pcr-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.pcr-job dl{grid-template-columns:1fr}.pcr-model{grid-template-columns:84px minmax(0,1fr)}.pcr-model-image{border-radius:13px}.pcr-form-grid{grid-template-columns:1fr}.pcr-form .wide,.pcr-form fieldset{grid-column:auto}.pcr-form-actions .danger{margin-left:0}}
@media(max-width:520px){.pcr-metrics{grid-template-columns:1fr 1fr}.pcr-metrics article{padding:14px}.pcr-metrics strong{font-size:18px}.pcr-section{padding:14px;border-radius:20px}.pcr-job,.pcr-model{padding:14px}.pcr-model{grid-template-columns:66px minmax(0,1fr)}.pcr-model-copy>p{font-size:13px}.pcr-dialog{width:100%;max-height:100vh;height:100vh;border-radius:0}.pcr-form{padding:16px}}
${PARTNER_OPERATIONS_CSS}
`;
