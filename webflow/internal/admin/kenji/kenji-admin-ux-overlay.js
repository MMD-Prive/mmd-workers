(function () {
  "use strict";

  var root = document.getElementById("mmdKenjiAdminV1");
  if (!root || root.dataset.uxFriendly === "2") return;
  root.dataset.uxFriendly = "2";

  var MODEL_API = "/v1/admin/kenji/models";
  var BOARD_1 = "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a9d12b3e0f4263a60a49a93_Kenji%20AI%20Board%201.webp";
  var BOARD_2 = "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a9d12b3919ed96761ee14e7_Kenji%20Ai%20Board%202.webp";
  var GLASS_BOARD = "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a9d0eb52f159f58a1a1b469_Kenji%20Glass%20board.webp";
  var SIGIL_WALL = "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a61b1d19a4570eb40235c4b_SigilWall.webp";
  var reviewState = { items: [], loading: false, loaded: false, audit: {}, busy: {} };
  var lastPendingReview = "";

  var style = document.createElement("style");
  style.textContent =
    ".kux-help{margin:10px 0 0;padding:10px 12px;border:1px solid rgba(229,189,112,.28);border-radius:12px;background:rgba(229,189,112,.06);color:#d8c9b7;font-size:12px;line-height:1.55}" +
    ".kux-help b{color:#fff0dc}.kux-next{margin:12px 0;padding:14px;border:1px solid rgba(229,189,112,.28);border-radius:14px;background:rgba(229,189,112,.06)}" +
    ".kux-next strong{display:block;margin-bottom:5px;color:#e5bd70}.kux-steps{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.kux-steps span{padding:6px 9px;border:1px solid rgba(229,189,112,.2);border-radius:999px;color:#bcae9b;font-size:11px}.kux-steps .is-on{color:#e5bd70;border-color:#e5bd70;background:rgba(229,189,112,.08)}" +
    ".kux-board-banner{position:relative;display:block;width:100%;height:clamp(132px,14vw,210px);margin:0 0 18px;overflow:hidden;border:1px solid rgba(229,189,112,.24);border-radius:22px;background:#100907;box-shadow:0 22px 58px rgba(0,0,0,.24),inset 0 1px 0 rgba(255,255,255,.04)}" +
    ".kux-board-banner img{display:block;width:100%;height:100%;object-fit:cover;object-position:center 46%;opacity:.9;filter:saturate(.98) contrast(1.04) brightness(.96)}" +
    ".kux-board-banner:after{content:\"\";position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(7,4,3,.28) 0%,rgba(7,4,3,.04) 38%,rgba(7,4,3,.08) 72%,rgba(7,4,3,.3) 100%),linear-gradient(180deg,rgba(7,4,3,.02),rgba(7,4,3,.22))}" +
    ".kux-board-banner[data-board=\"2\"] img{object-position:center 50%}.kux-board-banner[data-board=\"glass\"] img{object-position:center 52%;opacity:.96}.kux-board-banner[data-board=\"sigil\"] img{object-position:center 46%;opacity:.9}" +
    "[data-panel=\"overview\"] .kux-board-banner{height:clamp(155px,16vw,230px)}" +
    ".kux-review-board{position:relative;margin:0 0 20px;padding:18px;border:1px solid rgba(229,189,112,.24);border-radius:22px;background:linear-gradient(150deg,rgba(24,15,10,.96),rgba(8,6,5,.94));box-shadow:0 24px 68px rgba(0,0,0,.26);overflow:hidden}" +
    ".kux-review-board:before{content:\"\";position:absolute;inset:0;background-image:linear-gradient(90deg,rgba(7,4,3,.9) 0%,rgba(7,4,3,.66) 48%,rgba(7,4,3,.78) 100%),var(--kux-review-art);background-size:cover;background-position:center;opacity:.38;pointer-events:none}" +
    ".kux-review-board>*{position:relative;z-index:1}.kux-review-board[data-art=\"glass\"]{--kux-review-art:url(\""+GLASS_BOARD+"\")}.kux-review-board[data-art=\"sigil\"]{--kux-review-art:url(\""+SIGIL_WALL+"\")}" +
    ".kux-review-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px}.kux-review-head span{display:block;color:#d9b568;font-size:11px;font-weight:800;letter-spacing:.16em}.kux-review-head h3{margin:5px 0 3px;color:#fff2df;font-size:22px}.kux-review-head p{margin:0;color:#b8aa99;font-size:13px}.kux-review-head button{white-space:nowrap}" +
    ".kux-review-list{display:grid;gap:12px}.kux-review-item{padding:15px;border:1px solid rgba(229,189,112,.2);border-radius:17px;background:rgba(8,6,5,.72);backdrop-filter:blur(10px)}" +
    ".kux-review-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.kux-review-top h4{margin:0;color:#fff0dc;font-size:16px}.kux-review-top small{display:block;margin-top:4px;color:#a99b8b}.kux-review-badge{padding:5px 8px;border:1px solid rgba(229,189,112,.28);border-radius:999px;color:#e5bd70;font-size:10px;text-transform:uppercase;letter-spacing:.08em}" +
    ".kux-review-copy{margin:11px 0;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.025);color:#d0c2b1;font-size:12px;line-height:1.55}.kux-review-meta{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.kux-review-meta span{padding:5px 7px;border-radius:8px;background:rgba(229,189,112,.07);color:#bcae9b;font-size:10px}" +
    ".kux-review-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.kux-review-actions button{min-height:38px}.kux-review-actions .is-publish{background:linear-gradient(135deg,#f5d181,#c99738);color:#160e08;font-weight:800;border-color:rgba(255,224,155,.7)}" +
    ".kux-qa-checks{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:10px}.kux-qa-checks label{display:flex;gap:6px;align-items:center;padding:8px;border:1px solid rgba(229,189,112,.16);border-radius:10px;background:rgba(0,0,0,.18);color:#bcae9b;font-size:10px}.kux-qa-checks input{accent-color:#d7a94c}" +
    ".kux-audit{margin-top:10px;padding:10px;border-top:1px solid rgba(229,189,112,.15)}.kux-audit article{display:flex;justify-content:space-between;gap:10px;padding:7px 0;color:#c9baa9;font-size:11px}.kux-audit article+article{border-top:1px solid rgba(255,255,255,.04)}.kux-inline-status{margin-top:8px;color:#e5bd70;font-size:11px}.kux-inline-status.is-bad{color:#ef9a86}" +
    "@media(max-width:820px){.kux-board-banner{height:118px;margin-bottom:14px;border-radius:17px}.kux-board-banner img{opacity:.95}[data-panel=\"overview\"] .kux-board-banner{height:132px}.kux-review-board{padding:14px;border-radius:17px}.kux-review-head{display:block}.kux-review-head button{margin-top:10px}.kux-review-top{display:block}.kux-review-badge{display:inline-block;margin-top:8px}.kux-qa-checks{grid-template-columns:1fr 1fr}.kux-review-actions button{flex:1 1 44%}}";
  document.head.appendChild(style);

  function primaryHeader() {
    var button = root.querySelector(".ka__headActions .is-primary");
    if (!button) return;
    if (button.textContent !== "Review Queue") button.textContent = "Review Queue";
    if (button.dataset.tab !== "models") button.dataset.tab = "models";
    button.title = "ดู Model Review Queue และดำเนิน Review → QA → Publish";
  }

  function panelVisuals() {
    root.querySelectorAll("[data-panel]").forEach(function (panel) {
      if (panel.querySelector(":scope > .kux-board-banner")) return;
      var title = panel.querySelector(".ka__title");
      if (!title) return;
      var name = panel.dataset.panel || "overview";
      var board = "1";
      var src = BOARD_1;
      if (["models", "knowledge", "routing"].includes(name)) { board = "2"; src = BOARD_2; }
      if (name === "qa") { board = "glass"; src = GLASS_BOARD; }
      if (name === "versions") { board = "sigil"; src = SIGIL_WALL; }
      var visual = document.createElement("div");
      visual.className = "kux-board-banner";
      visual.dataset.board = board;
      visual.setAttribute("aria-hidden", "true");
      var image = document.createElement("img");
      image.src = src;
      image.alt = "";
      image.loading = name === "overview" ? "eager" : "lazy";
      image.decoding = "async";
      visual.appendChild(image);
      title.insertAdjacentElement("afterend", visual);
    });
  }

  function knowledgeHelp() {
    var panel = root.querySelector('[data-panel="knowledge"]');
    if (!panel) return;
    var title = panel.querySelector(".ka__title");
    if (title && !title.querySelector(".kux-help")) {
      var note = document.createElement("div");
      note.className = "kux-help";
      note.innerHTML = "<b>ค้นหา Knowledge เท่านั้น</b><br>ถ้ากำลังหา GWs / EMs / ชื่อ Model ให้ไปแท็บ Models";
      title.appendChild(note);
    }
    var search = panel.querySelector("#kaSearch");
    if (search) search.placeholder = "ค้นหา Knowledge (ชื่อ / Knowledge ID)";
    var list = panel.querySelector("#kaList");
    if (!list) return;
    var empty = list.querySelector(".ka__empty");
    if (empty && empty.textContent.trim() === "ไม่พบข้อมูล") {
      empty.innerHTML = 'ไม่พบ Knowledge ที่ตรงกัน<br><button type="button" data-tab="models" style="margin-top:10px">ไปค้นหา Model</button>';
    }
  }

  function modelsHelp() {
    var panel = root.querySelector('[data-panel="models"]');
    if (!panel) return;
    var title = panel.querySelector(".ka__title");
    if (title) {
      var copy = "ค้นหา Model → เลือกข้อมูล → ตรวจ Preview → ส่งเข้า Review → QA → Publish";
      var p = title.querySelector("p");
      if (p && p.textContent !== copy) p.textContent = copy;
      if (!title.querySelector(".kux-help")) {
        var note = document.createElement("div");
        note.className = "kux-help";
        note.innerHTML = "<b>Publication authority เปิดแล้วแบบ Worker-owned</b><br>Draft เข้า Review ก่อนเสมอ · Review, QA และ Publish เป็นคนละ action พร้อม version guard + Audit Log";
        title.appendChild(note);
      }
    }

    var editor = panel.querySelector("#kaModelEditor");
    if (!editor) return;
    var recordHead = editor.querySelector(".ka__recordHead");
    if (recordHead && !editor.querySelector(".kux-next")) {
      var next = document.createElement("div");
      next.className = "kux-next";
      next.innerHTML = '<strong>ขั้นตอนของ Model</strong><div>Draft → Review → QA → Publish</div><div class="kux-steps"><span class="is-on">1 Draft</span><span>2 Review</span><span>3 QA</span><span>4 Publish</span></div>';
      recordHead.insertAdjacentElement("afterend", next);
    }

    var save = editor.querySelector('[data-model-action="save-draft"]');
    var preview = editor.querySelector("#kaModelPreview");
    var pending = preview && /Pending Review/i.test(preview.textContent || "");
    if (pending) {
      var nextBox = editor.querySelector(".kux-next");
      var pendingMarkup = '<strong>ส่งเข้า Review สำเร็จ ✓</strong><div>ตอนนี้อยู่ใน Review Queue · Production ยังไม่ถูกเปลี่ยน</div><div class="kux-steps"><span class="is-on">1 Draft</span><span class="is-on">2 Review</span><span>3 QA</span><span>4 Publish</span></div>';
      if (nextBox && nextBox.innerHTML !== pendingMarkup) nextBox.innerHTML = pendingMarkup;
      if (save) {
        save.textContent = "ส่งเข้า Review แล้ว ✓";
        save.disabled = true;
        save.title = "Draft นี้อยู่ใน Review Queue แล้ว";
      }
      var pendingId = (preview.textContent || "").trim();
      if (pendingId && pendingId !== lastPendingReview) {
        lastPendingReview = pendingId;
        window.setTimeout(loadReviews, 200);
      }
    } else if (save && !save.disabled) {
      save.textContent = "ส่งเข้า Review";
      save.title = "บันทึก Draft ไปยัง Review Queue; ยังไม่แก้ Production";
    }
  }

  function ensureReviewSurfaces() {
    var modelsPanel = root.querySelector('[data-panel="models"]');
    if (modelsPanel && !modelsPanel.querySelector("#kuxModelReviewBoard")) {
      var split = modelsPanel.querySelector(".ka__split");
      var board = reviewBoard("kuxModelReviewBoard", "MODEL REVIEW QUEUE", "Review → QA → Publish", "ตรวจ Draft ที่รออนุมัติ ก่อนแตะ Production", "glass");
      if (split) split.insertAdjacentElement("beforebegin", board); else modelsPanel.appendChild(board);
    }

    var qaPanel = root.querySelector('[data-panel="qa"]');
    if (qaPanel && !qaPanel.querySelector("#kuxQaReviewBoard")) {
      var oldQa = qaPanel.querySelector(".ka__card");
      if (oldQa && /build order/i.test(oldQa.textContent || "")) oldQa.remove();
      qaPanel.appendChild(reviewBoard("kuxQaReviewBoard", "MODEL QA", "QA & Safe Preview", "QA ต้องผ่านทั้ง policy path, preview, source และ privacy check", "glass"));
    }

    var versionsPanel = root.querySelector('[data-panel="versions"]');
    if (versionsPanel && !versionsPanel.querySelector("#kuxVersionReviewBoard")) {
      var oldVersions = versionsPanel.querySelector(".ka__card");
      if (oldVersions && /build order/i.test(oldVersions.textContent || "")) oldVersions.remove();
      versionsPanel.appendChild(reviewBoard("kuxVersionReviewBoard", "MODEL AUDIT", "Publish & Audit Log", "อ่านย้อนหลังว่าใคร Review, QA และ Publish เวอร์ชันใด", "sigil"));
    }
  }

  function reviewBoard(id, eyebrow, title, copy, art) {
    var section = document.createElement("section");
    section.className = "kux-review-board";
    section.id = id;
    section.dataset.art = art;
    section.innerHTML = '<div class="kux-review-head"><div><span>'+escapeHtml(eyebrow)+'</span><h3>'+escapeHtml(title)+'</h3><p>'+escapeHtml(copy)+'</p></div><button type="button" data-kux-review-refresh>Refresh</button></div><div class="kux-review-list"><div class="ka__empty">กำลังอ่าน Review Queue…</div></div>';
    return section;
  }

  function loadReviews() {
    if (reviewState.loading) return;
    reviewState.loading = true;
    fetch(MODEL_API + "/review-queue?status=all&limit=120", { credentials: "same-origin", cache: "no-store" })
      .then(readResponse)
      .then(function (data) {
        reviewState.items = Array.isArray(data.items) ? data.items : [];
        reviewState.loaded = true;
        renderReviewSurfaces();
      })
      .catch(function (error) {
        renderReviewError(error.message || "review_queue_unavailable");
      })
      .finally(function () { reviewState.loading = false; });
  }

  function renderReviewSurfaces() {
    renderBoard("kuxModelReviewBoard", reviewState.items.filter(function (item) { return item.stage !== "published"; }), false);
    renderBoard("kuxQaReviewBoard", reviewState.items.filter(function (item) { return item.stage !== "published"; }), false);
    renderBoard("kuxVersionReviewBoard", reviewState.items, true);
  }

  function renderBoard(id, items, versionsMode) {
    var board = document.getElementById(id);
    if (!board) return;
    var list = board.querySelector(".kux-review-list");
    if (!list) return;
    if (!items.length) {
      list.innerHTML = '<div class="ka__empty">'+(versionsMode ? "ยังไม่มี Model workflow event" : "ไม่มี Model ที่ค้าง Review / QA")+'</div>';
      return;
    }
    list.innerHTML = items.map(function (item) { return reviewItem(item, versionsMode); }).join("");
  }

  function reviewItem(item, versionsMode) {
    var stage = item.stage || "review";
    var reviewed = Boolean(item.reviewed_at);
    var reviewOn = reviewed || stage === "qa_passed" || stage === "published";
    var qaOn = stage === "qa_passed" || stage === "published";
    var publishOn = stage === "published";
    var audit = reviewState.audit[item.request_id];
    var busy = Boolean(reviewState.busy[item.request_id]);
    var canReview = stage === "review" && !reviewed && !busy;
    var canQa = stage === "review" && reviewed && !busy;
    var canPublish = stage === "qa_passed" && !busy;
    var statusLabel = publishOn ? "Published" : qaOn ? "QA Passed" : reviewed ? "Reviewed" : "Waiting Review";
    var copy = item.customer_safe_info || item.customer_safe_remark || "ยังไม่มี Customer-safe copy";
    var qaChecks = canQa ? '<div class="kux-qa-checks">'
      + qaCheck(item.request_id, "policy", "Policy path")
      + qaCheck(item.request_id, "preview", "Safe preview")
      + qaCheck(item.request_id, "source", "Source")
      + qaCheck(item.request_id, "privacy", "Privacy")
      + '</div>' : "";
    var actions = versionsMode && publishOn
      ? '<div class="kux-review-actions"><button data-kux-review-action="audit" data-request-id="'+attr(item.request_id)+'">Read Audit</button></div>'
      : '<div class="kux-review-actions">'
        + '<button data-kux-review-action="review" data-request-id="'+attr(item.request_id)+'" '+(canReview?'':'disabled')+'>Confirm Review</button>'
        + '<button data-kux-review-action="qa" data-request-id="'+attr(item.request_id)+'" '+(canQa?'':'disabled')+'>Run QA</button>'
        + '<button class="is-publish" data-kux-review-action="publish" data-request-id="'+attr(item.request_id)+'" '+(canPublish?'':'disabled')+'>Publish</button>'
        + '<button data-kux-review-action="audit" data-request-id="'+attr(item.request_id)+'">Audit</button>'
        + '</div>';
    return '<article class="kux-review-item" data-review-card="'+attr(item.request_id)+'">'
      + '<div class="kux-review-top"><div><h4>'+escapeHtml(item.working_name || item.model_key || item.request_id)+'</h4><small>'+escapeHtml(item.model_key || "")+' · '+escapeHtml(item.request_id)+' · workflow v'+escapeHtml(item.workflow_version)+'</small></div><span class="kux-review-badge">'+escapeHtml(statusLabel)+'</span></div>'
      + '<div class="kux-review-copy">'+escapeHtml(copy)+'</div>'
      + '<div class="kux-review-meta"><span>'+escapeHtml(item.model_tier || "Private")+'</span><span>'+escapeHtml(item.requested_visibility || "curated")+'</span><span>Review '+(reviewOn?'✓':'—')+'</span><span>QA '+(qaOn?'✓':'—')+'</span><span>Publish '+(publishOn?'✓':'—')+'</span>'+(item.published_profile_version?'<span>Profile v'+escapeHtml(item.published_profile_version)+'</span>':'')+'</div>'
      + (item.source_ref ? '<small>Source: '+escapeHtml(item.source_ref)+'</small>' : '<small>Source ref ยังไม่ระบุ</small>')
      + qaChecks + actions
      + '<div class="kux-inline-status" data-review-status="'+attr(item.request_id)+'"></div>'
      + (audit ? auditMarkup(audit.events || []) : "")
      + '</article>';
  }

  function qaCheck(requestId, key, label) {
    return '<label><input type="checkbox" data-qa-check="'+key+'" data-request-id="'+attr(requestId)+'"> '+escapeHtml(label)+'</label>';
  }

  function runReviewAction(action, requestId) {
    var item = reviewState.items.find(function (candidate) { return candidate.request_id === requestId; });
    if (!item || reviewState.busy[requestId]) return;
    if (action === "audit") return loadAudit(requestId);
    if (action === "qa") {
      var card = root.querySelector('[data-review-card="'+cssEscape(requestId)+'"]');
      var checks = card ? Array.prototype.slice.call(card.querySelectorAll('[data-qa-check][data-request-id="'+cssEscape(requestId)+'"]')) : [];
      if (checks.length !== 4 || checks.some(function (node) { return !node.checked; })) {
        return setInlineStatus(requestId, "ติ๊ก QA checks ทั้ง 4 ข้อก่อน Run QA", true);
      }
    }
    var payload = { expected_version: Number(item.workflow_version || 1) };
    if (action === "qa") {
      payload.qa = {
        policy_path_match: true,
        customer_safe_preview_checked: true,
        source_checked: true,
        privacy_checked: true,
      };
    }
    reviewState.busy[requestId] = true;
    setInlineStatus(requestId, action === "publish" ? "กำลัง Publish ไป Production…" : "กำลังบันทึก "+action+"…");
    fetch(MODEL_API + "/reviews/" + encodeURIComponent(requestId) + "/" + action, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify(payload),
    }).then(readResponse).then(function (data) {
      setInlineStatus(requestId, action === "publish" ? "Publish สำเร็จ ✓ · Production Profile v"+(data.published_profile_version || "") : action+" สำเร็จ ✓");
      return loadReviews();
    }).catch(function (error) {
      setInlineStatus(requestId, "ยังทำรายการไม่ได้ · "+(error.message || "workflow_error"), true);
    }).finally(function () {
      delete reviewState.busy[requestId];
    });
  }

  function loadAudit(requestId) {
    setInlineStatus(requestId, "กำลังอ่าน Audit Log…");
    fetch(MODEL_API + "/reviews/" + encodeURIComponent(requestId) + "/audit", { credentials: "same-origin", cache: "no-store" })
      .then(readResponse)
      .then(function (data) {
        reviewState.audit[requestId] = data;
        renderReviewSurfaces();
      })
      .catch(function (error) { setInlineStatus(requestId, "อ่าน Audit ไม่ได้ · "+(error.message || "audit_error"), true); });
  }

  function auditMarkup(events) {
    return '<div class="kux-audit">'+(events.length ? events.slice().reverse().map(function (event) {
      return '<article><b>'+escapeHtml(event.action || "event")+'</b><span>'+escapeHtml(event.actor_id || "")+' · '+escapeHtml(event.at || "")+'</span></article>';
    }).join("") : '<div class="ka__empty">ยังไม่มี Audit event</div>')+'</div>';
  }

  function setInlineStatus(requestId, text, bad) {
    root.querySelectorAll('[data-review-status="'+cssEscape(requestId)+'"]').forEach(function (node) {
      node.textContent = text;
      node.classList.toggle("is-bad", Boolean(bad));
    });
  }

  function renderReviewError(message) {
    ["kuxModelReviewBoard", "kuxQaReviewBoard", "kuxVersionReviewBoard"].forEach(function (id) {
      var board = document.getElementById(id);
      var list = board && board.querySelector(".kux-review-list");
      if (list) list.innerHTML = '<div class="ka__empty">Review Queue ยังโหลดไม่ได้ · '+escapeHtml(message)+'<br><button type="button" data-kux-review-refresh style="margin-top:10px">ลองใหม่</button></div>';
    });
  }

  function readResponse(response) {
    if (response.status === 401) {
      location.href = "/internal/admin/login?next=" + encodeURIComponent(location.pathname + location.search);
      throw new Error("unauthorized");
    }
    return response.json().catch(function () { return {}; }).then(function (data) {
      if (!response.ok || data.ok === false) throw new Error(typeof data.error === "string" ? data.error : "request_" + response.status);
      return data;
    });
  }

  function apply() {
    primaryHeader();
    panelVisuals();
    knowledgeHelp();
    modelsHelp();
    ensureReviewSurfaces();
    if (!reviewState.loaded && !reviewState.loading) loadReviews();
  }

  root.addEventListener("click", function (event) {
    var refresh = event.target.closest("[data-kux-review-refresh]");
    if (refresh) { event.preventDefault(); reviewState.loaded = false; return loadReviews(); }
    var action = event.target.closest("[data-kux-review-action]");
    if (action) {
      event.preventDefault();
      event.stopPropagation();
      return runReviewAction(action.dataset.kuxReviewAction, action.dataset.requestId);
    }
  }, true);

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>\"]/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[character];
    });
  }
  function attr(value) { return escapeHtml(value).replace(/'/g, "&#39;"); }
  function cssEscape(value) { return window.CSS && CSS.escape ? CSS.escape(String(value)) : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&"); }

  apply();
  new MutationObserver(apply).observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["disabled"]
  });
})();