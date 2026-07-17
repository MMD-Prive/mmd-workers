/* Kenji Knowledge V9.2 Webflow Loader. Injects HTML and gates read-only board reads. */
(function () {
  "use strict";

  var ROOT_ID = "mmdKenjiKnowledgeV9";
  var STORAGE_KEY = "mmd_kenji_knowledge_v9_cards";
  var STATUS_ENDPOINT = "/v1/sigil/board/status";
  var QUEUE_ENDPOINT = "/v1/sigil/board/queue";
  var ADMIN_AUTH_ENDPOINT = "/v1/admin/auth/me";
  var SAFE_MODE_COPY = "Safe Mode พร้อมอ่าน แต่ยังไม่โหลด Board จนกว่าจะผ่านการตรวจสิทธิ์";
  var SAFETY_COPY = "ข้อมูลจาก Board เป็นสัญญาณอ่านอย่างเดียว Kenji ช่วยสรุปและร่างคำตอบได้ แต่ไม่สามารถอนุมัติสลิป เปิดสมาชิก ยืนยันการจอง หรือปลดล็อกสิทธิ์ใด ๆ ได้";
  var SAFETY_COPY_EN = "Board data is advisory read-only. Kenji cannot approve, unlock, confirm, or write operational changes.";
  var BOARD_CARD_KEYS = ["id", "title", "lane", "status", "priority", "risk", "next_action", "owner", "needs_per_decision", "summary"];
  var img = {
    hero: "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a56f9510d5f16d76cae7435_Kenji%20Know01.webp",
    campaign: "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a56f951f9c3e0c7ffe9465c_Kenji%20Know02.webp",
    safety: "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a56f95105a7994eb5995e87_Kenji%20Know04.webp",
    runtime: "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a56fb9a0acae936c0c362e5_Kenji%20Know05.webp"
  };
  var starterCards = [
    {
      id: "payment-proof-under-review-th",
      status: "published",
      lane: "Payment",
      audience: "member",
      language: "th",
      title: "ลูกค้าส่งสลิปแล้วถามว่าจ่ายสำเร็จหรือยัง",
      customer_question_examples: ["ส่งสลิปแล้ว จ่ายสำเร็จหรือยังครับ"],
      kenji_safe_answer: "ผมรับทราบว่าคุณส่งหลักฐานแล้วครับ แต่ยังยืนยันสถานะชำระเงินจากข้อความเพียงอย่างเดียวไม่ได้ MMD จะตรวจผ่านระบบอย่างเป็นทางการก่อนเปลี่ยนสถานะครับ",
      do_rules: ["รับเรื่องด้วยภาษาสุภาพ", "ย้ำว่าต้องรอ MMD ตรวจสอบจากระบบทางการ"],
      dont_rules: ["ห้ามบอกว่าจ่ายสำเร็จ", "ห้ามเปิดสมาชิกจากสลิปอย่างเดียว"],
      escalation_rule: "ส่งให้ทีม MMD ตรวจยอดจากระบบทางการก่อนตอบสถานะ",
      related_routes: ["/sigil/pay"]
    },
    {
      id: "member-status-review-required-th",
      status: "published",
      lane: "Support",
      audience: "member",
      language: "th",
      title: "สมาชิกถามว่าสถานะ active แล้วหรือยัง",
      customer_question_examples: ["สถานะสมาชิก active แล้วไหมครับ"],
      kenji_safe_answer: "ผมช่วยแนะนำขั้นตอนตรวจสถานะได้ครับ แต่ยังไม่สามารถยืนยัน active หรือ unlock สิทธิ์แทนระบบได้ ต้องให้ MMD ตรวจสอบจากข้อมูลจริงก่อนเสมอครับ",
      do_rules: ["แนะนำให้ตรวจสถานะผ่านช่องทาง MMD", "ใช้ภาษารอ review"],
      dont_rules: ["ห้ามยืนยัน active", "ห้าม unlock สิทธิ์"],
      escalation_rule: "ให้ MMD ตรวจข้อมูลสมาชิกก่อนยืนยันสถานะ",
      related_routes: ["/member/dashboard", "/member/membership"]
    }
  ];
  var campaignTemplates = [
    { id: "current-client-six-months", title: "Current Client +6 Months Extension", lane: "Support", kenji_safe_answer: "เบื้องต้นเคสนี้อาจอยู่ในกลุ่มลูกค้าปัจจุบันที่สามารถขอตรวจสถานภาพสมาชิกได้ครับ หาก MMD ตรวจสอบจากระบบแล้วพบว่ายังอยู่ในรอบสมาชิก อาจได้รับการยืดเวลาสมาชิกเพิ่ม 6 เดือนตามแคมเปญ Member Status Review 2026 ทั้งนี้สิทธิ์จะมีผลหลัง MMD ตรวจสอบเรียบร้อยแล้วเท่านั้นครับ" },
    { id: "expired-client-renewal", title: "Expired Client Renewal Bonus", lane: "Support", kenji_safe_answer: "ถ้าเคยเป็นลูกค้า MMD แต่ข้อมูลล่าสุดเกินรอบสมาชิกแล้ว เคสนี้อาจอยู่ในกลุ่มต่ออายุครับ MMD สามารถตรวจสถานภาพและแนะนำโปร Renewal เพื่อกลับมา active พร้อมรับ Points และ bonus extension ตามเงื่อนไขแคมเปญได้ ทั้งนี้ต้องให้ MMD ตรวจสอบจากระบบและยืนยันก่อนเสมอครับ" },
    { id: "new-member-welcome-points", title: "New Member Welcome Points", lane: "Support", kenji_safe_answer: "ตอนนี้ผมยังไม่พบสถานะสมาชิกเดิมที่ยืนยันได้จากระบบครับ หากต้องการเริ่มต้นกับ MMD สามารถสมัครสมาชิกใหม่ผ่าน Telegram Preview และรับ Welcome Points ตามเงื่อนไขแคมเปญได้ครับ สิทธิ์และแต้มจะมีผลหลัง MMD ตรวจสอบและยืนยันจากระบบเรียบร้อยแล้วเท่านั้นครับ" },
    { id: "unknown-status-review", title: "Unknown Status Review Guidance", lane: "Support", kenji_safe_answer: "เคสนี้ควรให้ MMD ตรวจสอบสถานภาพจากข้อมูลจริงก่อนนะครับ ตอนนี้ผมยังไม่สามารถยืนยันได้ว่าเป็นสมาชิกปัจจุบัน หมดอายุ หรือเป็นลูกค้าใหม่ หากคุณส่งข้อมูลติดต่อที่เคยใช้ไว้ MMD จะช่วยตรวจสอบและแนะนำขั้นตอนที่เหมาะสมให้ครับ" },
    { id: "promotion-safety-boundary", title: "Promotion Safety Boundary", lane: "Escalation", kenji_safe_answer: "การตรวจสถานภาพ การยืดเวลาสมาชิก การต่ออายุ และการได้รับ Points จะมีผลเมื่อ MMD ตรวจสอบข้อมูลจากระบบเรียบร้อยแล้วเท่านั้น Kenji สามารถช่วยแนะนำขั้นตอนเบื้องต้นได้ แต่ไม่ถือเป็นการยืนยันสถานะ สิทธิ์ การชำระเงิน แต้ม หรือการอนุมัติใด ๆ" }
  ];
  var fallbackBoard = [
    { id: "fallback_payment", title: "Payment proof review", lane: "Payment", status: "รอตรวจสอบ", priority: "High", owner: "MMD", risk: "Slip evidence only", next_action: "ตรวจยอดจากระบบทางการก่อนตอบ", needs_per_decision: true, summary: "สลิปเป็นหลักฐานเท่านั้น ต้องตรวจยอดจริงก่อนเปลี่ยนสถานะ" },
    { id: "fallback_private_review", title: "Private review candidate", lane: "Private Review", status: "ต้องพิจารณา", priority: "High", owner: "Per", risk: "Per manual decision only", next_action: "สรุป advisory ให้ Per", needs_per_decision: true, summary: "เคสนี้ต้องพิจารณาแบบส่วนตัวโดย Per เท่านั้น" },
    { id: "fallback_black_card", title: "Private risk review", lane: "Black Card", status: "private review", priority: "High", owner: "Ewvon", risk: "Ewvon private review only", next_action: "ห้ามอนุมัติอัตโนมัติ", needs_per_decision: true, summary: "เคสนี้เป็น private review เท่านั้น" }
  ];

  var root = document.getElementById(ROOT_ID);
  if (!root) return;
  root.classList.add("kk4", "kk4--v92");
  root.setAttribute("data-version", "kenji-knowledge-v9-2-r2-loader");
  root.setAttribute("aria-label", "Kenji Knowledge V9.2");
  root.innerHTML = renderShell();

  var state = {
    cards: loadCards(),
    view: "knowledge",
    boardCards: fallbackBoard.map(sanitizeBoardCard),
    boardFilter: "all",
    selectedBoardId: "fallback_payment",
    boardAuthed: false,
    boardLoading: false
  };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c];
    });
  }

  function compactText(value, fallback, maxLength) {
    var text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
    return text.slice(0, maxLength || 220) || fallback || "";
  }

  function listText(value, fallback) {
    if (Array.isArray(value)) return value.map(function (item) { return compactText(item, "", 240); }).filter(Boolean).join("\n");
    return compactText(value, fallback || "", 1200);
  }

  function asArray(value) {
    if (Array.isArray(value)) return value.map(function (item) { return compactText(item, "", 240); }).filter(Boolean);
    var text = compactText(value, "", 1200);
    return text ? text.split(/\n|;/).map(function (item) { return compactText(item, "", 240); }).filter(Boolean) : [];
  }

  function renderShell() {
    return '<div class="kk4__ambient" aria-hidden="true"><span class="kk4__glow kk4__glow--gold"></span><span class="kk4__glow kk4__glow--violet"></span><span class="kk4__grid"></span></div>'
      + '<header class="kk4__topbar"><a class="kk4__brand" href="/internal/admin"><span class="kk4__brand-mark">K</span><span class="kk4__brand-copy"><strong>KENJI KNOWLEDGE</strong><small>V9.2 BOARD BRIDGE</small></span></a><div class="kk4__status-pill" data-state="ready"><span></span><b>Loader พร้อมใช้งาน</b></div></header>'
      + '<main class="kk4__container"><section class="kk4__hero"><picture class="kk4__hero-image"><img src="' + img.hero + '" alt="Kenji Knowledge command room" loading="eager"></picture><div class="kk4__hero-overlay"></div><div class="kk4__hero-copy"><span class="kk4__eyebrow">MMD PRIVE / INTERNAL KNOWLEDGE ROOM</span><h1>Kenji Knowledge</h1><p>ห้องสอน Kenji ให้ตอบอย่างปลอดภัย เขียน Knowledge Draft และอ่านสัญญาณจาก Kenji Board แบบ read-only โดยไม่แตะการอนุมัติจริง</p><div class="kk4__hero-actions"><button type="button" class="kk4__button kk4__button--gold" data-view="knowledge">เขียน Knowledge</button><button type="button" class="kk4__button" data-view="campaign">Campaign Mode</button><button type="button" class="kk4__button" data-view="runtime">Runtime / Board</button></div></div></section>'
      + '<section class="kk4__safety-banner" role="note"><b>' + esc(SAFETY_COPY_EN) + '</b><span>' + esc(SAFETY_COPY) + '</span></section>'
      + '<section class="kk4__metrics"><article><span>Published</span><strong data-count="published">0</strong><p>การ์ดที่ใช้เป็นคำตอบได้</p></article><article><span>Drafts</span><strong data-count="draft">0</strong><p>รอแก้และตรวจภาษา</p></article><article><span>Campaign</span><strong>5</strong><p>Member Status Review 2026</p></article><article><span>Board</span><strong data-board-count="total">0</strong><p>อ่านสถานะจาก /sigil/board</p></article></section>'
      + '<nav class="kk4__lane-tabs" aria-label="Knowledge lanes"><button type="button" data-view="knowledge" class="is-active">01 Knowledge</button><button type="button" data-view="campaign">02 Campaign</button><button type="button" data-view="runtime">03 Runtime</button></nav>'
      + '<section class="kk4__view is-active" data-panel="knowledge"><div class="kk4__workspace"><article class="kk4__card kk4__editor"><span class="kk4__mini-label">Knowledge Draft Helper</span><h2>ร่าง Safe Answer</h2><label>Title<input id="kk91Title" placeholder="เช่น ลูกค้าถามเรื่องสลิป"></label><label>Lane<select id="kk91Lane"><option value="Payment">Payment</option><option value="Booking">Booking</option><option value="Escalation">Escalation</option><option value="Privacy">Privacy</option><option value="Support">Support</option></select></label><div class="kk4__form-grid"><label>Audience<input id="kk91Audience" value="internal_only"></label><label>Language<input id="kk91Language" value="th"></label></div><label>Customer Question Examples<textarea id="kk91Questions" rows="3" placeholder="หนึ่งตัวอย่างต่อหนึ่งบรรทัด"></textarea></label><label>Kenji Safe Answer<textarea id="kk91Answer" rows="6" placeholder="คำตอบที่ Kenji พูดได้โดยไม่ข้ามอำนาจระบบ"></textarea></label><label>Do Rules<textarea id="kk91DoRules" rows="3"></textarea></label><label>Don\'t Rules<textarea id="kk91DontRules" rows="3"></textarea></label><label>Escalation Rule<textarea id="kk91Escalation" rows="3"></textarea></label><label>Related Routes<input id="kk91Routes" placeholder="[] หรือ /member/dashboard"></label><div class="kk4__form-row"><button class="kk4__button kk4__button--gold" type="button" id="kk91SaveDraft">Save Draft</button><button class="kk4__button" type="button" id="kk91Export">Export JSON</button></div></article><article class="kk4__card"><span class="kk4__mini-label">Knowledge Library</span><h2>คลัง Knowledge</h2><div class="kk4__card-list" id="kk91CardList"></div></article></div></section>'
      + '<section class="kk4__view" data-panel="campaign"><div class="kk4__image-panel"><img src="' + img.campaign + '" alt="Campaign review table" loading="lazy"><div><span class="kk4__mini-label">Campaign Mode</span><h2>Member Status Review 2026</h2><p>ตรวจลูกค้าปัจจุบัน ลูกค้าหมดอายุ ลูกค้าใหม่ และเคสไม่ชัด ก่อนให้ Kenji แนะนำคำตอบที่ไม่ยืนยันสิทธิ์แทนระบบ</p></div></div><div class="kk4__campaign-grid" id="kk91CampaignList"></div></section>'
      + '<section class="kk4__view" data-panel="runtime"><div class="kk4__runtime-hero"><img src="' + img.runtime + '" alt="Published runtime health" loading="lazy"><div><span class="kk4__mini-label">Published Runtime Health</span><h2>Board Bridge อ่านอย่างเดียว</h2><p id="kk91BoardStatus">' + SAFE_MODE_COPY + '</p><button type="button" class="kk4__button kk4__button--gold" id="kk91RefreshBoard">ตรวจสิทธิ์และ Refresh Board</button></div></div><section class="kk4__metrics kk4__metrics--board"><article><span>Critical</span><strong data-board-count="critical">0</strong><p>เรื่องที่ต้องหยุดก่อนยืนยัน</p></article><article><span>Ready for Per</span><strong data-board-count="ready_for_per">0</strong><p>พร้อมให้ Per ตัดสินใจ</p></article><article><span>Payment Pending</span><strong data-board-count="payment_pending">0</strong><p>สลิปรอตรวจทางการ</p></article><article><span>Need Info</span><strong data-board-count="need_info">0</strong><p>ต้องขอข้อมูลเพิ่ม</p></article></section><div class="kk4__board-layout"><article class="kk4__card"><span class="kk4__mini-label">Board Queue</span><h2>คิวอ่านอย่างเดียว</h2><div class="kk4__filter-row"><button type="button" data-board-filter="all" class="is-active">All</button><button type="button" data-board-filter="per">Per</button><button type="button" data-board-filter="payment">Payment</button><button type="button" data-board-filter="need_info">Need Info</button><button type="button" data-board-filter="critical">Critical</button><button type="button" data-board-filter="high">High</button></div><div class="kk4__card-list" id="kk91BoardList"></div></article><aside class="kk4__card"><span class="kk4__mini-label">Knowledge Draft from Board</span><h2>Selected Card Helper</h2><img class="kk4__side-image" src="' + img.safety + '" alt="Safety boundary" loading="lazy"><p>' + esc(SAFETY_COPY) + '</p><div id="kk91AssistantPanel"></div></aside></div></section></main><div class="kk4__toast" id="kk91Toast" role="status" aria-live="polite"></div>';
  }

  function loadCards() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return Array.isArray(parsed) && parsed.length ? parsed : starterCards.slice();
    } catch (error) {
      return starterCards.slice();
    }
  }

  function saveCards() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.cards, null, 2));
  }

  function toast(message) {
    var node = document.getElementById("kk91Toast");
    if (!node) return;
    node.textContent = message;
    node.classList.add("is-visible");
    setTimeout(function () { node.classList.remove("is-visible"); }, 1800);
  }

  function setText(selector, value) {
    var node = root.querySelector(selector);
    if (node) node.textContent = String(value);
  }

  function setValue(id, value) {
    var node = document.getElementById(id);
    if (node) node.value = value == null ? "" : String(value);
  }

  function setView(view) {
    state.view = view || "knowledge";
    root.querySelectorAll("[data-view]").forEach(function (button) {
      button.classList.toggle("is-active", button.getAttribute("data-view") === state.view);
    });
    root.querySelectorAll("[data-panel]").forEach(function (panel) {
      panel.classList.toggle("is-active", panel.getAttribute("data-panel") === state.view);
    });
  }

  function updateCounts() {
    setText('[data-count="published"]', state.cards.filter(function (card) { return card.status === "published"; }).length);
    setText('[data-count="draft"]', state.cards.filter(function (card) { return card.status !== "published"; }).length);
  }

  function renderCards() {
    var list = document.getElementById("kk91CardList");
    if (!list) return;
    list.innerHTML = state.cards.map(function (card) {
      return '<article class="kk4__mini-card"><b>' + esc(card.title) + '</b><span>' + esc(card.lane) + ' / ' + esc(card.status) + ' / ' + esc(card.audience || "internal_only") + '</span><p>' + esc(card.kenji_safe_answer || "") + '</p></article>';
    }).join("");
    updateCounts();
  }

  function renderCampaigns() {
    var list = document.getElementById("kk91CampaignList");
    if (!list) return;
    list.innerHTML = campaignTemplates.map(function (card) {
      return '<article class="kk4__campaign-card"><span>' + esc(card.lane) + '</span><h3>' + esc(card.title) + '</h3><p>' + esc(card.kenji_safe_answer) + '</p><button type="button" class="kk4__button" data-use-template="' + esc(card.id) + '">ส่งเข้า Editor</button></article>';
    }).join("");
  }

  function useTemplate(id) {
    var card = campaignTemplates.filter(function (item) { return item.id === id; })[0];
    if (!card) return;
    fillDraft({
      title: card.title,
      lane: card.lane,
      audience: "internal_only",
      language: "th",
      customer_question_examples: ["ลูกค้าถามเรื่อง " + card.title],
      kenji_safe_answer: card.kenji_safe_answer,
      do_rules: ["ตอบเป็นคำแนะนำเบื้องต้น", "ย้ำว่าต้องรอ MMD ตรวจสอบจากระบบ"],
      dont_rules: ["ห้ามยืนยันสิทธิ์", "ห้ามยืนยันการชำระเงิน", "ห้ามอนุมัติแทน Per หรือ MMD"],
      escalation_rule: "ถ้าเกี่ยวกับสถานะ สิทธิ์ หรือยอดเงิน ให้ส่งต่อ MMD ตรวจสอบก่อนตอบ",
      related_routes: []
    });
    setView("knowledge");
    toast("ส่ง Campaign เข้า Draft แล้ว");
  }

  function readDraftFromEditor() {
    return {
      id: "draft_" + Date.now(),
      status: "draft",
      title: compactText(document.getElementById("kk91Title").value, "Untitled Knowledge", 180),
      lane: compactText(document.getElementById("kk91Lane").value, "Support", 80),
      audience: compactText(document.getElementById("kk91Audience").value, "internal_only", 80),
      language: compactText(document.getElementById("kk91Language").value, "th", 12),
      customer_question_examples: asArray(document.getElementById("kk91Questions").value),
      kenji_safe_answer: compactText(document.getElementById("kk91Answer").value, "", 4000),
      do_rules: asArray(document.getElementById("kk91DoRules").value),
      dont_rules: asArray(document.getElementById("kk91DontRules").value),
      escalation_rule: compactText(document.getElementById("kk91Escalation").value, "", 1200),
      related_routes: asArray(document.getElementById("kk91Routes").value),
      updated_at: new Date().toISOString()
    };
  }

  function saveDraft() {
    var draft = readDraftFromEditor();
    if (!draft.kenji_safe_answer) {
      toast("ยังไม่มี Kenji Safe Answer");
      return;
    }
    state.cards.unshift(draft);
    saveCards();
    renderCards();
    toast("บันทึก Draft แล้ว");
  }

  function exportJson() {
    var blob = new Blob([JSON.stringify(state.cards, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "kenji-knowledge-v9-2-cards.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function boardMatches(card, filter) {
    var lane = String(card.lane || "").toLowerCase();
    var status = String(card.status || "").toLowerCase();
    var priority = String(card.priority || "").toLowerCase();
    var owner = String(card.owner || "").toLowerCase();
    if (filter === "per") return card.needs_per_decision === true || owner === "per" || owner === "ewvon";
    if (filter === "payment") return lane === "payment";
    if (filter === "need_info") return lane.indexOf("need") > -1 || status.indexOf("need") > -1 || status.indexOf("awaiting") > -1;
    if (filter === "critical") return priority === "critical" || lane === "risk";
    if (filter === "high") return priority === "high";
    return true;
  }

  function visibleBoardCards() {
    return state.boardCards.filter(function (card) { return boardMatches(card, state.boardFilter); });
  }

  function renderBoard() {
    var list = document.getElementById("kk91BoardList");
    if (!list) return;
    var cards = visibleBoardCards();
    setText('[data-board-count="total"]', state.boardCards.length);
    if (!cards.length) {
      state.selectedBoardId = "";
      list.innerHTML = '<div class="kk4__empty">ไม่มีรายการในตัวกรองนี้</div>';
      renderAssistant(null);
      return;
    }
    if (!state.selectedBoardId || !cards.some(function (card) { return card.id === state.selectedBoardId; })) {
      state.selectedBoardId = cards[0].id;
    }
    list.innerHTML = cards.map(function (card) {
      var selected = card.id === state.selectedBoardId ? " is-selected" : "";
      return '<button type="button" class="kk4__mini-card kk4__board-card' + selected + '" data-board-id="' + esc(card.id) + '"><b>' + esc(card.title) + '</b><span>' + esc(card.lane) + ' / ' + esc(card.status) + ' / ' + esc(card.priority) + '</span><p>' + esc(card.summary || card.next_action) + '</p></button>';
    }).join("");
    renderAssistant(getSelectedBoardCard());
  }

  function getSelectedBoardCard() {
    var cards = visibleBoardCards();
    return cards.filter(function (card) { return card.id === state.selectedBoardId; })[0] || cards[0] || null;
  }

  function renderAssistant(card) {
    var panel = document.getElementById("kk91AssistantPanel");
    if (!panel) return;
    if (!card) {
      panel.innerHTML = '<div class="kk4__assistant-lines"><p><b>Summary:</b> ไม่มีรายการในตัวกรองนี้</p><p><b>Risk:</b> ไม่มีความเสี่ยงใหม่จากตัวกรองนี้</p><p><b>Next Action:</b> เลือกตัวกรองอื่น หรือกด Refresh Board</p><p><b>Needs Per Decision:</b> ไม่ใช่ในตอนนี้</p></div>';
      return;
    }
    panel.innerHTML = '<div class="kk4__assistant-lines"><p><b>Summary:</b> ' + esc(card.summary) + '</p><p><b>Risk:</b> ' + esc(card.risk) + '</p><p><b>Next Action:</b> ' + esc(card.next_action) + '</p><p><b>Needs Per Decision:</b> ' + (card.needs_per_decision ? 'ใช่ ต้องให้ Per ตัดสินใจ' : 'ไม่ใช่ในตอนนี้') + '</p><button type="button" class="kk4__button kk4__button--gold" data-board-draft="' + esc(card.id) + '">สร้าง Knowledge Draft จากการ์ดนี้</button></div>';
  }

  function applyBoardStatus(payload) {
    if (!payload || payload.ok !== true || payload.mode !== "read_only") throw new Error("invalid_board_status");
    var counts = payload.counts || {};
    ["critical", "ready_for_per", "payment_pending", "need_info"].forEach(function (key) {
      setText('[data-board-count="' + key + '"]', Number(counts[key] || 0));
    });
    setText("#kk91BoardStatus", payload.source === "worker" ? "READ-ONLY LIVE จาก Worker" : "บอร์ดอ่านข้อมูลแบบ fallback");
  }

  function sanitizeBoardCard(rawCard, index) {
    var card = {};
    BOARD_CARD_KEYS.forEach(function (key) {
      if (key === "needs_per_decision") {
        card[key] = rawCard && rawCard[key] === true;
      } else {
        card[key] = compactText(rawCard && rawCard[key], "", key === "summary" ? 280 : 160);
      }
    });
    card.id = card.id || "card_" + index;
    card.title = card.title || "Untitled case";
    card.lane = card.lane || "Board";
    card.status = card.status || "Read Only";
    card.priority = card.priority || "Normal";
    card.risk = card.risk || "อ่านข้อมูล sanitized เท่านั้น";
    card.next_action = card.next_action || "รอข้อมูลเพิ่มเติม";
    card.owner = card.owner || "MMD";
    card.summary = card.summary || "อ่านสถานะและสรุปเคสเท่านั้น";
    return card;
  }

  function mapBoardLaneToKnowledgeLane(card) {
    var lane = String(card && card.lane || "").toLowerCase();
    var risk = String(card && card.risk || "").toLowerCase();
    if (lane === "payment") return "Payment";
    if (lane === "booking") return "Booking";
    if (lane === "risk") return /privacy|private|data|secure/.test(risk) ? "Privacy" : "Escalation";
    if (lane === "private review" || lane === "black card") return "Escalation";
    if (lane === "need info") return "Support";
    return "Support";
  }

  function buildDraftFromBoardCard(card) {
    var lane = mapBoardLaneToKnowledgeLane(card);
    return {
      title: "Board: " + compactText(card && card.title, "Operational review", 140),
      lane: lane,
      audience: "internal_only",
      language: "th",
      customer_question_examples: ["ลูกค้าถามเรื่อง " + compactText(card && card.title, "เคสนี้", 120)],
      kenji_safe_answer: buildSafeAnswer(card, lane),
      do_rules: [
        "ใช้ข้อมูล Board เป็นสัญญาณอ่านอย่างเดียว",
        "ตอบแบบ request/review/pending เท่านั้น",
        "ย้ำว่าต้องรอ MMD ตรวจสอบข้อมูลจากระบบก่อน"
      ],
      dont_rules: [
        "ห้ามบอกว่าชำระเงินสำเร็จหรืออนุมัติแล้ว",
        "ห้ามเปิดสมาชิกหรือปลดล็อกสิทธิ์",
        "ห้ามยืนยันการจองหรือสิทธิ์พิเศษใด ๆ"
      ],
      escalation_rule: buildEscalationRule(card),
      related_routes: []
    };
  }

  function buildSafeAnswer(card, lane) {
    var nextAction = compactText(card && card.next_action, "รอ MMD ตรวจสอบข้อมูลจากระบบก่อน", 180);
    var base = "Kenji ช่วยแนะนำขั้นตอนเบื้องต้นได้ครับ แต่ข้อมูลนี้เป็นสัญญาณอ่านอย่างเดียวจาก Board ต้องรอ MMD ตรวจสอบข้อมูลจากระบบก่อนเสมอ ";
    if (lane === "Payment") return base + "หลักฐานการชำระเงินยังไม่ใช่การยืนยันสถานะการชำระเงินหรือการเปิดสิทธิ์ใด ๆ ขั้นตอนถัดไปคือ " + nextAction + " ครับ";
    if (lane === "Booking") return base + "เคสนี้ยังเป็นคำขอหรือการ review เท่านั้น ยังไม่ใช่การยืนยันการจอง ขั้นตอนถัดไปคือ " + nextAction + " ครับ";
    if (lane === "Privacy") return base + "ถ้าเกี่ยวกับข้อมูลส่วนตัว ให้ใช้เฉพาะข้อมูลที่จำเป็นและส่งต่อให้ MMD ตรวจสอบอย่างปลอดภัย ขั้นตอนถัดไปคือ " + nextAction + " ครับ";
    if (lane === "Escalation") return base + "เคสนี้ต้องส่งให้ผู้รับผิดชอบตัดสินใจ ไม่ถือเป็นการอนุมัติ ปลดล็อก หรือยืนยันสิทธิ์ใด ๆ ขั้นตอนถัดไปคือ " + nextAction + " ครับ";
    return base + "ยังไม่ใช่การยืนยันสถานะ การชำระเงิน หรือสิทธิ์ใด ๆ ขั้นตอนถัดไปคือ " + nextAction + " ครับ";
  }

  function buildEscalationRule(card) {
    if (card && card.needs_per_decision) return "ต้องให้ Per หรือผู้รับผิดชอบตรวจและตัดสินใจก่อนตอบยืนยันใด ๆ";
    return "ถ้าเคสเกี่ยวกับยอดเงิน สิทธิ์สมาชิก การจอง หรือข้อมูลส่วนตัว ให้ส่งต่อ MMD ตรวจสอบก่อนตอบ";
  }

  function fillDraft(draft) {
    setValue("kk91Title", draft.title);
    setValue("kk91Lane", draft.lane);
    setValue("kk91Audience", draft.audience || "internal_only");
    setValue("kk91Language", draft.language || "th");
    setValue("kk91Questions", listText(draft.customer_question_examples, ""));
    setValue("kk91Answer", draft.kenji_safe_answer || "");
    setValue("kk91DoRules", listText(draft.do_rules, ""));
    setValue("kk91DontRules", listText(draft.dont_rules, ""));
    setValue("kk91Escalation", draft.escalation_rule || "");
    setValue("kk91Routes", listText(draft.related_routes, ""));
  }

  function createDraftFromBoard(cardId) {
    var card = state.boardCards.filter(function (item) { return item.id === cardId; })[0] || getSelectedBoardCard();
    if (!card) return;
    state.selectedBoardId = card.id;
    renderBoard();
    fillDraft(buildDraftFromBoardCard(card));
    setView("knowledge");
    toast("สร้าง Knowledge Draft จาก Board แล้ว");
  }

  function requireBoardAccess() {
    if (state.boardAuthed) return Promise.resolve(true);
    if (window.MMDGate && typeof window.MMDGate.requireMmdAuth === "function") {
      return Promise.resolve(window.MMDGate.requireMmdAuth({ scope: "internal_admin", silent: false })).then(function (result) {
        if (result === false) throw new Error("gate_denied");
        state.boardAuthed = true;
        return true;
      });
    }
    return fetch(ADMIN_AUTH_ENDPOINT, { credentials: "same-origin", cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("auth_failed");
        return response.json().catch(function () { return { ok: true }; });
      })
      .then(function (payload) {
        if (payload && (payload.ok === true || payload.authenticated === true || payload.user)) {
          state.boardAuthed = true;
          return true;
        }
        throw new Error("auth_denied");
      });
  }

  function refreshBoard() {
    if (state.boardLoading) return;
    state.boardLoading = true;
    setText("#kk91BoardStatus", "กำลังตรวจสิทธิ์ก่อนอ่าน Board...");
    requireBoardAccess()
      .then(function () {
        setText("#kk91BoardStatus", "กำลังอ่าน Board Worker...");
        return Promise.all([
          fetch(STATUS_ENDPOINT, { credentials: "same-origin", cache: "no-store" }).then(function (response) {
            if (!response.ok) throw new Error("status");
            return response.json();
          }),
          fetch(QUEUE_ENDPOINT, { credentials: "same-origin", cache: "no-store" }).then(function (response) {
            if (!response.ok) throw new Error("queue");
            return response.json();
          })
        ]);
      })
      .then(function (result) {
        applyBoardStatus(result[0]);
        var queue = result[1];
        if (!queue || queue.ok !== true || queue.mode !== "read_only" || !Array.isArray(queue.cards)) throw new Error("invalid_queue");
        state.boardCards = queue.cards.map(sanitizeBoardCard);
        state.selectedBoardId = state.boardCards[0] ? state.boardCards[0].id : "";
        renderBoard();
        toast("Board Updated");
      })
      .catch(function () {
        state.boardCards = fallbackBoard.map(sanitizeBoardCard);
        state.selectedBoardId = state.boardCards[0] ? state.boardCards[0].id : "";
        setText("#kk91BoardStatus", "ยังไม่ผ่านการตรวจสิทธิ์หรืออ่าน Worker ไม่สำเร็จ จึงใช้ Safe Mode fallback");
        renderBoard();
        toast("ใช้ Safe Mode fallback");
      })
      .finally(function () {
        state.boardLoading = false;
      });
  }

  root.addEventListener("click", function (event) {
    var viewButton = event.target.closest("[data-view]");
    if (viewButton) setView(viewButton.getAttribute("data-view"));
    var templateButton = event.target.closest("[data-use-template]");
    if (templateButton) useTemplate(templateButton.getAttribute("data-use-template"));
    var filterButton = event.target.closest("[data-board-filter]");
    if (filterButton) {
      state.boardFilter = filterButton.getAttribute("data-board-filter") || "all";
      root.querySelectorAll("[data-board-filter]").forEach(function (button) {
        button.classList.toggle("is-active", button === filterButton);
      });
      renderBoard();
    }
    var boardButton = event.target.closest("[data-board-id]");
    if (boardButton) {
      state.selectedBoardId = boardButton.getAttribute("data-board-id") || "";
      renderBoard();
    }
    var draftButton = event.target.closest("[data-board-draft]");
    if (draftButton) createDraftFromBoard(draftButton.getAttribute("data-board-draft"));
  });

  document.getElementById("kk91SaveDraft").addEventListener("click", saveDraft);
  document.getElementById("kk91Export").addEventListener("click", exportJson);
  document.getElementById("kk91RefreshBoard").addEventListener("click", refreshBoard);
  renderCards();
  renderCampaigns();
  renderBoard();
  setView("knowledge");
  setText("#kk91BoardStatus", SAFE_MODE_COPY);
})();
