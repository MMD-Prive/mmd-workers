/*
  Kenji Knowledge V9.1 Webflow Loader
  Webflow needs only 3 lines: CSS link, #mmdKenjiKnowledgeV9 placeholder, this script.
  This file injects the HTML shell and runs local Knowledge + read-only Board Bridge logic.
*/
(function () {
  "use strict";

  var ROOT_ID = "mmdKenjiKnowledgeV9";
  var STORAGE_KEY = "mmd_kenji_knowledge_v9_cards";
  var STATUS_ENDPOINT = "/v1/sigil/board/status";
  var QUEUE_ENDPOINT = "/v1/sigil/board/queue";
  var SAFE_MODE_COPY = "Safe Mode พร้อมอ่าน แต่ยังไม่มีข้อมูลจาก Worker";
  var img = {
    hero: "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a56f9510d5f16d76cae7435_Kenji%20Know01.webp",
    campaign: "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a56f951f9c3e0c7ffe9465c_Kenji%20Know02.webp",
    archive: "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a56f9517de7ea880dcda72b_Kenji%20Know033.webp",
    safety: "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a56f95105a7994eb5995e87_Kenji%20Know04.webp",
    runtime: "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a56fb9a0acae936c0c362e5_Kenji%20Know05.webp",
    library: "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a56f951825c9b71c0900b98_Kenji%20Know05.webp"
  };

  var starterCards = [
    {
      id: "payment-proof-under-review-th",
      status: "published",
      lane: "payment",
      audience: "member",
      language: "th",
      title: "ลูกค้าส่งสลิปแล้วถามว่าจ่ายสำเร็จหรือยัง",
      safe_answer: "ผมรับทราบว่าคุณส่งหลักฐานแล้วครับ แต่ยังยืนยันสถานะชำระเงินจากข้อความเพียงอย่างเดียวไม่ได้ MMD จะตรวจผ่านระบบอย่างเป็นทางการก่อนเปลี่ยนสถานะครับ",
      forbidden_actions: "mark_paid, verify_slip, unlock_membership",
      routes: "/sigil/pay"
    },
    {
      id: "member-status-review-required-th",
      status: "published",
      lane: "membership",
      audience: "member",
      language: "th",
      title: "สมาชิกถามว่าสถานะ active แล้วหรือยัง",
      safe_answer: "ผมช่วยแนะนำขั้นตอนตรวจสถานะได้ครับ แต่ยังไม่สามารถยืนยัน active หรือ unlock สิทธิ์แทนระบบได้ ต้องให้ MMD ตรวจสอบจากข้อมูลจริงก่อนเสมอครับ",
      forbidden_actions: "unlock_membership, confirm_vip, confirm_blackcard",
      routes: "/member/dashboard, /member/membership"
    }
  ];

  var campaignTemplates = [
    {
      id: "current-client-six-months",
      title: "Current Client +6 Months Extension",
      lane: "membership",
      safe_answer: "เบื้องต้นเคสนี้อาจอยู่ในกลุ่มลูกค้าปัจจุบันที่สามารถขอตรวจสถานภาพสมาชิกได้ครับ หาก MMD ตรวจสอบจากระบบแล้วพบว่ายังอยู่ในรอบสมาชิก อาจได้รับการยืดเวลาสมาชิกเพิ่ม 6 เดือนตามแคมเปญ Member Status Review 2026 ทั้งนี้สิทธิ์จะมีผลหลัง MMD ตรวจสอบเรียบร้อยแล้วเท่านั้นครับ"
    },
    {
      id: "expired-client-renewal",
      title: "Expired Client Renewal Bonus",
      lane: "renewal",
      safe_answer: "ถ้าเคยเป็นลูกค้า MMD แต่ข้อมูลล่าสุดเกินรอบสมาชิกแล้ว เคสนี้อาจอยู่ในกลุ่มต่ออายุครับ MMD สามารถตรวจสถานภาพและแนะนำโปร Renewal เพื่อกลับมา active พร้อมรับ Points และ bonus extension ตามเงื่อนไขแคมเปญได้ ทั้งนี้ต้องให้ MMD ตรวจสอบจากระบบและยืนยันก่อนเสมอครับ"
    },
    {
      id: "new-member-welcome-points",
      title: "New Member Welcome Points",
      lane: "membership",
      safe_answer: "ตอนนี้ผมยังไม่พบสถานะสมาชิกเดิมที่ยืนยันได้จากระบบครับ หากต้องการเริ่มต้นกับ MMD สามารถสมัครสมาชิกใหม่ผ่าน Telegram Preview และรับ Welcome Points ตามเงื่อนไขแคมเปญได้ครับ สิทธิ์และแต้มจะมีผลหลัง MMD ตรวจสอบและยืนยันจากระบบเรียบร้อยแล้วเท่านั้นครับ"
    },
    {
      id: "unknown-status-review",
      title: "Unknown Status Review Guidance",
      lane: "support",
      safe_answer: "เคสนี้ควรให้ MMD ตรวจสอบสถานภาพจากข้อมูลจริงก่อนนะครับ ตอนนี้ผมยังไม่สามารถยืนยันได้ว่าเป็นสมาชิกปัจจุบัน หมดอายุ หรือเป็นลูกค้าใหม่ หากคุณส่งข้อมูลติดต่อที่เคยใช้ไว้ MMD จะช่วยตรวจสอบและแนะนำขั้นตอนที่เหมาะสมให้ครับ"
    },
    {
      id: "promotion-safety-boundary",
      title: "Promotion Safety Boundary",
      lane: "rules",
      safe_answer: "การตรวจสถานภาพ การยืดเวลาสมาชิก การต่ออายุ และการได้รับ Points จะมีผลเมื่อ MMD ตรวจสอบข้อมูลจากระบบเรียบร้อยแล้วเท่านั้น Kenji สามารถช่วยแนะนำขั้นตอนเบื้องต้นได้ แต่ไม่ถือเป็นการยืนยันสถานะ สิทธิ์ การชำระเงิน แต้ม หรือการอนุมัติใด ๆ"
    }
  ];

  var fallbackBoard = [
    { id: "fallback_payment", title: "Payment proof review", lane: "Payment", status: "รอตรวจสอบ", priority: "High", owner: "MMD", risk: "Slip evidence only", next_action: "ตรวจยอดจากระบบทางการก่อนตอบ", needs_per_decision: true, summary: "สลิปเป็นหลักฐานเท่านั้น ต้องตรวจยอดจริงก่อนเปลี่ยนสถานะ" },
    { id: "fallback_svip", title: "SVIP Review Candidate", lane: "Private Review", status: "ต้องพิจารณา", priority: "High", owner: "Per", risk: "Per manual decision only", next_action: "สรุป advisory ให้ Per", needs_per_decision: true, summary: "SVIP เป็นการตัดสินใจของ Per เท่านั้น" },
    { id: "fallback_black_card", title: "Black Card Private Review", lane: "Black Card", status: "private review", priority: "High", owner: "Ewvon", risk: "Ewvon private review only", next_action: "ห้ามอนุมัติอัตโนมัติ", needs_per_decision: true, summary: "Black Card เป็น private review เท่านั้น" }
  ];

  var placeholder = document.getElementById(ROOT_ID);
  if (!placeholder) return;

  placeholder.outerHTML = renderShell();
  var root = document.getElementById(ROOT_ID);
  if (!root) return;

  var state = {
    cards: loadCards(),
    view: "knowledge",
    boardCards: fallbackBoard.slice(),
    boardFilter: "all"
  };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>\"]/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char];
    });
  }

  function text(value, fallback) {
    var clean = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
    return clean.slice(0, 220) || fallback || "";
  }

  function renderShell() {
    return '<section id="mmdKenjiKnowledgeV9" class="kk4 kk4--v91" data-version="kenji-knowledge-v9-1-loader" aria-label="Kenji Knowledge V9.1">' +
      '<div class="kk4__ambient" aria-hidden="true"><span class="kk4__glow kk4__glow--gold"></span><span class="kk4__glow kk4__glow--violet"></span><span class="kk4__grid"></span></div>' +
      '<header class="kk4__topbar"><a class="kk4__brand" href="/internal/admin"><span class="kk4__brand-mark">K</span><span class="kk4__brand-copy"><strong>KENJI KNOWLEDGE</strong><small>V9.1 WEBFLOW LOADER / BOARD BRIDGE</small></span></a><div class="kk4__status-pill" data-state="ready"><span></span><b>Loader พร้อมใช้งาน</b></div></header>' +
      '<main class="kk4__container">' +
      '<section class="kk4__hero"><picture class="kk4__hero-image"><img src="' + img.hero + '" alt="Kenji Knowledge command room" loading="eager"></picture><div class="kk4__hero-overlay"></div><div class="kk4__hero-copy"><span class="kk4__eyebrow">MMD PRIVÉ / INTERNAL KNOWLEDGE ROOM</span><h1>ห้องสอน Kenji ให้ตอบอย่างปลอดภัย</h1><p>เขียน Knowledge Card, เตรียม Campaign Safe Answer และอ่านสัญญาณจาก Kenji Board แบบ read-only โดยไม่แตะการอนุมัติจริง</p><div class="kk4__hero-actions"><button type="button" class="kk4__button kk4__button--gold" data-view="knowledge">เขียน Knowledge</button><button type="button" class="kk4__button" data-view="campaign">Campaign Mode</button><button type="button" class="kk4__button" data-view="runtime">Runtime / Board</button></div></div></section>' +
      '<section class="kk4__metrics"><article><span>Published</span><strong data-count="published">0</strong><p>การ์ดที่ใช้เป็นคำตอบได้</p></article><article><span>Drafts</span><strong data-count="draft">0</strong><p>รอแก้และตรวจภาษา</p></article><article><span>Campaign</span><strong>5</strong><p>Member Status Review 2026</p></article><article><span>Board</span><strong data-board-count="total">0</strong><p>อ่านสถานะจาก /sigil/board</p></article></section>' +
      '<nav class="kk4__lane-tabs" aria-label="Knowledge lanes"><button type="button" data-view="knowledge" class="is-active">01 Knowledge</button><button type="button" data-view="campaign">02 Campaign</button><button type="button" data-view="runtime">03 Runtime</button></nav>' +
      '<section class="kk4__view is-active" data-panel="knowledge"><div class="kk4__workspace"><article class="kk4__card kk4__editor"><span class="kk4__mini-label">Knowledge Editor</span><h2>เขียน Safe Answer</h2><label>Title<input id="kk91Title" placeholder="เช่น ลูกค้าถามเรื่องสลิป"></label><label>Lane<select id="kk91Lane"><option value="payment">Payment</option><option value="membership">Membership</option><option value="renewal">Renewal</option><option value="booking">Booking</option><option value="rules">Rules</option><option value="support">Support</option></select></label><label>Safe Answer<textarea id="kk91Answer" rows="6" placeholder="คำตอบที่ Kenji พูดได้โดยไม่ข้ามอำนาจระบบ"></textarea></label><div class="kk4__form-row"><button class="kk4__button kk4__button--gold" type="button" id="kk91SaveDraft">Save Draft</button><button class="kk4__button" type="button" id="kk91Export">Export JSON</button></div></article><article class="kk4__card"><span class="kk4__mini-label">Knowledge Library</span><h2>คลัง Knowledge</h2><div class="kk4__card-list" id="kk91CardList"></div></article></div></section>' +
      '<section class="kk4__view" data-panel="campaign"><div class="kk4__image-panel"><img src="' + img.campaign + '" alt="Campaign review table" loading="lazy"><div><span class="kk4__mini-label">Campaign Mode</span><h2>Member Status Review 2026</h2><p>ตรวจลูกค้าปัจจุบัน ลูกค้าหมดอายุ ลูกค้าใหม่ และเคสไม่ชัด ก่อนให้ Kenji แนะนำคำตอบที่ไม่ยืนยันสิทธิ์แทนระบบ</p></div></div><div class="kk4__campaign-grid" id="kk91CampaignList"></div></section>' +
      '<section class="kk4__view" data-panel="runtime"><div class="kk4__runtime-hero"><img src="' + img.runtime + '" alt="Published runtime health" loading="lazy"><div><span class="kk4__mini-label">Published Runtime Health</span><h2>Board Bridge อ่านอย่างเดียว</h2><p id="kk91BoardStatus">Safe Mode พร้อมอ่าน แต่ยังไม่มีข้อมูลจาก Worker</p><button type="button" class="kk4__button kk4__button--gold" id="kk91RefreshBoard">Refresh Board</button></div></div><section class="kk4__metrics kk4__metrics--board"><article><span>Critical</span><strong data-board-count="critical">0</strong><p>เรื่องที่ต้องหยุดก่อนยืนยัน</p></article><article><span>Ready for Per</span><strong data-board-count="ready_for_per">0</strong><p>พร้อมให้ Per ตัดสินใจ</p></article><article><span>Payment Pending</span><strong data-board-count="payment_pending">0</strong><p>สลิปรอตรวจทางการ</p></article><article><span>Need Info</span><strong data-board-count="need_info">0</strong><p>ต้องขอข้อมูลเพิ่ม</p></article></section><div class="kk4__board-layout"><article class="kk4__card"><span class="kk4__mini-label">Board Queue</span><h2>คิวอ่านอย่างเดียว</h2><div class="kk4__filter-row"><button data-board-filter="all" class="is-active">All</button><button data-board-filter="per">Per</button><button data-board-filter="payment">Payment</button><button data-board-filter="need_info">Need Info</button><button data-board-filter="critical">Critical</button><button data-board-filter="high">High</button></div><div class="kk4__card-list" id="kk91BoardList"></div></article><aside class="kk4__card"><span class="kk4__mini-label">Safety Guard</span><h2>ห้ามข้ามเส้นนี้</h2><img class="kk4__side-image" src="' + img.safety + '" alt="Safety boundary" loading="lazy"><p>หน้านี้ไม่มีปุ่มอนุมัติ ไม่ยืนยันสลิป ไม่ unlock membership และไม่ confirm VIP / Black Card</p><div id="kk91AssistantPanel"></div></aside></div></section>' +
      '</main><div class="kk4__toast" id="kk91Toast" role="status" aria-live="polite"></div></section>';
  }

  function loadCards() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return Array.isArray(parsed) && parsed.length ? parsed : starterCards.slice();
    } catch (err) {
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
    window.setTimeout(function () { node.classList.remove("is-visible"); }, 1800);
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
    var published = state.cards.filter(function (card) { return card.status === "published"; }).length;
    var draft = state.cards.filter(function (card) { return card.status !== "published"; }).length;
    setText('[data-count="published"]', published);
    setText('[data-count="draft"]', draft);
  }

  function setText(selector, value) {
    var node = root.querySelector(selector);
    if (node) node.textContent = String(value);
  }

  function renderCards() {
    var list = document.getElementById("kk91CardList");
    if (!list) return;
    list.innerHTML = state.cards.map(function (card) {
      return '<article class="kk4__mini-card"><b>' + esc(card.title) + '</b><span>' + esc(card.lane) + ' / ' + esc(card.status) + '</span><p>' + esc(card.safe_answer) + '</p></article>';
    }).join("");
    updateCounts();
  }

  function renderCampaigns() {
    var list = document.getElementById("kk91CampaignList");
    if (!list) return;
    list.innerHTML = campaignTemplates.map(function (card) {
      return '<article class="kk4__campaign-card"><span>' + esc(card.lane) + '</span><h3>' + esc(card.title) + '</h3><p>' + esc(card.safe_answer) + '</p><button type="button" class="kk4__button" data-use-template="' + esc(card.id) + '">ส่งเข้า Editor</button></article>';
    }).join("");
  }

  function useTemplate(id) {
    var card = campaignTemplates.filter(function (item) { return item.id === id; })[0];
    if (!card) return;
    document.getElementById("kk91Title").value = card.title;
    document.getElementById("kk91Lane").value = card.lane;
    document.getElementById("kk91Answer").value = card.safe_answer;
    setView("knowledge");
    toast("ส่ง Campaign เข้า Editor แล้ว");
  }

  function saveDraft() {
    var title = text(document.getElementById("kk91Title").value, "Untitled Knowledge");
    var lane = text(document.getElementById("kk91Lane").value, "support");
    var answer = text(document.getElementById("kk91Answer").value, "");
    if (!answer) {
      toast("ยังไม่มี Safe Answer");
      return;
    }
    state.cards.unshift({
      id: "draft_" + Date.now(),
      status: "draft",
      lane: lane,
      audience: "member",
      language: "th",
      title: title,
      safe_answer: answer,
      forbidden_actions: "approve_payment, unlock_membership, confirm_blackcard",
      routes: "/member/dashboard",
      updated_at: new Date().toISOString()
    });
    saveCards();
    renderCards();
    toast("บันทึก Draft แล้ว");
  }

  function exportJson() {
    var blob = new Blob([JSON.stringify(state.cards, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "kenji-knowledge-v9-1-cards.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function boardMatches(card, filter) {
    var lane = String(card.lane || "").toLowerCase();
    var status = String(card.status || "").toLowerCase();
    var priority = String(card.priority || "").toLowerCase();
    var owner = String(card.owner || "").toLowerCase();
    if (filter === "per") return card.needs_per_decision === true || owner === "per" || owner === "ewvon";
    if (filter === "payment") return lane === "payment";
    if (filter === "need_info") return lane.indexOf("need") > -1 || status.indexOf("need") > -1;
    if (filter === "critical") return priority === "critical" || lane === "risk";
    if (filter === "high") return priority === "high";
    return true;
  }

  function renderBoard() {
    var list = document.getElementById("kk91BoardList");
    if (!list) return;
    var cards = state.boardCards.filter(function (card) { return boardMatches(card, state.boardFilter); });
    setText('[data-board-count="total"]', state.boardCards.length);
    if (!cards.length) {
      list.innerHTML = '<div class="kk4__empty">ไม่มีรายการในตัวกรองนี้</div>';
      renderAssistant(null);
      return;
    }
    list.innerHTML = cards.map(function (card, index) {
      return '<article class="kk4__mini-card" data-board-index="' + index + '"><b>' + esc(card.title) + '</b><span>' + esc(card.lane) + ' / ' + esc(card.status) + ' / ' + esc(card.priority) + '</span><p>' + esc(card.summary || card.next_action) + '</p></article>';
    }).join("");
    renderAssistant(cards[0]);
  }

  function renderAssistant(card) {
    var panel = document.getElementById("kk91AssistantPanel");
    if (!panel) return;
    if (!card) {
      panel.innerHTML = '<p>ยังไม่มีเคสที่เลือก</p>';
      return;
    }
    panel.innerHTML = '<div class="kk4__assistant-lines"><p><b>Summary:</b> ' + esc(card.summary) + '</p><p><b>Risk:</b> ' + esc(card.risk) + '</p><p><b>Next Action:</b> ' + esc(card.next_action) + '</p><p><b>Needs Per:</b> ' + (card.needs_per_decision ? 'ใช่ ต้องให้ Per ตัดสินใจ' : 'ไม่ใช่ในตอนนี้') + '</p></div>';
  }

  function applyBoardStatus(payload) {
    if (!payload || payload.ok !== true || payload.mode !== "read_only") throw new Error("invalid_board_status");
    var counts = payload.counts || {};
    ["critical", "ready_for_per", "payment_pending", "need_info"].forEach(function (key) {
      setText('[data-board-count="' + key + '"]', Number(counts[key] || 0));
    });
    setText("#kk91BoardStatus", payload.source === "worker" ? "READ-ONLY LIVE จาก Worker" : "บอร์ดอ่านข้อมูลแบบ fallback");
  }

  function sanitizeBoardCard(card, index) {
    return {
      id: text(card && card.id, "card_" + index),
      title: text(card && card.title, "Untitled case"),
      lane: text(card && card.lane, "Board"),
      status: text(card && card.status, "Read Only"),
      priority: text(card && card.priority, "Normal"),
      risk: text(card && card.risk, "อ่านข้อมูล sanitized เท่านั้น"),
      next_action: text(card && card.next_action, "รอข้อมูลเพิ่มเติม"),
      owner: text(card && card.owner, "MMD"),
      needs_per_decision: card && card.needs_per_decision === true,
      summary: text(card && card.summary, "อ่านสถานะและสรุปเคสเท่านั้น")
    };
  }

  function refreshBoard() {
    setText("#kk91BoardStatus", "กำลังอ่าน Board Worker...");
    Promise.all([
      fetch(STATUS_ENDPOINT, { credentials: "same-origin", cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error("status"); return r.json(); }),
      fetch(QUEUE_ENDPOINT, { credentials: "same-origin", cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error("queue"); return r.json(); })
    ]).then(function (result) {
      applyBoardStatus(result[0]);
      var queue = result[1];
      if (!queue || queue.ok !== true || queue.mode !== "read_only" || !Array.isArray(queue.cards)) throw new Error("invalid_queue");
      state.boardCards = queue.cards.map(sanitizeBoardCard);
      renderBoard();
      toast("Board Updated");
    }).catch(function () {
      state.boardCards = fallbackBoard.slice();
      setText("#kk91BoardStatus", SAFE_MODE_COPY);
      renderBoard();
      toast("ใช้ Safe Mode fallback");
    });
  }

  root.addEventListener("click", function (event) {
    var viewButton = event.target.closest("[data-view]");
    if (viewButton) setView(viewButton.getAttribute("data-view"));
    var templateButton = event.target.closest("[data-use-template]");
    if (templateButton) useTemplate(templateButton.getAttribute("data-use-template"));
    var boardFilter = event.target.closest("[data-board-filter]");
    if (boardFilter) {
      state.boardFilter = boardFilter.getAttribute("data-board-filter") || "all";
      root.querySelectorAll("[data-board-filter]").forEach(function (button) { button.classList.toggle("is-active", button === boardFilter); });
      renderBoard();
    }
  });

  document.getElementById("kk91SaveDraft").addEventListener("click", saveDraft);
  document.getElementById("kk91Export").addEventListener("click", exportJson);
  document.getElementById("kk91RefreshBoard").addEventListener("click", refreshBoard);

  renderCards();
  renderCampaigns();
  renderBoard();
  setView("knowledge");
  refreshBoard();
})();
