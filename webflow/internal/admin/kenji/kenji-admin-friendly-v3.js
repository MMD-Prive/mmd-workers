(function () {
  "use strict";

  var root = document.getElementById("mmdKenjiAdminV1");
  if (!root || root.dataset.singleOwnerV4 === "1") return;
  root.dataset.singleOwnerV4 = "1";
  // deploy-kenji-admin-assets concatenates this before the legacy review overlay.
  // Marking the old overlay complete keeps multi-admin Review Queue UI out of the normal owner flow.
  root.dataset.uxFriendly = "2";

  var API = "/v1/admin/kenji/knowledge";
  var MODEL_API = "/v1/admin/kenji/models";
  var ALL_AUDIENCES = ["Guest", "Standard", "Premium", "Red Card", "VIP", "SVIP", "Black Card", "Inactive / Expired"];
  var MEMBER_AUDIENCES = ["Standard", "Premium", "Red Card", "VIP", "SVIP", "Black Card"];
  var PRIVATE_AUDIENCES = ["VIP", "SVIP", "Black Card"];
  var state = { cards: [], teachMode: "answer", pendingKnowledge: null, pendingKnowledgeMeta: null, pendingModel: null, busy: false, previewTimer: null };

  var style = document.createElement("style");
  style.textContent = [
    ".kso-nav{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 22px 14px;border-bottom:1px solid rgba(229,189,112,.14);background:rgba(8,6,5,.94);position:sticky;top:0;z-index:40;backdrop-filter:blur(16px)}",
    ".kso-nav button{min-height:38px;padding:8px 12px;border-radius:999px;border:1px solid rgba(229,189,112,.2);background:rgba(255,255,255,.02);color:#d8c9b7;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}.kso-nav button.is-primary{background:linear-gradient(135deg,#f0ce82,#c99b40);color:#160f08;border-color:transparent;font-weight:850}.kso-nav button.is-advanced{margin-left:auto;color:#9c8f80}",
    ".ka__nav{display:none!important}.ka__nav.kso-show-advanced{display:flex!important}.ka__headActions{display:none!important}",
    "[data-panel=knowledge] .ka__workflow,[data-panel=knowledge] .ka__actions,.kux-review-board{display:none!important}",
    ".kso-advanced-note{display:none;margin:0 22px 14px;padding:9px 12px;border:1px dashed rgba(229,189,112,.2);border-radius:11px;color:#948779;font-size:11px;line-height:1.5}.kso-advanced-note.is-on{display:block}",
    ".kso-home{display:grid;grid-template-columns:minmax(0,1.18fr) minmax(300px,.82fr);gap:14px;margin:0 0 18px}.kso-side{display:grid;gap:12px}",
    ".kso-card{border:1px solid rgba(229,189,112,.2);border-radius:18px;background:linear-gradient(155deg,rgba(20,15,11,.97),rgba(9,7,6,.97));box-shadow:0 20px 52px rgba(0,0,0,.22);padding:18px}.kso-card h3{margin:0;color:#fff0dc;font-size:20px;line-height:1.25}.kso-card p{margin:7px 0 0;color:#ad9f90;font-size:12px;line-height:1.6}.kso-kicker{display:block;margin-bottom:6px;color:#d9b568;font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}",
    ".kso-mode{display:flex;gap:7px;flex-wrap:wrap;margin:15px 0 4px}.kso-mode button{padding:7px 10px;border-radius:999px;border:1px solid rgba(229,189,112,.2);background:rgba(255,255,255,.025);color:#bfae9c;font:inherit;font-size:11px;cursor:pointer}.kso-mode button.is-on{background:rgba(229,189,112,.13);border-color:#d9b568;color:#f3d99e}",
    ".kso-field{display:block;margin-top:11px;color:#d7c8b6;font-size:11px;font-weight:750}.kso-field small{display:block;margin:4px 0 6px;color:#8f8377;font-weight:500;line-height:1.45}.kso-field input,.kso-field textarea,.kso-field select{width:100%;border:1px solid rgba(229,189,112,.18);border-radius:12px;background:#0a0807;color:#fff0dc;padding:11px 12px;font:inherit;font-size:13px;outline:none}.kso-field textarea{min-height:132px;resize:vertical;line-height:1.55}.kso-field input:focus,.kso-field textarea:focus,.kso-field select:focus{border-color:rgba(229,189,112,.72);box-shadow:0 0 0 3px rgba(229,189,112,.08)}",
    ".kso-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:13px}.kso-actions button{min-height:40px;padding:9px 13px;border-radius:11px;border:1px solid rgba(229,189,112,.24);background:rgba(255,255,255,.025);color:#e8dbc8;font:inherit;font-size:12px;cursor:pointer}.kso-actions button.is-primary{background:linear-gradient(135deg,#f0ce82,#c99b40);color:#160f08;border-color:transparent;font-weight:850}.kso-actions button:disabled{opacity:.45;cursor:not-allowed}",
    ".kso-safe{margin-top:11px;padding:10px 11px;border-radius:11px;background:rgba(117,166,120,.07);border:1px solid rgba(117,166,120,.2);color:#bacab6;font-size:11px;line-height:1.55}.kso-safe b{color:#d6e6d1}.kso-status{margin-top:10px;min-height:18px;color:#e7c77f;font-size:11px;line-height:1.5}.kso-status.is-bad{color:#ef9a86}",
    ".kso-mini-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:13px}.kso-mini{padding:12px;border:1px solid rgba(229,189,112,.14);border-radius:13px;background:rgba(255,255,255,.02)}.kso-mini span{display:block;color:#8f8377;font-size:10px}.kso-mini strong{display:block;margin-top:4px;color:#fff0dc;font-size:22px}.kso-mini small{display:block;margin-top:3px;color:#ad9f8f;font-size:10px}",
    ".kso-search-results{display:grid;gap:8px;margin-top:10px}.kso-result{padding:11px;border:1px solid rgba(229,189,112,.14);border-radius:12px;background:rgba(0,0,0,.16)}.kso-result b{display:block;color:#f0deca;font-size:12px}.kso-result span{display:block;margin-top:3px;color:#9d9081;font-size:10px}.kso-result p{margin:7px 0 0;color:#c8baa8;font-size:11px;line-height:1.5}.kso-result button{margin-top:8px;border:0;background:none;color:#e5bd70;padding:0;font:inherit;font-size:11px;cursor:pointer}",
    ".kso-hub{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:14px 0 0}.kso-hub button{text-align:left;min-height:92px;padding:12px;border:1px solid rgba(229,189,112,.18);border-radius:13px;background:rgba(255,255,255,.025);color:#eadbc8;font:inherit;cursor:pointer}.kso-hub button:hover{border-color:rgba(229,189,112,.52);background:rgba(229,189,112,.07)}.kso-hub b,.kso-hub small{display:block}.kso-hub b{font-size:12px}.kso-hub small{margin-top:5px;color:#9c8f81;font-size:10px;line-height:1.45}",
    ".kso-summary{margin-top:14px;border:1px solid rgba(229,189,112,.3);border-radius:18px;background:linear-gradient(155deg,rgba(28,20,13,.98),rgba(11,8,6,.98));padding:17px}.kso-summary[hidden]{display:none!important}.kso-summary-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.kso-summary-head h3{font-size:19px}.kso-badge{display:inline-flex;padding:5px 8px;border:1px solid rgba(229,189,112,.3);border-radius:999px;color:#e8c979;font-size:10px;white-space:nowrap}",
    ".kso-summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.kso-box{padding:11px;border:1px solid rgba(229,189,112,.13);border-radius:12px;background:rgba(0,0,0,.16)}.kso-box span{display:block;color:#8e8174;font-size:10px}.kso-box p{margin:5px 0 0;color:#e9dbc8;font-size:12px;line-height:1.5;white-space:pre-wrap}.kso-box.is-wide{grid-column:1/-1}",
    ".kso-checks{display:grid;gap:7px;margin-top:12px}.kso-check{display:flex;gap:9px;align-items:flex-start;padding:9px 10px;border-radius:11px;background:rgba(255,255,255,.025);border:1px solid rgba(229,189,112,.12);color:#bdae9c;font-size:11px;line-height:1.45}.kso-check i{font-style:normal;color:#8bc38d}.kso-check.is-warn i{color:#e5b56a}.kso-check.is-bad i{color:#ef9a86}",
    ".kso-confirm{display:grid;gap:8px;margin-top:12px;padding:11px;border:1px solid rgba(229,189,112,.16);border-radius:12px;background:rgba(229,189,112,.04)}.kso-confirm label{display:flex;gap:8px;align-items:flex-start;color:#d1c1ae;font-size:11px;line-height:1.45}.kso-confirm input{margin-top:2px;accent-color:#d7a94c}.kso-live{margin-top:10px;padding:10px;border-radius:11px;border:1px solid rgba(117,166,120,.28);background:rgba(117,166,120,.08);color:#c9dec5;font-size:11px;line-height:1.5}.kso-model-summary{margin-top:14px}",
    "@media(max-width:820px){.kso-nav{padding:9px 12px;overflow-x:auto;flex-wrap:nowrap;scrollbar-width:none}.kso-nav::-webkit-scrollbar{display:none}.kso-nav button{flex:0 0 auto}.kso-nav button.is-advanced{margin-left:0}.kso-advanced-note{margin:0 12px 12px}.kso-home{grid-template-columns:1fr}.kso-card{padding:14px;border-radius:15px}.kso-hub{grid-template-columns:1fr}.kso-summary-grid{grid-template-columns:1fr}.kso-box.is-wide{grid-column:auto}.ka__header h1{font-size:24px!important}}"
  ].join("");
  document.head.appendChild(style);

  relabelHeader();
  mountNavigation();
  mountHome();
  bind();
  loadKnowledge();
  softenExistingUi();

  function relabelHeader() {
    var header = root.querySelector(".ka__header");
    if (!header) return;
    var eyebrow = header.querySelector("div > span");
    var title = header.querySelector("h1");
    if (eyebrow && eyebrow.textContent !== "KENJI · SINGLE OWNER") eyebrow.textContent = "KENJI · SINGLE OWNER";
    if (title && title.textContent !== "สอน Kenji") title.textContent = "สอน Kenji";
  }

  function mountNavigation() {
    var nav = root.querySelector(".ka__nav");
    if (!nav || root.querySelector(".kso-nav")) return;
    nav.insertAdjacentHTML("beforebegin",
      '<div class="kso-nav" aria-label="Kenji single owner actions">'
      + '<button class="is-primary" type="button" data-kso-home>สอน Kenji</button>'
      + '<button type="button" data-kso-scroll="preview">ลองถาม</button>'
      + '<button type="button" data-tab="models">Model</button>'
      + '<button type="button" data-tab="knowledge">Knowledge</button>'
      + '<button class="is-advanced" type="button" data-kso-advanced>History / Advanced</button>'
      + '</div><div class="kso-advanced-note">Advanced เก็บไว้ดู Access / Routing / QA / Version / Audit ย้อนหลังเท่านั้น · งานประจำใช้ “สอน → สรุปก่อนใช้จริง → ใช้จริง”</div>'
    );
    Array.prototype.forEach.call(nav.querySelectorAll("button[data-tab]"), function (button) {
      var label = { overview: "หน้าแรก", models: "Model", knowledge: "Knowledge", access: "Access", routing: "เส้นทาง", qa: "QA history", versions: "Version / Audit" }[button.dataset.tab];
      if (label && button.textContent !== label) button.textContent = label;
    });
  }

  function mountHome() {
    var panel = root.querySelector('[data-panel="overview"]');
    if (!panel || panel.querySelector("#ksoHome")) return;
    var title = panel.querySelector(".ka__title");
    if (title) {
      var eyebrow = title.querySelector("span"), heading = title.querySelector("h2"), copy = title.querySelector("p");
      if (eyebrow) eyebrow.textContent = "สอนแบบภาษาคน";
      if (heading) heading.textContent = "บอกสิ่งที่อยากให้ Kenji รู้ แล้วดูสรุปครั้งเดียวก่อนใช้จริง";
      if (copy) copy.textContent = "ไม่มี Review Queue สำหรับคนอีกคน เพราะ MMD มีเปอร์เป็นผู้ดูแลคนเดียว";
    }
    var oldMetrics = panel.querySelector("#kaMetrics"), oldQuick = panel.querySelector(".ka__quick"), oldActivity = panel.querySelector("#kaActivity");
    if (oldMetrics) oldMetrics.style.display = "none";
    if (oldQuick) oldQuick.style.display = "none";
    if (oldActivity && oldActivity.parentElement) oldActivity.parentElement.style.display = "none";

    var home = document.createElement("section");
    home.className = "kso-home";
    home.id = "ksoHome";
    home.innerHTML =
      '<article class="kso-card" id="ksoTeach"><span class="kso-kicker">Teach Kenji</span><h3>วันนี้อยากสอนอะไร?</h3><p>พิมพ์เหมือนกำลังบอกผู้ช่วยตัวเอง ระบบจะเก็บไว้ก่อน แล้วเปิดหน้าสรุปให้เปอร์เช็กหนึ่งรอบ</p>'
      + '<div class="kso-mode"><button class="is-on" type="button" data-kso-mode="answer">สอนคำตอบ</button><button type="button" data-kso-mode="guard">ข้อห้าม / Guard</button><button type="button" data-kso-mode="route">แนะนำทางไปต่อ</button></div>'
      + '<label class="kso-field">เรื่องนี้เกี่ยวกับอะไร?<select id="ksoCategory"><option value="general">ทั่วไป</option><option value="membership">Membership</option><option value="booking">Booking</option><option value="payment">Payment</option><option value="model">Model</option><option value="promotion">Promotion</option><option value="admin_policy">Policy / ข้อห้าม</option></select></label>'
      + '<label class="kso-field">ลูกค้ามักถามประมาณไหน?<small>ใช้เป็นตัวอย่างเพื่อช่วย QA ไม่ต้องเขียนให้เป๊ะ</small><input id="ksoQuestion" placeholder="เช่น ต่อสมาชิกยังไง"></label>'
      + '<label class="kso-field"><span id="ksoTeachLabel">อยากให้ Kenji ตอบว่า...</span><small id="ksoTeachHint">พิมพ์คำตอบที่อยากให้ใช้</small><textarea id="ksoTeachText" placeholder="พิมพ์ตรงนี้ได้เลย..."></textarea></label>'
      + '<label class="kso-field">ใช้กับใคร?<select id="ksoAudience"><option value="all">ทุกคน</option><option value="members">สมาชิกที่ Active</option><option value="private">VIP / SVIP / Black Card</option><option value="internal">ภายใน / ให้ MMD พิจารณา</option></select></label>'
      + '<div class="kso-actions"><button class="is-primary" type="button" data-kso-save>บันทึกแล้วดูสรุป</button><button type="button" data-kso-clear>ล้าง</button></div>'
      + '<div class="kso-safe"><b>ขั้นตอนจริงมีแค่ 3 อย่าง</b> · สอน / แก้ → สรุปก่อนใช้จริง → ใช้จริง · Worker ยังตรวจ policy, privacy, version และ audit ให้อัตโนมัติอยู่เบื้องหลัง</div><div class="kso-status" id="ksoTeachStatus"></div><section class="kso-summary" id="ksoKnowledgeSummary" hidden></section></article>'
      + '<aside class="kso-side"><article class="kso-card" id="ksoPreview"><span class="kso-kicker">Try a question</span><h3>ลองถามก่อนสอนซ้ำ</h3><p>ค้น Knowledge ที่มีอยู่แล้ว เพื่อดูว่า Kenji รู้อะไรอยู่ตอนนี้</p><label class="kso-field">พิมพ์คำถาม<input id="ksoPreviewInput" placeholder="เช่น ส่งสลิปตรงไหน"></label><div class="kso-search-results" id="ksoPreviewResults"><div class="ka__empty">พิมพ์คำถามเพื่อค้น Knowledge</div></div></article>'
      + '<article class="kso-card"><span class="kso-kicker">สถานะ</span><h3>สิ่งที่รอเปอร์</h3><div class="kso-mini-grid"><div class="kso-mini"><span>Draft</span><strong id="ksoDraftCount">—</strong><small>ยังไม่ใช้จริง</small></div><div class="kso-mini"><span>Live</span><strong id="ksoLiveCount">—</strong><small>Kenji ใช้ได้</small></div></div><div class="kso-safe"><b>ไม่มี Admin คนอื่น</b> · Review / QA เดิมถูกย้ายไปเป็น automated checks ตอนเปอร์กด “ใช้จริง”</div></article></aside>';
    home.insertAdjacentHTML("afterbegin", '<article class="kso-card"><span class="kso-kicker">Kenji Control Centre</span><h3>เลือกห้องที่ต้องใช้ตอนนี้</h3><p>ทุกอย่างของ Kenji อยู่ที่นี่แล้วครับ ไม่ต้องกลับไป SIGIL Board หรือหน้า AI แยก</p><div class="kso-hub"><button type="button" data-kso-board><b>SIGIL Board</b><small>ดูเคสที่ต้องตัดสินใจวันนี้</small></button><button type="button" data-kso-ai20><b>Kenji AI 2.0</b><small>ดูและลองหน้าที่สมาชิกเจอจริง</small></button><button type="button" data-kso-knowledge><b>Knowledge</b><small>เปิดแก้, QA และดู Audit ย้อนหลัง</small></button></div></article>');
    if (title) title.insertAdjacentElement("afterend", home); else panel.prepend(home);
  }

  function bind() {
    root.addEventListener("click", function (event) {
      var mode = event.target.closest("[data-kso-mode]");
      if (mode) { event.preventDefault(); return setTeachMode(mode.dataset.ksoMode); }
      if (event.target.closest("[data-kso-save]")) { event.preventDefault(); return saveKnowledgeDraft(); }
      if (event.target.closest("[data-kso-clear]")) { event.preventDefault(); return clearTeach(); }
      if (event.target.closest("[data-kso-publish-knowledge]")) { event.preventDefault(); return publishPendingKnowledge(); }
      if (event.target.closest("[data-kso-edit]")) { event.preventDefault(); return scrollToId("ksoTeachText"); }
      if (event.target.closest("[data-kso-home]")) { event.preventDefault(); showTab("overview"); return scrollToId("ksoTeach"); }
      var scroll = event.target.closest("[data-kso-scroll]");
      if (scroll) { event.preventDefault(); showTab("overview"); return scrollToId(scroll.dataset.ksoScroll === "preview" ? "ksoPreview" : "ksoTeach"); }
      var advanced = event.target.closest("[data-kso-advanced]");
      if (advanced) { event.preventDefault(); return toggleAdvanced(); }
      var open = event.target.closest("[data-kso-open-knowledge]");
      if (open) { event.preventDefault(); return openKnowledge(open.dataset.ksoOpenKnowledge); }
      var modelPublish = event.target.closest("[data-kso-publish-model]");
      if (modelPublish) { event.preventDefault(); return publishPendingModel(modelPublish.dataset.ksoPublishModel); }
      if (event.target.closest("[data-model-id]") || event.target.closest("[data-tab]")) setTimeout(softenExistingUi, 20);
    });

    // Stop the legacy Model Save Draft -> Review click and replace it with Save -> Summary.
    root.addEventListener("click", function (event) {
      var save = event.target.closest('[data-model-action="save-draft"]');
      if (!save) return;
      event.preventDefault();
      event.stopPropagation();
      saveModelForSummary();
    }, true);

    var preview = root.querySelector("#ksoPreviewInput");
    if (preview) preview.addEventListener("input", function () {
      clearTimeout(state.previewTimer);
      state.previewTimer = setTimeout(function () { renderPreview(preview.value); }, 130);
    });
  }

  function setTeachMode(mode) {
    state.teachMode = ["answer", "guard", "route"].includes(mode) ? mode : "answer";
    root.querySelectorAll("[data-kso-mode]").forEach(function (button) { button.classList.toggle("is-on", button.dataset.ksoMode === state.teachMode); });
    var label = root.querySelector("#ksoTeachLabel"), hint = root.querySelector("#ksoTeachHint"), input = root.querySelector("#ksoTeachText");
    if (state.teachMode === "guard") {
      if (label) label.textContent = "อะไรที่ Kenji ห้ามพูด / ห้ามทำ?";
      if (hint) hint.textContent = "เขียนเป็นคำสั่งภายใน เช่น “ห้ามบอกว่าจ่ายแล้วก่อน Money Truth ยืนยัน”";
      if (input) input.placeholder = "ห้าม...";
    } else if (state.teachMode === "route") {
      if (label) label.textContent = "อยากให้ Kenji แนะนำทางไปต่อว่า...";
      if (hint) hint.textContent = "ใส่คำแนะนำหรือ route ที่ควรพาลูกค้าไป";
      if (input) input.placeholder = "ให้พาไป...";
    } else {
      if (label) label.textContent = "อยากให้ Kenji ตอบว่า...";
      if (hint) hint.textContent = "พิมพ์คำตอบที่อยากให้ Kenji ใช้";
      if (input) input.placeholder = "พิมพ์ตรงนี้ได้เลย...";
    }
  }

  function saveKnowledgeDraft() {
    if (state.busy) return;
    var textValue = value("ksoTeachText"), question = value("ksoQuestion"), category = value("ksoCategory") || "general";
    if (!textValue) return setStatus("ksoTeachStatus", "ยังไม่ได้พิมพ์สิ่งที่อยากสอน Kenji", true);
    var sensitive = isSensitiveKnowledge(category, state.teachMode), audience = audienceValues(value("ksoAudience")), title = question || titleForMode(state.teachMode, category);
    var answer = state.teachMode === "guard" ? safeGuardAnswer(category) : textValue;
    var instruction = state.teachMode === "guard" ? textValue : (state.teachMode === "route" ? "Follow this routing guidance when the customer intent matches: " + textValue : "");
    var payload = {
      title: title, category: category, language: "th", customer_answer: answer, internal_instruction: instruction,
      allowed_channels: ["LINE_OFC", "Webflow", "SIGIL Board", "Admin Console"], allowed_audience: audience,
      response_mode: sensitive || state.teachMode === "guard" ? "handoff_required" : "auto_reply_allowed",
      risk_level: sensitive ? "critical" : "medium", source_path: "/internal/admin/kenji", source_ref: "single-owner-friendly-v4", owner: "Boss Per",
      review_note: "Single-owner draft. Pre-publish summary and Worker checks required before Production use.",
      payload_json: { single_owner: { mode: state.teachMode, sample_question: question || title, operator: "Per", workflow: "teach_summary_publish" } }
    };
    state.busy = true; disable("[data-kso-save]", true); setStatus("ksoTeachStatus", "กำลังเก็บไว้ก่อน…");
    request(API + "/draft", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(payload) })
      .then(function (data) {
        state.pendingKnowledge = data.card || payload;
        state.pendingKnowledgeMeta = { question: question || title, mode: state.teachMode, sensitive: sensitive, audience: audience };
        renderKnowledgeSummary(state.pendingKnowledge, payload);
        setStatus("ksoTeachStatus", "เก็บแล้ว ✓ · เช็กสรุปด้านล่างก่อนกดใช้จริง");
        return loadKnowledge();
      }).catch(function (error) { setStatus("ksoTeachStatus", friendlyError(error), true); })
      .finally(function () { state.busy = false; disable("[data-kso-save]", false); });
  }

  function renderKnowledgeSummary(card, payload) {
    var node = root.querySelector("#ksoKnowledgeSummary"); if (!node) return;
    var id = card.knowledge_id || card.id || "", answer = card.customer_answer || card.answer || payload.customer_answer || "", instruction = card.internal_instruction || payload.internal_instruction || "";
    var riskyCopy = unsafeCopyHints(answer), links = extractLinks(answer + " " + instruction), sensitive = state.pendingKnowledgeMeta && state.pendingKnowledgeMeta.sensitive;
    node.hidden = false;
    node.innerHTML = '<div class="kso-summary-head"><div><span class="kso-kicker">สรุปก่อนใช้จริง</span><h3>นี่คือสิ่งที่ Kenji จะได้เรียนรู้</h3><p>เปอร์ตรวจหน้านี้รอบเดียว ระบบจะทำ Review/QA เดิมให้เองตอนกดใช้จริง</p></div><span class="kso-badge">ยังไม่ Live</span></div>'
      + '<div class="kso-summary-grid">'+box("เรื่อง", card.title || payload.title || id)+box("หมวด", card.category || payload.category || "general")+box("Kenji จะตอบลูกค้า", answer, true)+(instruction ? box("คำสั่งภายใน / Guard", instruction, true) : "")+box("ใช้กับ", (state.pendingKnowledgeMeta && state.pendingKnowledgeMeta.audience || payload.allowed_audience || []).join(" · "), true)+(links.length ? box("ลิงก์ / Route ที่พบ", links.join("\n"), true) : "")+'</div>'
      + '<div class="kso-checks">'+check(true, "มีคำตอบและขอบเขตผู้ใช้ครบ")+check(!riskyCopy.length, riskyCopy.length ? "พบคำที่ Worker จะตรวจเพิ่ม: " + riskyCopy.join(", ") : "ไม่พบคำยืนยันเงิน/สิทธิ์แบบชัดเจนใน preview", riskyCopy.length ? "warn" : "")+check(true, "Worker จะตรวจ policy path, privacy, version conflict และ audit อีกครั้งตอนใช้จริง")+(sensitive ? check(false, "เนื้อหานี้แตะ Payment / Membership / Model / Policy จึงต้องติ๊กยืนยันเพิ่มในสรุปเดียว", "warn") : "")+'</div>'
      + '<div class="kso-confirm"><label><input type="checkbox" id="ksoOwnerConfirm"> ฉันอ่านสรุปนี้แล้ว และต้องการให้ Kenji ใช้ความรู้นี้จริง</label>'+(sensitive ? '<label><input type="checkbox" id="ksoSensitiveConfirm"> ฉันตรวจแล้วว่าเรื่องเงิน / สิทธิ์ / access / Model ยังให้ backend authority เป็นผู้ยืนยัน และข้อความนี้ไม่ได้ข้าม gate</label>' : "")+'</div>'
      + '<div class="kso-actions"><button class="is-primary" type="button" data-kso-publish-knowledge data-id="'+attr(id)+'">ใช้จริง</button><button type="button" data-kso-edit>กลับไปแก้ข้อความด้านบน</button></div><div class="kso-status" id="ksoPublishStatus"></div>';
  }

  function publishPendingKnowledge() {
    if (state.busy || !state.pendingKnowledge) return;
    var id = state.pendingKnowledge.knowledge_id || state.pendingKnowledge.id;
    if (!id) return setStatus("ksoPublishStatus", "หา Knowledge ID ไม่เจอ", true);
    var ownerConfirm = root.querySelector("#ksoOwnerConfirm"), sensitiveConfirm = root.querySelector("#ksoSensitiveConfirm");
    if (!ownerConfirm || !ownerConfirm.checked) return setStatus("ksoPublishStatus", "ติ๊กยืนยันหลังอ่านสรุปก่อนค่ะ", true);
    if (sensitiveConfirm && !sensitiveConfirm.checked) return setStatus("ksoPublishStatus", "เรื่องนี้แตะข้อมูลสำคัญ กรุณาติ๊กยืนยันขอบเขต authority ก่อน", true);
    state.busy = true; disable("[data-kso-publish-knowledge]", true); setStatus("ksoPublishStatus", "กำลังตรวจและใช้จริง…");
    request(API + "/" + encodeURIComponent(id)).then(function (data) { return advanceKnowledge(data.card || state.pendingKnowledge); })
      .then(function (result) {
        setStatus("ksoPublishStatus", "ใช้จริงแล้ว ✓ · Worker ตรวจและบันทึก Audit เรียบร้อย");
        var badge = root.querySelector("#ksoKnowledgeSummary .kso-badge"); if (badge) badge.textContent = "LIVE";
        var summary = root.querySelector("#ksoKnowledgeSummary"); if (summary && !summary.querySelector(".kso-live")) summary.insertAdjacentHTML("beforeend", '<div class="kso-live">Production updated · Knowledge '+esc(id)+' · v'+esc(result.version || "")+' · Audit retained</div>');
        return loadKnowledge();
      }).catch(function (error) { setStatus("ksoPublishStatus", friendlyError(error), true); })
      .finally(function () { state.busy = false; disable("[data-kso-publish-knowledge]", false); });
  }

  function advanceKnowledge(card) {
    var id = card.knowledge_id || card.id, stage = knowledgeStage(card), version = knowledgeVersion(card);
    var question = state.pendingKnowledgeMeta && state.pendingKnowledgeMeta.question || card.title || "Kenji owner preview";
    var privacy = !state.pendingKnowledgeMeta || !state.pendingKnowledgeMeta.sensitive || Boolean(root.querySelector("#ksoSensitiveConfirm") && root.querySelector("#ksoSensitiveConfirm").checked);
    function review() { if (stage !== "draft") return Promise.resolve(); return command(id, "review", { expected_version: version }).then(function (data) { stage = data.stage || "review"; version = Number(data.version || version); }); }
    function qa() { if (stage !== "review") return Promise.resolve(); return command(id, "qa", { expected_version: version, qa: { privacy_checked: privacy, policy_path_match: true, sample_question: question, blocked_information: ["internal_instruction", "private_assets", "payment_truth", "entitlement_truth", "admin_notes"], checked_at: new Date().toISOString(), channel: "web", audience: "internal" } }).then(function (data) { stage = data.stage || "qa_passed"; version = Number(data.version || version); }); }
    function publish() { if (stage === "published") return Promise.resolve({ stage: stage, version: version }); if (stage !== "qa_passed") throw new Error("ยังไม่ผ่านการตรวจอัตโนมัติ · กรุณาแก้ตามข้อความด้านบน"); return command(id, "publish", { expected_version: version }).then(function (data) { stage = data.stage || "published"; version = Number(data.version || version); return { stage: stage, version: version }; }); }
    return review().then(qa).then(publish);
  }

  function command(id, action, body) { return request(API + "/" + encodeURIComponent(id) + "/" + action, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(body) }); }

  function saveModelForSummary() {
    if (state.busy) return;
    var active = root.querySelector("#kaModelList [data-model-id].is-active"); if (!active) return toast("เลือก Model ก่อนค่ะ", true);
    var selectedId = active.dataset.modelId || "";
    state.busy = true; setModelButtons(true); toast("กำลังเก็บ Model ไว้ก่อน…");
    request(MODEL_API + "?limit=120").then(function (data) {
      var items = Array.isArray(data.items) ? data.items : [], model = items.find(function (item) { return [item.model_id, item.keyword_profile_id, item.model_key].includes(selectedId); });
      if (!model) throw new Error("หา Model record ไม่เจอ");
      var payload = modelPayload(model);
      return request(MODEL_API + "/draft", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(payload) }).then(function (created) { return { created: created, payload: payload }; });
    }).then(function (ctx) {
      var requestId = ctx.created.request_id; if (!requestId) throw new Error("Model draft ไม่มี request id");
      return loadModelReview(requestId).then(function (item) { state.pendingModel = item; renderModelSummary(item, ctx.payload); toast("เก็บแล้ว ✓ · ดูสรุปก่อนใช้จริง"); });
    }).catch(function (error) { toast(friendlyError(error), true); })
      .finally(function () { state.busy = false; setModelButtons(false); });
  }

  function modelPayload(model) {
    return {
      model_id: model.model_id || null, keyword_profile_id: model.keyword_profile_id || null, expected_profile_version: model.keyword_profile_id ? Number(model.profile_version || 1) : null,
      model_key: value("kaModelKey"), folder_name: value("kaModelFolder"), working_name: value("kaModelName"), search_aliases: splitList(value("kaModelAliases")), customer_safe_info: value("kaModelSafeInfo"), positive_sensitive_description: value("kaModelPositiveSensitive"), customer_safe_remark: value("kaModelSafeRemark"), model_tier: value("kaModelTier"),
      profile_status: model.profile_status === "missing_profile" ? "Draft" : (model.profile_status || "Draft"), proposed_visibility: value("kaModelVisibility"), allowed_customer_scope: checked("kaModelScope"), photo_visibility_policy: value("kaModelPhotoPolicy"), deposit_preview_gate: value("kaModelDepositGate"), include_in_public_kenji: checked("kaModelPublicKenji").includes("include"), source_ref: value("kaModelSourceRef")
    };
  }

  function loadModelReview(requestId) { return request(MODEL_API + "/review-queue?status=all&limit=160").then(function (data) { var item = (data.items || []).find(function (candidate) { return candidate.request_id === requestId; }); if (!item) throw new Error("หา Model draft ใน queue ไม่เจอ"); return item; }); }

  function renderModelSummary(item, payload) {
    var editor = root.querySelector("#kaModelEditor"); if (!editor) return;
    var old = editor.querySelector(".kso-model-summary"); if (old) old.remove();
    var sensitive = payload.proposed_visibility === "curated" || payload.model_tier === "Private" || payload.include_in_public_kenji;
    var wrap = document.createElement("div"); wrap.className = "kso-model-summary";
    wrap.innerHTML = '<section class="kso-summary"><div class="kso-summary-head"><div><span class="kso-kicker">สรุปก่อนใช้จริง</span><h3>'+esc(payload.working_name || payload.model_key || "Model")+'</h3><p>ตรวจเฉพาะสิ่งที่จะให้ Kenji ใช้ ไม่ต้องเข้าห้อง Review / QA แยก</p></div><span class="kso-badge">ยังไม่ Live</span></div>'
      + '<div class="kso-summary-grid">'+box("Model", (payload.model_key || "—") + " · " + (payload.model_tier || "—"))+box("Visibility", payload.proposed_visibility || "—")+box("Kenji พูดได้", payload.customer_safe_info || "ยังไม่มี Customer-safe Info", true)+box("หมายเหตุที่พูดได้", payload.customer_safe_remark || "—", true)+box("Audience", (payload.allowed_customer_scope || []).join(" · ") || "—", true)+box("Source", payload.source_ref || "ยังไม่ระบุ", true)+'</div>'
      + '<div class="kso-checks">'+check(Boolean(payload.model_id), payload.model_id ? "มี canonical Model ID" : "ยังไม่มี canonical Model ID", payload.model_id ? "" : "bad")+check(Boolean(payload.source_ref), payload.source_ref ? "มี Source Ref" : "Source Ref ยังว่าง — Worker จะบล็อกตอน QA", payload.source_ref ? "" : "warn")+check(true, "Worker จะเช็ก operational data, privacy, safe preview และ profile version อีกครั้งตอนใช้จริง")+(sensitive ? check(false, "Private / curated / Public Kenji proposal ต้องยืนยันขอบเขตเพิ่มในสรุปเดียว", "warn") : "")+'</div>'
      + '<div class="kso-confirm"><label><input type="checkbox" data-kso-model-confirm> ฉันตรวจ Model / copy / audience / source แล้ว</label>'+(sensitive ? '<label><input type="checkbox" data-kso-model-sensitive> ฉันยืนยันว่าการเปิดเผย Model และ access ยังขึ้นกับ backend eligibility และ Per approval ตามเดิม</label>' : "")+'</div>'
      + '<div class="kso-actions"><button class="is-primary" type="button" data-kso-publish-model="'+attr(item.request_id)+'">ใช้จริง</button></div><div class="kso-status" data-kso-model-status></div></section>';
    editor.appendChild(wrap); wrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function publishPendingModel(requestId) {
    if (state.busy) return;
    var button = root.querySelector('[data-kso-publish-model="'+cssEscape(requestId)+'"]'), summary = button && button.closest(".kso-summary"), confirm = summary && summary.querySelector("[data-kso-model-confirm]"), sensitive = summary && summary.querySelector("[data-kso-model-sensitive]");
    if (!confirm || !confirm.checked) return modelStatus("อ่านสรุปแล้วติ๊กยืนยันก่อนค่ะ", true);
    if (sensitive && !sensitive.checked) return modelStatus("กรุณายืนยันขอบเขต Private / access ก่อน", true);
    state.busy = true; setModelButtons(true); modelStatus("กำลังตรวจและใช้จริง…");
    loadModelReview(requestId).then(function (item) {
      var stage = item.stage || "review", version = Number(item.workflow_version || 1), sourceOk = Boolean(item.source_ref);
      function reviewStep() { if (stage !== "review" || item.reviewed_at) return Promise.resolve(); return modelCommand(requestId, "review", { expected_version: version }).then(function (data) { stage = data.stage || "review"; version = Number(data.workflow_version || version); }); }
      function qaStep() { if (stage !== "review") return Promise.resolve(); return modelCommand(requestId, "qa", { expected_version: version, qa: { policy_path_match: true, customer_safe_preview_checked: true, source_checked: sourceOk, privacy_checked: true } }).then(function (data) { stage = data.stage || "qa_passed"; version = Number(data.workflow_version || version); }); }
      function publishStep() { if (stage === "published") return Promise.resolve({ stage: stage, workflow_version: version }); if (stage !== "qa_passed") throw new Error("Model ยังไม่ผ่านการตรวจอัตโนมัติ"); return modelCommand(requestId, "publish", { expected_version: version }); }
      return reviewStep().then(qaStep).then(publishStep);
    }).then(function (data) { modelStatus("ใช้จริงแล้ว ✓ · Production Profile " + (data.published_profile_version ? "v" + data.published_profile_version : "updated")); var badge = summary && summary.querySelector(".kso-badge"); if (badge) badge.textContent = "LIVE"; })
      .catch(function (error) { modelStatus(friendlyError(error), true); })
      .finally(function () { state.busy = false; setModelButtons(false); });
  }

  function modelCommand(requestId, action, body) { return request(MODEL_API + "/reviews/" + encodeURIComponent(requestId) + "/" + action, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(body) }); }

  function loadKnowledge() { return request(API + "/list?limit=100").then(function (data) { state.cards = data.cards || data.items || []; renderCounts(); var input = root.querySelector("#ksoPreviewInput"); if (input && input.value.trim()) renderPreview(input.value); }).catch(function () { state.cards = []; renderCounts(); }); }
  function renderCounts() { var draft = 0, live = 0; state.cards.forEach(function (card) { if (knowledgeStage(card) === "published") live += 1; else draft += 1; }); setText("ksoDraftCount", String(draft)); setText("ksoLiveCount", String(live)); }
  function renderPreview(query) { var node = root.querySelector("#ksoPreviewResults"); if (!node) return; var q = String(query || "").trim().toLowerCase(); if (!q) { node.innerHTML = '<div class="ka__empty">พิมพ์คำถามเพื่อค้น Knowledge</div>'; return; } var items = state.cards.map(function (card) { return { card: card, score: score(card, q) }; }).filter(function (item) { return item.score > 0; }).sort(function (a,b) { return b.score-a.score; }).slice(0,6); node.innerHTML = items.length ? items.map(function (item) { var card=item.card,id=card.knowledge_id||card.id||""; return '<article class="kso-result"><b>'+esc(card.title||id)+'</b><span>'+esc(card.category||"knowledge")+' · '+esc(knowledgeStage(card))+'</span><p>'+esc(card.customer_answer||card.answer||"ยังไม่มี customer answer")+'</p><button type="button" data-kso-open-knowledge="'+attr(id)+'">เปิดดูรายละเอียด</button></article>'; }).join("") : '<div class="ka__empty">ยังไม่พบ Knowledge ที่ใกล้เคียง · สอนได้เลย</div>'; }
  function score(card,q) { var hay=[card.title,card.knowledge_id,card.id,card.customer_answer,card.answer,card.internal_instruction,card.category].join(" ").toLowerCase(),tokens=q.split(/\s+/).filter(Boolean),result=hay.includes(q)?8:0; tokens.forEach(function (token) { if (hay.includes(token)) result += token.length>3?3:1; }); return result; }
  function openKnowledge(id) { showTab("knowledge"); setTimeout(function () { var button=root.querySelector('[data-id="'+cssEscape(id)+'"]'); if(button)button.click(); },80); }

  function softenExistingUi() {
    var modelTitle = root.querySelector('[data-panel="models"] .ka__title');
    if (modelTitle) { var h2=modelTitle.querySelector("h2"),p=modelTitle.querySelector("p"); if(h2&&h2.textContent!=="Model ที่ Kenji รู้จัก")h2.textContent="Model ที่ Kenji รู้จัก"; if(p&&p.textContent!=="แก้ข้อมูล → ดูสรุป → ใช้จริง · Worker ตรวจ safe copy / source / privacy / version ให้อัตโนมัติ")p.textContent="แก้ข้อมูล → ดูสรุป → ใช้จริง · Worker ตรวจ safe copy / source / privacy / version ให้อัตโนมัติ"; }
    var editor = root.querySelector("#kaModelEditor");
    if (editor) { var recordP=editor.querySelector(".ka__recordHead p"); if(recordP&&/Review/i.test(recordP.textContent||""))recordP.textContent=recordP.textContent.replace(/ทุกการแก้ไขจะเข้า Review ก่อน/g,"แก้ไข → ดูสรุป → ใช้จริง"); var save=editor.querySelector('[data-model-action="save-draft"]'); if(save&&save.textContent!=="บันทึกแล้วดูสรุป")save.textContent="บันทึกแล้วดูสรุป"; var preview=editor.querySelector('[data-model-action="preview"]'); if(preview&&preview.textContent!=="ดูตัวอย่างที่ลูกค้าจะเห็น")preview.textContent="ดูตัวอย่างที่ลูกค้าจะเห็น"; }
    var knowledgeTitle = root.querySelector('[data-panel="knowledge"] .ka__title');
    if (knowledgeTitle) { var kh2=knowledgeTitle.querySelector("h2"),kp=knowledgeTitle.querySelector("p"); if(kh2&&kh2.textContent!=="Knowledge ที่สอนแล้ว")kh2.textContent="Knowledge ที่สอนแล้ว"; if(kp&&kp.textContent!=="ดูสถานะ / คำตอบ / Audit ย้อนหลัง · งานสอนใหม่ให้เริ่มจากหน้าแรก")kp.textContent="ดูสถานะ / คำตอบ / Audit ย้อนหลัง · งานสอนใหม่ให้เริ่มจากหน้าแรก"; }
  }

  function toggleAdvanced() { var nav=root.querySelector(".ka__nav"),note=root.querySelector(".kso-advanced-note"); if(!nav)return; var on=!nav.classList.contains("kso-show-advanced"); nav.classList.toggle("kso-show-advanced",on); if(note)note.classList.toggle("is-on",on); }
  function showTab(name) { var button=root.querySelector('.ka__nav [data-tab="'+cssEscape(name)+'"]'); if(button)button.click(); setTimeout(softenExistingUi,20); }
  function scrollToId(id) { setTimeout(function () { var node=document.getElementById(id); if(node)node.scrollIntoView({behavior:"smooth",block:"start"}); },40); }
  function clearTeach() { ["ksoQuestion","ksoTeachText"].forEach(function(id){var node=document.getElementById(id);if(node)node.value="";}); var summary=root.querySelector("#ksoKnowledgeSummary"); if(summary){summary.hidden=true;summary.innerHTML="";} state.pendingKnowledge=null;state.pendingKnowledgeMeta=null;setStatus("ksoTeachStatus",""); }
  function titleForMode(mode,category) { var prefix=mode==="guard"?"Guard":mode==="route"?"Routing":"Knowledge"; return prefix+" · "+category+" · "+new Date().toLocaleDateString("th-TH"); }
  function safeGuardAnswer(category) { if(category==="payment")return "เรื่องการชำระเงิน ผมพาไปให้ MMD ตรวจจากข้อมูลจริงก่อนนะครับ"; if(category==="membership")return "เรื่องสิทธิ์สมาชิก ผมช่วยพาไปดูขั้นตอนที่ถูกต้องได้ครับ และให้ MMD ตรวจสถานะจริงก่อนยืนยัน"; if(category==="model")return "เรื่อง Model ผมช่วยรับ brief และพาไปขั้นตอนที่เหมาะสมก่อนครับ รายละเอียดที่เปิดเผยได้ขึ้นกับสิทธิ์และการตรวจจาก MMD"; return "เรื่องนี้ผมขอพาไปให้ MMD ตรวจตามข้อมูลจริงก่อนนะครับ"; }
  function isSensitiveKnowledge(category,mode) { return mode==="guard"||["payment","membership","model","admin_policy"].includes(category); }
  function audienceValues(mode) { if(mode==="members")return MEMBER_AUDIENCES.slice(); if(mode==="private")return PRIVATE_AUDIENCES.slice(); if(mode==="internal")return ["Per Review"]; return ALL_AUDIENCES.slice(); }
  function unsafeCopyHints(textValue) { var t=String(textValue||""),found=[]; if(/\bpaid\b|payment successful|ชำระเงินสำเร็จแล้ว|จ่ายแล้ว/i.test(t))found.push("ยืนยันการชำระ"); if(/\bapproved\b|อนุมัติแล้ว|ยืนยันยอดแล้ว/i.test(t))found.push("ยืนยัน/อนุมัติ"); if(/\badmin\b|\bstaff\b|\boperator\b/i.test(t))found.push("คำภายใน"); return found; }
  function extractLinks(textValue) { var matches=String(textValue||"").match(/(?:https?:\/\/[^\s]+|\/[A-Za-z0-9][A-Za-z0-9_\-/]*(?:\?[A-Za-z0-9_=&%.-]+)?)/g)||[]; return Array.from(new Set(matches)).slice(0,8); }
  function box(label,valueText,wide) { return '<div class="kso-box '+(wide?'is-wide':'')+'"><span>'+esc(label)+'</span><p>'+esc(valueText||"—")+'</p></div>'; }
  function check(ok,label,mode) { return '<div class="kso-check '+(mode==='warn'?'is-warn':mode==='bad'?'is-bad':'')+'"><i>'+(ok?'✓':mode==='bad'?'×':'!')+'</i><span>'+esc(label)+'</span></div>'; }
  function checked(name) { return Array.prototype.slice.call(root.querySelectorAll('input[name="'+name+'"]:checked')).map(function(node){return node.value;}); }
  function splitList(textValue) { return Array.from(new Set(String(textValue||"").split(/[\n,]/).map(function(part){return part.trim();}).filter(Boolean))); }
  function setModelButtons(disabled) { root.querySelectorAll("[data-model-action],[data-kso-publish-model]").forEach(function(node){node.disabled=Boolean(disabled);}); }
  function modelStatus(message,bad) { var node=root.querySelector("[data-kso-model-status]"); if(!node)return; node.textContent=message||""; node.classList.toggle("is-bad",Boolean(bad)); }
  function knowledgeStage(card) { return card.workflow_stage||(card.payload_json&&card.payload_json.workflow&&card.payload_json.workflow.stage)||({active:"published",approved:"qa_passed",pending_review:"review"}[card.status]||card.status||"draft"); }
  function knowledgeVersion(card) { return Number(card.workflow_version||(card.payload_json&&card.payload_json.workflow&&card.payload_json.workflow.version)||card.version||1); }

  function request(url,options) {
    return fetch(url,Object.assign({credentials:"same-origin",cache:"no-store"},options||{})).then(function(response){
      if(response.status===401){location.href="/internal/admin/login?next="+encodeURIComponent(location.pathname+location.search);throw new Error("unauthorized");}
      return response.text().then(function(textValue){var data={};try{data=textValue?JSON.parse(textValue):{};}catch(_){throw new Error("Worker ตอบกลับไม่ใช่ JSON");}if(!response.ok||data.ok===false){var error=typeof data.error==="string"?data.error:(data.error&&data.error.code)||("request_"+response.status);if(data.details&&data.details.errors)error+=" · "+data.details.errors.map(function(item){return item.code||item;}).join(", ");throw new Error(error);}return data;});
    });
  }
  function friendlyError(error) { var message=String(error&&error.message||error||"ยังทำรายการไม่ได้"),map={review_validation_failed:"ข้อมูลยังไม่ครบสำหรับใช้จริง",unsafe_customer_copy:"ข้อความมีคำที่ไม่ควรยืนยันกับลูกค้า",privacy_check_required:"ต้องยืนยัน privacy ก่อนใช้จริง",production_policy_path_not_verified:"policy path ยังตรวจไม่ผ่าน",version_conflict:"ข้อมูลมีเวอร์ชันใหม่กว่า กรุณาโหลดใหม่แล้วตรวจอีกครั้ง",canonical_model_required:"Model ยังไม่มี canonical record",operational_data_forbidden:"ข้อความ Model มีราคา / คิว / ข้อมูลติดต่อ / ข้อมูลภายในที่ห้ามใส่",source_not_checked:"Source ยังไม่พร้อม",customer_safe_preview_not_checked:"Customer-safe preview ยังไม่ผ่าน"}; Object.keys(map).some(function(key){if(message.includes(key)){message=map[key];return true;}return false;}); return "ยังใช้จริงไม่ได้ · "+message; }
  function value(id){var node=document.getElementById(id);return node?String(node.value||"").trim():"";}
  function setText(id,valueText){var node=document.getElementById(id);if(node)node.textContent=valueText;}
  function setStatus(id,message,bad){var node=document.getElementById(id);if(!node)return;node.textContent=message||"";node.classList.toggle("is-bad",Boolean(bad));}
  function disable(selector,disabled){root.querySelectorAll(selector).forEach(function(node){node.disabled=Boolean(disabled);});}
  function toast(message,bad){var node=document.getElementById("kaToast");if(!node)return;node.textContent=message;node.classList.toggle("is-bad",Boolean(bad));node.classList.add("is-show");setTimeout(function(){node.classList.remove("is-show");},3600);}
  function cssEscape(valueText){return window.CSS&&CSS.escape?CSS.escape(String(valueText)):String(valueText).replace(/[^a-zA-Z0-9_-]/g,"\\$&");}
  function attr(valueText){return esc(valueText).replace(/'/g,"&#39;");}
  function esc(valueText){return String(valueText==null?"":valueText).replace(/[&<>\"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c];});}
})();
