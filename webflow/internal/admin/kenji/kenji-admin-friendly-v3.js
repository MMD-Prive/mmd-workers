(function () {
  "use strict";

  var root = document.getElementById("mmdKenjiAdminV1");
  if (!root || root.dataset.uxFriendlyV3 === "1") return;
  root.dataset.uxFriendlyV3 = "1";

  var API = "/v1/admin/kenji/knowledge";
  var state = {
    cards: [],
    teachMode: "answer",
    busy: false,
    draftFingerprint: "",
    draftId: "",
    idempotencyKey: "",
    lastDraftId: "",
  };

  var style = document.createElement("style");
  style.textContent = [
    ".kfy-simple-nav{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 22px 14px;border-bottom:1px solid rgba(229,189,112,.14);background:rgba(8,6,5,.94);position:sticky;top:0;z-index:30;backdrop-filter:blur(16px)}",
    ".kfy-simple-nav button{min-height:38px;padding:8px 12px;border-radius:999px;border:1px solid rgba(229,189,112,.2);background:rgba(255,255,255,.02);color:#d8c9b7;font:inherit;font-size:12px;cursor:pointer}",
    ".kfy-simple-nav button.is-primary{background:linear-gradient(135deg,#f0ce82,#c99b40);color:#160f08;border-color:transparent;font-weight:800}",
    ".kfy-simple-nav button.is-advanced{margin-left:auto;color:#a99b8b}",
    ".ka__nav{display:none!important}.ka__nav.kfy-show-advanced{display:flex!important}",
    ".kfy-home{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(290px,.75fr);gap:14px;margin:0 0 18px}",
    ".kfy-card{border:1px solid rgba(229,189,112,.2);border-radius:18px;background:linear-gradient(155deg,rgba(20,15,11,.96),rgba(10,8,7,.96));box-shadow:0 20px 48px rgba(0,0,0,.2);padding:18px}",
    ".kfy-card h3{margin:0;color:#fff0dc;font-size:20px;line-height:1.2}.kfy-card p{margin:7px 0 0;color:#ac9f90;font-size:12px;line-height:1.6}",
    ".kfy-kicker{display:block;margin-bottom:6px;color:#d9b568;font-size:10px;font-weight:900;letter-spacing:.14em}",
    ".kfy-mode-row{display:flex;gap:7px;flex-wrap:wrap;margin:15px 0 12px}.kfy-mode-row button{padding:7px 10px;border-radius:999px;border:1px solid rgba(229,189,112,.2);background:rgba(255,255,255,.025);color:#bfae9c;font:inherit;font-size:11px;cursor:pointer}.kfy-mode-row button.is-on{background:rgba(229,189,112,.13);border-color:#d9b568;color:#f3d99e}",
    ".kfy-field{display:block;margin-top:11px;color:#d7c8b6;font-size:11px;font-weight:700}.kfy-field small{display:block;margin:4px 0 6px;color:#8f8377;font-weight:500;line-height:1.45}",
    ".kfy-field input,.kfy-field textarea,.kfy-field select{width:100%;border:1px solid rgba(229,189,112,.18);border-radius:12px;background:#0a0807;color:#fff0dc;padding:11px 12px;font:inherit;font-size:13px;outline:none}.kfy-field textarea{min-height:132px;resize:vertical;line-height:1.55}.kfy-field input:focus,.kfy-field textarea:focus,.kfy-field select:focus{border-color:rgba(229,189,112,.72);box-shadow:0 0 0 3px rgba(229,189,112,.08)}",
    ".kfy-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:13px}.kfy-actions button{min-height:40px;padding:9px 13px;border-radius:11px;border:1px solid rgba(229,189,112,.24);background:rgba(255,255,255,.025);color:#e8dbc8;font:inherit;font-size:12px;cursor:pointer}.kfy-actions .is-primary{background:linear-gradient(135deg,#f0ce82,#c99b40);color:#160f08;border-color:transparent;font-weight:850}.kfy-actions button:disabled{opacity:.5;cursor:not-allowed}",
    ".kfy-safe{margin-top:11px;padding:10px 11px;border-radius:11px;background:rgba(117,166,120,.07);border:1px solid rgba(117,166,120,.2);color:#b9c9b5;font-size:11px;line-height:1.5}.kfy-safe b{color:#d6e6d1}",
    ".kfy-status{margin-top:10px;min-height:18px;color:#e7c77f;font-size:11px;line-height:1.5}.kfy-status.is-bad{color:#ef9a86}",
    ".kfy-stack{display:grid;gap:12px}.kfy-mini-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:13px}.kfy-mini{padding:12px;border:1px solid rgba(229,189,112,.14);border-radius:13px;background:rgba(255,255,255,.02)}.kfy-mini span{display:block;color:#8f8377;font-size:10px}.kfy-mini strong{display:block;margin-top:4px;color:#fff0dc;font-size:22px}.kfy-mini small{display:block;margin-top:3px;color:#ad9f8f;font-size:10px}",
    ".kfy-preview-results{display:grid;gap:8px;margin-top:10px}.kfy-preview-item{padding:11px;border:1px solid rgba(229,189,112,.14);border-radius:12px;background:rgba(0,0,0,.16)}.kfy-preview-item b{display:block;color:#f0deca;font-size:12px}.kfy-preview-item span{display:block;margin-top:3px;color:#9d9081;font-size:10px}.kfy-preview-item p{margin:7px 0 0;color:#c8baa8;font-size:11px;line-height:1.5}.kfy-preview-item button{margin-top:8px;border:0;background:none;color:#e5bd70;padding:0;font:inherit;font-size:11px;cursor:pointer}",
    ".kfy-advanced-note{display:none;margin:-2px 0 14px;padding:9px 12px;border-radius:11px;border:1px dashed rgba(229,189,112,.2);color:#95887a;font-size:11px}.kfy-advanced-note.is-on{display:block}",
    ".kux-board-banner{max-height:118px}.kfy-home + .kux-board-banner{display:none!important}",
    "@media(max-width:820px){.kfy-simple-nav{padding:9px 12px;overflow-x:auto;flex-wrap:nowrap;scrollbar-width:none}.kfy-simple-nav::-webkit-scrollbar{display:none}.kfy-simple-nav button{flex:0 0 auto}.kfy-simple-nav button.is-advanced{margin-left:0}.kfy-home{grid-template-columns:1fr}.kfy-card{padding:14px;border-radius:15px}.kfy-mini-grid{grid-template-columns:1fr 1fr}.ka__header h1{font-size:24px!important}.ka__header{gap:10px!important}}"
  ].join("");
  document.head.appendChild(style);

  relabelHeader();
  mountSimpleNav();
  mountFriendlyHome();
  bindFriendly();
  loadKnowledge();
  softRelabel();

  var observer = new MutationObserver(function () { softRelabel(); });
  observer.observe(root, { childList: true, subtree: true });

  function relabelHeader() {
    var header = root.querySelector(".ka__header");
    if (!header) return;
    var eyebrow = header.querySelector("div > span");
    var title = header.querySelector("h1");
    if (eyebrow) eyebrow.textContent = "KENJI · TEACH & REVIEW";
    if (title) title.textContent = "สอน Kenji แบบง่าย ๆ";
    var actions = header.querySelectorAll(".ka__headActions button");
    if (actions[0]) actions[0].textContent = "ลองถาม";
    if (actions[1]) actions[1].textContent = "รอตรวจ";
  }

  function mountSimpleNav() {
    var nav = root.querySelector(".ka__nav");
    if (!nav || root.querySelector(".kfy-simple-nav")) return;
    nav.insertAdjacentHTML("beforebegin",
      '<div class="kfy-simple-nav" aria-label="Kenji quick actions">'
      + '<button class="is-primary" type="button" data-kfy-scroll="teach">+ สอนเรื่องใหม่</button>'
      + '<button type="button" data-kfy-scroll="preview">ลองถาม</button>'
      + '<button type="button" data-tab="models">Model</button>'
      + '<button type="button" data-tab="knowledge">Knowledge ที่สอนแล้ว</button>'
      + '<button class="is-advanced" type="button" data-kfy-advanced>รายละเอียด / Advanced</button>'
      + '</div><div class="kfy-advanced-note">Advanced ใช้ตอนต้องตรวจ Access, Routing, QA หรือ Version เท่านั้น · งานประจำเริ่มจาก “สอนเรื่องใหม่ / ลองถาม / รอตรวจ” ได้เลย</div>'
    );
    Array.prototype.forEach.call(nav.querySelectorAll("button[data-tab]"), function (button) {
      var map = {
        overview: "หน้าแรก",
        models: "Model",
        knowledge: "Knowledge",
        access: "Access",
        routing: "เส้นทาง",
        qa: "ตรวจ / Preview",
        versions: "ประวัติ"
      };
      if (map[button.dataset.tab]) button.textContent = map[button.dataset.tab];
    });
  }

  function mountFriendlyHome() {
    var panel = root.querySelector('[data-panel="overview"]');
    if (!panel || panel.querySelector("#kfyFriendlyHome")) return;
    var title = panel.querySelector(".ka__title");
    if (title) {
      var kicker = title.querySelector("span");
      var heading = title.querySelector("h2");
      var copy = title.querySelector("p");
      if (kicker) kicker.textContent = "เริ่มจากสิ่งที่อยากให้ Kenji รู้";
      if (heading) heading.textContent = "ไม่ต้องจำ Knowledge ID หรือขั้นตอนเทคนิค";
      if (copy) copy.textContent = "พิมพ์เป็นภาษาปกติ → เก็บเป็น Draft → ตรวจ → เช็ก → ใช้จริง";
    }

    var home = document.createElement("section");
    home.className = "kfy-home";
    home.id = "kfyFriendlyHome";
    home.innerHTML =
      '<article class="kfy-card" id="kfyTeach">'
      + '<span class="kfy-kicker">สอน KENJI</span><h3>อยากให้ Kenji รู้หรือเปลี่ยนอะไร?</h3><p>บอกเป็นภาษาคนได้เลย ระบบจะเก็บเป็น Draft ก่อนเสมอ ยังไม่เปลี่ยนคำตอบลูกค้าทันที</p>'
      + '<div class="kfy-mode-row" role="group" aria-label="ชนิดของคำสอน">'
      + '<button type="button" class="is-on" data-kfy-mode="answer">เพิ่มคำตอบ</button>'
      + '<button type="button" data-kfy-mode="correction">แก้คำตอบ</button>'
      + '<button type="button" data-kfy-mode="guard">ห้ามพูด / Guard</button>'
      + '<button type="button" data-kfy-mode="route">แนะนำทางไปต่อ</button>'
      + '</div>'
      + '<label class="kfy-field">เรื่องนี้เกี่ยวกับอะไร?<select id="kfyCategory"><option value="general">ทั่วไป</option><option value="membership">Membership</option><option value="booking">Booking</option><option value="payment">Payment</option><option value="model">Model</option><option value="promotion">Promotion</option><option value="admin_policy">Policy / ข้อห้าม</option></select></label>'
      + '<label class="kfy-field">ลูกค้ามักถามประมาณไหน? <small>ไม่ต้องเป๊ะ แค่ช่วยให้รู้บริบท เช่น “สมัครสมาชิกยังไง”</small><input id="kfyQuestion" placeholder="ตัวอย่างคำถาม (ไม่บังคับ)"></label>'
      + '<label class="kfy-field"><span id="kfyTeachLabel">อยากให้ Kenji ตอบว่า...</span><small id="kfyTeachHint">พิมพ์ข้อความที่อยากให้ Kenji ใช้เป็นคำตอบหรือความรู้ใหม่</small><textarea id="kfyTeachText" placeholder="พิมพ์ตรงนี้ได้เลย..."></textarea></label>'
      + '<div class="kfy-actions"><button class="is-primary" type="button" data-kfy-save>เก็บเป็น Draft</button><button type="button" data-kfy-clear>ล้าง</button></div>'
      + '<div class="kfy-safe"><b>Safe by default</b> · ปุ่มนี้สร้าง Draft เท่านั้น การ Review / QA / Publish ยังเป็นคนละขั้น และยังต้องให้เปอร์กดยืนยัน</div>'
      + '<div class="kfy-status" id="kfyTeachStatus"></div>'
      + '</article>'
      + '<aside class="kfy-stack">'
      + '<article class="kfy-card" id="kfyPreview"><span class="kfy-kicker">ลองถามก่อน</span><h3>มี Knowledge นี้อยู่แล้วไหม?</h3><p>ค้นจาก Knowledge ที่มีอยู่เพื่อกันสอนซ้ำ · เป็น Preview ช่วยหา ไม่ใช่ Production inference</p><label class="kfy-field">ลองพิมพ์คำถาม<input id="kfyPreviewInput" placeholder="เช่น ต่อสมาชิกยังไง"></label><div class="kfy-preview-results" id="kfyPreviewResults"><div class="ka__empty">พิมพ์คำถามเพื่อค้น Knowledge ที่ใกล้เคียง</div></div></article>'
      + '<article class="kfy-card"><span class="kfy-kicker">ตอนนี้อยู่ตรงไหน</span><h3>Draft → ตรวจ → เช็ก → ใช้จริง</h3><div class="kfy-mini-grid"><div class="kfy-mini"><span>Draft</span><strong data-kfy-count="draft">—</strong><small>เก็บไว้ก่อน</small></div><div class="kfy-mini"><span>รอตรวจ</span><strong data-kfy-count="review">—</strong><small>ยังไม่ใช้จริง</small></div><div class="kfy-mini"><span>พร้อมใช้</span><strong data-kfy-count="ready">—</strong><small>ผ่านเช็กแล้ว</small></div><div class="kfy-mini"><span>ใช้งานแล้ว</span><strong data-kfy-count="published">—</strong><small>Production</small></div></div><div class="kfy-actions"><button type="button" data-tab="knowledge">เปิด Knowledge</button><button type="button" data-tab="models">Model Review</button></div></article>'
      + '</aside>';

    if (title) title.insertAdjacentElement("afterend", home); else panel.prepend(home);
  }

  function bindFriendly() {
    root.addEventListener("click", function (event) {
      var mode = event.target.closest("[data-kfy-mode]");
      if (mode) {
        event.preventDefault();
        setTeachMode(mode.dataset.kfyMode);
        return;
      }
      var save = event.target.closest("[data-kfy-save]");
      if (save) {
        event.preventDefault();
        saveDraft();
        return;
      }
      var clear = event.target.closest("[data-kfy-clear]");
      if (clear) {
        event.preventDefault();
        clearTeach();
        return;
      }
      var advanced = event.target.closest("[data-kfy-advanced]");
      if (advanced) {
        event.preventDefault();
        toggleAdvanced(advanced);
        return;
      }
      var scroll = event.target.closest("[data-kfy-scroll]");
      if (scroll) {
        event.preventDefault();
        openOverviewAndScroll(scroll.dataset.kfyScroll);
        return;
      }
      var open = event.target.closest("[data-kfy-open-knowledge]");
      if (open) {
        event.preventDefault();
        openKnowledge(open.dataset.kfyOpenKnowledge);
      }
    }, true);

    var teachInputs = root.querySelectorAll("#kfyTeachText,#kfyQuestion,#kfyCategory");
    Array.prototype.forEach.call(teachInputs, function (node) {
      node.addEventListener("input", resetDraftIdentity);
      node.addEventListener("change", resetDraftIdentity);
    });
    var preview = root.querySelector("#kfyPreviewInput");
    if (preview) preview.addEventListener("input", renderPreview);
  }

  function setTeachMode(mode) {
    state.teachMode = ["answer", "correction", "guard", "route"].includes(mode) ? mode : "answer";
    resetDraftIdentity();
    Array.prototype.forEach.call(root.querySelectorAll("[data-kfy-mode]"), function (button) {
      button.classList.toggle("is-on", button.dataset.kfyMode === state.teachMode);
    });
    var label = root.querySelector("#kfyTeachLabel");
    var hint = root.querySelector("#kfyTeachHint");
    var text = root.querySelector("#kfyTeachText");
    var config = {
      answer: ["อยากให้ Kenji ตอบว่า...", "พิมพ์ข้อความที่อยากให้ Kenji ใช้เป็นคำตอบหรือความรู้ใหม่", "พิมพ์คำตอบหรือข้อมูลใหม่ตรงนี้..."],
      correction: ["อยากแก้ให้ Kenji ตอบว่า...", "ใส่คำตอบที่ถูกต้องแทนของเดิม แล้วค่อย Review ก่อนใช้จริง", "คำตอบใหม่ที่ถูกต้อง..."],
      guard: ["สิ่งที่ Kenji ห้ามพูด / ห้ามทำ", "เขียนเป็นข้อห้ามง่าย ๆ ได้เลย เช่น ห้ามยืนยันยอดก่อนตรวจเงินจริง", "ตัวอย่าง: ห้ามพูดว่า Paid ก่อน payments-worker ยืนยัน..."],
      route: ["อยากให้ Kenji แนะนำทางไปต่อแบบไหน", "บอก route หรือแนวทางที่ควรพาลูกค้าไป โดยยังไม่อนุมัติสิทธิ์แทน backend", "ตัวอย่าง: ถ้าต้องต่อสมาชิก ให้พาไป /sigil/pay/renewal..."],
    }[state.teachMode];
    if (label) label.textContent = config[0];
    if (hint) hint.textContent = config[1];
    if (text) text.placeholder = config[2];
    if (state.teachMode === "guard") {
      var category = root.querySelector("#kfyCategory");
      if (category) category.value = "admin_policy";
    }
  }

  function saveDraft() {
    if (state.busy) return;
    var text = value("#kfyTeachText");
    var question = value("#kfyQuestion");
    var category = value("#kfyCategory") || "general";
    if (!text) return setTeachStatus("พิมพ์สิ่งที่อยากสอน Kenji ก่อน", true);

    var fingerprint = [state.teachMode, category, question, text].join("|");
    if (state.draftFingerprint !== fingerprint || !state.draftId || !state.idempotencyKey) {
      state.draftFingerprint = fingerprint;
      state.draftId = "kenji_note_" + Date.now().toString(36) + "_" + randomPart();
      state.idempotencyKey = randomUuid();
    }

    var customerAnswer = state.teachMode === "guard"
      ? "เรื่องนี้ผมขอตรวจข้อมูลกับ MMD ก่อนนะครับ เพื่อไม่ยืนยันเกินข้อมูลจริงครับ"
      : text;
    var instruction = buildInstruction(state.teachMode, question, text);
    var responseMode = state.teachMode === "guard" || category === "payment" ? "handoff_required" : "auto_reply_allowed";
    var payload = {
      knowledge_id: state.draftId,
      title: autoTitle(text, state.teachMode),
      category: category,
      language: "th",
      customer_answer: customerAnswer,
      internal_instruction: instruction,
      allowed_channels: ["LINE_OFC", "Webflow", "SIGIL Board", "Admin Console"],
      response_mode: responseMode,
      risk_level: category === "payment" || state.teachMode === "guard" ? "high" : "medium",
      source_path: "/internal/admin/kenji",
      source_ref: "friendly-teach-v3",
      owner: "Boss Per",
      review_note: "Created via friendly Teach Kenji UI. Explicit Review → QA → Publish required before production use.",
      payload_json: {
        friendly_teach: {
          mode: state.teachMode,
          sample_question: question || null,
          entered_at: new Date().toISOString()
        }
      }
    };

    state.busy = true;
    setTeachStatus("กำลังเก็บ Draft…");
    var button = root.querySelector("[data-kfy-save]");
    if (button) button.disabled = true;
    fetch(API + "/draft", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json", "Idempotency-Key": state.idempotencyKey },
      body: JSON.stringify(payload)
    }).then(readResponse).then(function (data) {
      state.lastDraftId = (data.card && (data.card.knowledge_id || data.card.id)) || data.knowledge_id || state.draftId;
      setTeachStatus("เก็บ Draft แล้ว ✓ · ยังไม่เปลี่ยน Production", false, state.lastDraftId);
      state.draftFingerprint = "";
      state.draftId = "";
      state.idempotencyKey = "";
      return loadKnowledge();
    }).catch(function (error) {
      setTeachStatus("ยังเก็บไม่ได้ · " + (error.message || "draft_error") + " · กดซ้ำได้โดยไม่สร้าง Draft ใหม่", true);
    }).finally(function () {
      state.busy = false;
      if (button) button.disabled = false;
    });
  }

  function buildInstruction(mode, question, text) {
    var context = question ? "ตัวอย่างคำถามลูกค้า: " + question + "\n" : "";
    if (mode === "guard") return context + "Guard จากเปอร์: " + text + "\nห้ามนำ Guard นี้ไปเป็น customer-facing answer ตรง ๆ; ใช้เป็นข้อจำกัดของการตอบและต้องยึด backend authority ตามเรื่องนั้น.";
    if (mode === "route") return context + "Routing guidance จากเปอร์: ใช้ข้อความนี้เป็นแนวทางพาไปต่อเท่านั้น ตรวจ live truth / eligibility / money / availability จาก authority ที่เกี่ยวข้องก่อนยืนยัน.";
    if (mode === "correction") return context + "Correction จากเปอร์: ใช้คำตอบใหม่นี้แทนแนวตอบเดิมหลัง Review และ QA ผ่านแล้ว.";
    return context + "Knowledge note จากเปอร์: ใช้เป็นข้อมูลประกอบการตอบหลัง Review และ QA ผ่านแล้ว.";
  }

  function clearTeach() {
    var text = root.querySelector("#kfyTeachText");
    var question = root.querySelector("#kfyQuestion");
    if (text) text.value = "";
    if (question) question.value = "";
    resetDraftIdentity();
    setTeachStatus("");
  }

  function resetDraftIdentity() {
    state.draftFingerprint = "";
    state.draftId = "";
    state.idempotencyKey = "";
  }

  function setTeachStatus(message, bad, draftId) {
    var node = root.querySelector("#kfyTeachStatus");
    if (!node) return;
    node.classList.toggle("is-bad", Boolean(bad));
    node.innerHTML = escapeHtml(message || "");
    if (draftId && !bad) {
      node.innerHTML += ' <button type="button" data-kfy-open-knowledge="' + attr(draftId) + '" style="border:0;background:none;color:#f0ce82;font:inherit;font-size:11px;cursor:pointer;padding:0 0 0 6px">เปิด Draft นี้ ↗</button>';
    }
  }

  function loadKnowledge() {
    return fetch(API + "/list", { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } })
      .then(readResponse)
      .then(function (data) {
        state.cards = Array.isArray(data.cards) ? data.cards : Array.isArray(data.items) ? data.items : [];
        renderCounts();
        renderPreview();
      })
      .catch(function () {
        renderCounts(true);
      });
  }

  function renderCounts(failed) {
    var counts = { draft: 0, review: 0, ready: 0, published: 0 };
    if (!failed) {
      state.cards.forEach(function (card) {
        var stage = cardStage(card);
        if (stage === "draft") counts.draft += 1;
        else if (stage === "review") counts.review += 1;
        else if (stage === "qa_passed") counts.ready += 1;
        else if (["published", "active", "approved"].includes(stage)) counts.published += 1;
      });
    }
    Object.keys(counts).forEach(function (key) {
      Array.prototype.forEach.call(root.querySelectorAll('[data-kfy-count="' + key + '"]'), function (node) {
        node.textContent = failed ? "—" : String(counts[key]);
      });
    });
  }

  function renderPreview() {
    var input = root.querySelector("#kfyPreviewInput");
    var output = root.querySelector("#kfyPreviewResults");
    if (!input || !output) return;
    var query = (input.value || "").trim();
    if (!query) {
      output.innerHTML = '<div class="ka__empty">พิมพ์คำถามเพื่อค้น Knowledge ที่ใกล้เคียง</div>';
      return;
    }
    if (!state.cards.length) {
      output.innerHTML = '<div class="ka__empty">ยังอ่าน Knowledge ไม่ได้ หรือยังไม่มีข้อมูล</div>';
      return;
    }
    var ranked = state.cards.map(function (card) { return { card: card, score: scoreCard(card, query) }; })
      .filter(function (item) { return item.score > 0; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, 4);
    if (!ranked.length) {
      output.innerHTML = '<div class="ka__empty">ยังไม่เจอ Knowledge ใกล้เคียง · ถ้าเป็นเรื่องใหม่ สอนได้ทางซ้ายเลย</div>';
      return;
    }
    output.innerHTML = ranked.map(function (item) {
      var card = item.card;
      var id = card.knowledge_id || card.id || "";
      var answer = card.customer_answer || card.answer || "ยังไม่มี customer-facing answer";
      return '<article class="kfy-preview-item"><b>' + escapeHtml(card.title || id) + '</b><span>' + escapeHtml(humanStage(cardStage(card))) + ' · ' + escapeHtml(card.category || "knowledge") + '</span><p>' + escapeHtml(shorten(answer, 170)) + '</p><button type="button" data-kfy-open-knowledge="' + attr(id) + '">เปิด Knowledge นี้ ↗</button></article>';
    }).join("");
  }

  function scoreCard(card, query) {
    var q = query.toLowerCase();
    var hay = [card.title, card.knowledge_id, card.id, card.category, card.customer_answer, card.answer, card.internal_instruction].join(" ").toLowerCase();
    var score = hay.indexOf(q) >= 0 ? 15 : 0;
    var tokens = q.split(/[\s,./\\|:;!?()\[\]{}]+/).filter(function (token) { return token.length >= 2; });
    tokens.forEach(function (token) {
      if (hay.indexOf(token) >= 0) score += token.length >= 5 ? 3 : 1;
    });
    return score;
  }

  function openKnowledge(id) {
    var tab = root.querySelector('.kfy-simple-nav [data-tab="knowledge"]') || root.querySelector('.ka__nav [data-tab="knowledge"]');
    if (tab) tab.click();
    window.setTimeout(function () {
      var search = root.querySelector("#kaSearch");
      if (search) {
        search.value = id;
        search.dispatchEvent(new Event("input", { bubbles: true }));
      }
      window.setTimeout(function () {
        var record = root.querySelector('[data-id="' + cssEscape(id) + '"]');
        if (record) record.click();
      }, 60);
    }, 40);
  }

  function openOverviewAndScroll(target) {
    var tab = root.querySelector('.ka__nav [data-tab="overview"]');
    if (tab) tab.click();
    window.setTimeout(function () {
      var node = root.querySelector(target === "preview" ? "#kfyPreview" : "#kfyTeach");
      if (node) node.scrollIntoView({ behavior: "smooth", block: "start" });
      var focus = root.querySelector(target === "preview" ? "#kfyPreviewInput" : "#kfyTeachText");
      if (focus) focus.focus({ preventScroll: true });
    }, 50);
  }

  function toggleAdvanced(button) {
    var nav = root.querySelector(".ka__nav");
    var note = root.querySelector(".kfy-advanced-note");
    if (!nav) return;
    var on = !nav.classList.contains("kfy-show-advanced");
    nav.classList.toggle("kfy-show-advanced", on);
    if (note) note.classList.toggle("is-on", on);
    button.textContent = on ? "ซ่อน Advanced" : "รายละเอียด / Advanced";
  }

  function softRelabel() {
    var replacements = [
      ["Submit Review", "ส่งให้ตรวจ"],
      ["Run QA", "เช็กก่อนใช้"],
      ["Read Audit", "ประวัติ"],
      ["Confirm Review", "ตรวจแล้ว"],
      ["Audit", "ประวัติ"]
    ];
    Array.prototype.forEach.call(root.querySelectorAll("button"), function (button) {
      var text = (button.textContent || "").trim();
      replacements.forEach(function (pair) { if (text === pair[0]) button.textContent = pair[1]; });
      if (text === "Publish" && !button.closest(".ka__headActions")) button.textContent = "ใช้จริง";
    });
    var knowledgeTitle = root.querySelector('[data-panel="knowledge"] .ka__title h2');
    var knowledgeCopy = root.querySelector('[data-panel="knowledge"] .ka__title p');
    if (knowledgeTitle) knowledgeTitle.textContent = "Knowledge ที่สอนแล้ว";
    if (knowledgeCopy) knowledgeCopy.textContent = "เลือกเรื่องที่ต้องการตรวจ · Draft → ตรวจ → เช็ก → ใช้จริง";
    var modelsTitle = root.querySelector('[data-panel="models"] .ka__title h2');
    if (modelsTitle) modelsTitle.textContent = "Model & Keyword";
  }

  function cardStage(card) {
    var value = String(card.workflow_stage || (card.payload_json && card.payload_json.workflow && card.payload_json.workflow.stage) || card.status || "draft").toLowerCase();
    if (value === "qa_passed") return "qa_passed";
    if (["active", "approved", "published"].includes(value)) return value;
    if (["review", "reviewed", "waiting_review"].includes(value)) return "review";
    return value || "draft";
  }

  function humanStage(stage) {
    if (stage === "draft") return "Draft · เก็บไว้ก่อน";
    if (stage === "review") return "รอตรวจ";
    if (stage === "qa_passed") return "พร้อมใช้";
    if (["published", "active", "approved"].includes(stage)) return "ใช้งานแล้ว";
    if (stage === "qa_failed") return "ต้องแก้";
    return stage || "—";
  }

  function autoTitle(text, mode) {
    var prefix = { answer: "คำตอบ", correction: "แก้คำตอบ", guard: "Guard", route: "Route" }[mode] || "Knowledge";
    var clean = String(text || "").replace(/\s+/g, " ").trim();
    return prefix + " · " + shorten(clean, 88);
  }

  function shorten(value, max) {
    var text = String(value == null ? "" : value).trim();
    return text.length > max ? text.slice(0, max - 1).trim() + "…" : text;
  }

  function value(selector) {
    var node = root.querySelector(selector);
    return node ? String(node.value || "").trim() : "";
  }

  function randomUuid() {
    return crypto && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : "kfy-" + Date.now() + "-" + randomPart();
  }

  function randomPart() {
    return Math.random().toString(36).slice(2, 9);
  }

  function readResponse(response) {
    if (response.status === 401 || response.status === 403) {
      location.href = "/internal/admin/login?next=" + encodeURIComponent(location.pathname + location.search);
      throw new Error("session_required");
    }
    return response.text().then(function (text) {
      var data = {};
      try { data = text ? JSON.parse(text) : {}; } catch (_) { throw new Error("endpoint_returned_non_json"); }
      if (!response.ok || data.ok === false) throw new Error(typeof data.error === "string" ? data.error : "request_" + response.status);
      return data;
    });
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>\"]/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[character];
    });
  }

  function attr(value) {
    return escapeHtml(value).replace(/'/g, "&#39;");
  }

  function cssEscape(value) {
    return window.CSS && CSS.escape ? CSS.escape(String(value)) : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }
})();
