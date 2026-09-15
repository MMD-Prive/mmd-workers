(function () {
  "use strict";

  var root = document.getElementById("mmdKenjiAdminV1");
  if (!root || root.dataset.sigilBoardViewV1 === "1") return;
  root.dataset.sigilBoardViewV1 = "1";
  root.dataset.sigilBoardSimpleV2 = "1";

  var STATUS_API = "/v1/sigil/board/status";
  var QUEUE_API = "/v1/sigil/board/queue?limit=100";
  var boardState = {
    cards: [],
    filter: "all",
    selectedId: "",
    loading: false,
    loaded: false,
    lastChecked: "",
    source: "",
    hiddenRenewals: 0,
  };

  var style = document.createElement("style");
  style.textContent = [
    ".ksb-panel{padding:0 22px 28px}",
    ".ksb-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin:18px 0 14px}.ksb-head h2{margin:3px 0 6px;color:#fff0dc;font-size:28px;line-height:1.15}.ksb-head p{margin:0;max-width:700px;color:#ad9f90;font-size:12px;line-height:1.6}.ksb-kicker{display:block;color:#d9b568;font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}",
    ".ksb-head-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.ksb-button{min-height:40px;padding:9px 13px;border-radius:12px;border:1px solid rgba(229,189,112,.22);background:rgba(255,255,255,.025);color:#e7d9c6;font:inherit;font-size:11px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.ksb-button.is-primary{background:linear-gradient(135deg,#f0ce82,#c99b40);color:#160f08;border-color:transparent;font-weight:850}.ksb-button:disabled{opacity:.5;cursor:progress}",
    ".ksb-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:0 0 12px}.ksb-metric{padding:13px;border:1px solid rgba(229,189,112,.15);border-radius:14px;background:rgba(17,13,10,.9)}.ksb-metric span{display:block;color:#b6a795;font-size:11px}.ksb-metric strong{display:block;margin-top:4px;color:#fff0dc;font-size:26px;line-height:1}.ksb-metric small{display:block;margin-top:5px;color:#756b61;font-size:9px;line-height:1.4}",
    ".ksb-guide{display:flex;gap:8px;align-items:flex-start;margin:0 0 12px;padding:10px 12px;border:1px solid rgba(229,189,112,.12);border-radius:12px;background:rgba(229,189,112,.04);color:#bdae9c;font-size:10px;line-height:1.55}.ksb-guide b{color:#f0d494;white-space:nowrap}",
    ".ksb-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;margin:0 0 10px}.ksb-filters{display:flex;gap:7px;flex-wrap:wrap}.ksb-filter{padding:8px 11px;border-radius:999px;border:1px solid rgba(229,189,112,.16);background:rgba(255,255,255,.02);color:#ab9d8e;font:inherit;font-size:10px;cursor:pointer}.ksb-filter.is-on{border-color:#d9b568;background:rgba(229,189,112,.11);color:#f0d494}",
    ".ksb-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(320px,.75fr);gap:12px;align-items:start}.ksb-card{border:1px solid rgba(229,189,112,.18);border-radius:16px;background:linear-gradient(155deg,rgba(20,15,11,.96),rgba(8,6,5,.97));padding:14px}.ksb-card h3{margin:0 0 4px;color:#f4e5d0;font-size:16px}.ksb-card>p{margin:0 0 11px;color:#928579;font-size:11px;line-height:1.5}",
    ".ksb-queue{display:grid;gap:8px}.ksb-row{width:100%;text-align:left;padding:12px;border:1px solid rgba(229,189,112,.12);border-radius:12px;background:rgba(0,0,0,.17);color:#d9cbb9;font:inherit;cursor:pointer}.ksb-row:hover,.ksb-row.is-on{border-color:rgba(229,189,112,.52);background:rgba(229,189,112,.06)}.ksb-row-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.ksb-row b{display:block;color:#f4e5d0;font-size:12px;line-height:1.45}.ksb-badge{display:inline-flex;flex:0 0 auto;padding:4px 7px;border:1px solid rgba(229,189,112,.22);border-radius:999px;color:#d7b86e;font-size:9px}.ksb-meta{display:flex;gap:7px;flex-wrap:wrap;margin-top:6px;color:#84786d;font-size:9px}.ksb-row p{margin:7px 0 0;color:#c1b09d;font-size:10px;line-height:1.5}",
    ".ksb-detail{position:sticky;top:76px}.ksb-detail-grid{display:grid;gap:8px;margin-top:10px}.ksb-detail-item{padding:10px 11px;border:1px solid rgba(229,189,112,.11);border-radius:10px;background:rgba(0,0,0,.16)}.ksb-detail-item span{display:block;color:#887b70;font-size:9px;letter-spacing:.04em}.ksb-detail-item p{margin:4px 0 0;color:#d8c9b7;font-size:11px;line-height:1.55;white-space:pre-wrap}.ksb-decision{margin-top:10px;padding:10px 11px;border-radius:10px;border:1px solid rgba(229,189,112,.18);background:rgba(229,189,112,.05);color:#cbbca9;font-size:10px;line-height:1.55}.ksb-decision strong{color:#f0d494}.ksb-action{margin-top:10px;display:flex;gap:8px;flex-wrap:wrap}",
    ".ksb-system{margin-top:12px;border-top:1px solid rgba(229,189,112,.1);padding-top:10px}.ksb-system summary{cursor:pointer;color:#7f7469;font-size:9px}.ksb-system p{margin:7px 0 0;color:#6f655c;font-size:9px;line-height:1.5}",
    ".ksb-empty{padding:16px;border:1px dashed rgba(229,189,112,.16);border-radius:12px;color:#938678;font-size:11px;line-height:1.55}.ksb-status{min-height:16px;color:#d8b76c;font-size:10px}.ksb-status.is-bad{color:#ef9a86}",
    ".kso-nav [data-kso-board].is-on{border-color:#d9b568;background:rgba(229,189,112,.13);color:#f3d99e}",
    "@media(max-width:900px){.ksb-metrics{grid-template-columns:repeat(3,1fr)}.ksb-grid{grid-template-columns:1fr}.ksb-detail{position:static}.ksb-toolbar{align-items:flex-start;flex-direction:column}}",
    "@media(max-width:620px){.ksb-panel{padding:0 12px 22px}.ksb-head{flex-direction:column}.ksb-metrics{grid-template-columns:1fr 1fr 1fr}.ksb-metric{padding:10px}.ksb-metric span{font-size:9px}.ksb-metric strong{font-size:22px}.ksb-head h2{font-size:24px}.ksb-filters{width:100%}.ksb-filter{flex:1 1 auto}.ksb-head-actions{width:100%}.ksb-button{min-height:46px}.ksb-head-actions .ksb-button{width:100%}.ksb-guide{flex-direction:column}}"
  ].join("");
  document.head.appendChild(style);

  mountBoardNav();
  mountBoardPanel();
  bindBoard();
  syncFromUrl(true);

  function mountBoardNav() {
    var nav = root.querySelector(".kso-nav");
    if (!nav || nav.querySelector("[data-kso-board]")) return;
    var advanced = nav.querySelector("[data-kso-advanced]");
    var button = document.createElement("button");
    button.type = "button";
    button.setAttribute("data-kso-board", "");
    button.textContent = "งานที่ต้องดู";
    if (advanced) nav.insertBefore(button, advanced); else nav.appendChild(button);
  }

  function mountBoardPanel() {
    var main = root.querySelector("main");
    if (!main || root.querySelector("[data-kso-board-panel]")) return;
    var panel = document.createElement("section");
    panel.className = "ksb-panel";
    panel.hidden = true;
    panel.setAttribute("data-kso-board-panel", "");
    panel.innerHTML =
      '<div class="ksb-head"><div><span class="ksb-kicker">KENJI · งานที่ต้องดู</span><h2>เรื่องที่ต้องดูวันนี้</h2><p>Kenji คัดเฉพาะเรื่องที่ยังต้องดูมาให้ครับ เลือกหนึ่งรายการ แล้วดูแค่ 3 อย่าง: เกิดอะไรขึ้น · ต้องระวังอะไร · ทำอะไรต่อ</p></div><div class="ksb-head-actions"><button type="button" class="ksb-button is-primary" data-ksb-refresh>อัปเดตรายการ</button><span class="ksb-status" data-ksb-status></span></div></div>'
      + '<div class="ksb-guide"><b>วิธีใช้</b><span>เริ่มจาก “ต้องตัดสินใจ” ก่อน → เลือกเคส → ทำตาม “ทำอะไรต่อ” ทางขวา หากเป็นเรื่องเงินให้เปิดหน้าตรวจเงินจากปุ่มในเคสนั้น</span></div>'
      + '<div class="ksb-metrics"><article class="ksb-metric"><span>ต้องตัดสินใจ</span><strong data-ksb-count="decision">—</strong><small>ให้เปอร์ดู</small></article><article class="ksb-metric"><span>รอตรวจเงิน</span><strong data-ksb-count="payment">—</strong><small>ไปหน้า Payments</small></article><article class="ksb-metric"><span>ข้อมูลไม่ครบ</span><strong data-ksb-count="need_info">—</strong><small>ต้องขอเพิ่ม</small></article></div>'
      + '<div class="ksb-toolbar"><div class="ksb-filters" role="toolbar" aria-label="ตัวกรองงานที่ต้องดู"><button type="button" class="ksb-filter is-on" data-ksb-filter="all">ทั้งหมด</button><button type="button" class="ksb-filter" data-ksb-filter="decision">ต้องตัดสินใจ</button><button type="button" class="ksb-filter" data-ksb-filter="payment">รอตรวจเงิน</button><button type="button" class="ksb-filter" data-ksb-filter="need_info">ข้อมูลไม่ครบ</button><button type="button" class="ksb-filter" data-ksb-filter="critical">เสี่ยงสูง</button></div><span class="ksb-status" data-ksb-meta>กำลังอ่านรายการล่าสุด</span></div>'
      + '<div class="ksb-grid"><article class="ksb-card"><h3>รายการที่ยังต้องดู</h3><p data-ksb-summary>กำลังโหลดข้อมูลจริง</p><div class="ksb-queue" data-ksb-queue><div class="ksb-empty">กำลังรอข้อมูลจริงจาก Worker</div></div></article><aside class="ksb-card ksb-detail" data-ksb-detail><h3>เลือกหนึ่งรายการ</h3><p>แล้ว Kenji จะสรุปให้ว่าต้องทำอะไรต่อ</p><div class="ksb-empty">ยังไม่ได้เลือกเคส</div></aside></div>';
    main.appendChild(panel);
  }

  function bindBoard() {
    root.addEventListener("click", function (event) {
      var board = event.target.closest("[data-kso-board]");
      if (board) {
        event.preventDefault();
        showBoard(false);
        return;
      }
      var refresh = event.target.closest("[data-ksb-refresh]");
      if (refresh) {
        event.preventDefault();
        loadBoard(true);
        return;
      }
      var filter = event.target.closest("[data-ksb-filter]");
      if (filter) {
        event.preventDefault();
        boardState.filter = filter.dataset.ksbFilter || "all";
        root.querySelectorAll("[data-ksb-filter]").forEach(function (node) {
          node.classList.toggle("is-on", node.dataset.ksbFilter === boardState.filter);
        });
        renderQueue();
        return;
      }
      var row = event.target.closest("[data-ksb-card]");
      if (row) {
        event.preventDefault();
        boardState.selectedId = row.dataset.ksbCard || "";
        renderQueue();
        renderDetail();
      }
    });

    root.addEventListener("click", function (event) {
      if (!isBoardOpen()) return;
      if (event.target.closest("[data-kso-board]")) return;
      if (event.target.closest(".kso-nav [data-kso-home],.kso-nav [data-kso-scroll],.kso-nav [data-tab],.kso-nav [data-kso-advanced]")) leaveBoard();
    }, true);

    window.addEventListener("popstate", function () { syncFromUrl(true); });
  }

  function syncFromUrl(replace) {
    var view = new URL(location.href).searchParams.get("view");
    if (view === "board") showBoard(Boolean(replace));
    else if (isBoardOpen()) leaveBoard(true);
  }

  function showBoard(replace) {
    var panel = root.querySelector("[data-kso-board-panel]");
    if (!panel) return;
    root.querySelectorAll("main > section[data-panel]").forEach(function (node) { node.hidden = true; });
    panel.hidden = false;
    root.querySelectorAll(".kso-nav button").forEach(function (node) {
      node.classList.toggle("is-primary", node.hasAttribute("data-kso-board"));
    });
    var boardButton = root.querySelector("[data-kso-board]");
    if (boardButton) {
      boardButton.classList.add("is-on");
      boardButton.textContent = "งานที่ต้องดู";
    }
    setHeader("KENJI · งานที่ต้องดู", "เรื่องที่ต้องดู");
    updateUrl("board", replace);
    if (!boardState.loaded && !boardState.loading) loadBoard(false);
  }

  function leaveBoard(replace) {
    var panel = root.querySelector("[data-kso-board-panel]");
    if (panel) panel.hidden = true;
    var boardButton = root.querySelector("[data-kso-board]");
    if (boardButton) boardButton.classList.remove("is-on", "is-primary");
    var home = root.querySelector("[data-kso-home]");
    if (home) home.classList.add("is-primary");
    setHeader("KENJI · SINGLE OWNER", "สอน Kenji");
    updateUrl("", Boolean(replace));
  }

  function isBoardOpen() {
    var panel = root.querySelector("[data-kso-board-panel]");
    return Boolean(panel && !panel.hidden);
  }

  function updateUrl(view, replace) {
    var url = new URL(location.href);
    if (view) url.searchParams.set("view", view); else url.searchParams.delete("view");
    var method = replace ? "replaceState" : "pushState";
    if (history && history[method]) history[method]({}, "", url.pathname + url.search + url.hash);
  }

  function setHeader(eyebrowText, titleText) {
    var header = root.querySelector(".ka__header");
    if (!header) return;
    var eyebrow = header.querySelector("div > span");
    var title = header.querySelector("h1");
    if (eyebrow) eyebrow.textContent = eyebrowText;
    if (title) title.textContent = titleText;
  }

  function loadBoard(manual) {
    if (boardState.loading) return;
    boardState.loading = true;
    setLoading(true);
    setStatus(manual ? "กำลังอัปเดต…" : "กำลังโหลด…");
    Promise.all([boardRequest(STATUS_API), boardRequest(QUEUE_API)])
      .then(function (results) {
        applyStatus(results[0]);
        applyQueue(results[1]);
        boardState.loaded = true;
        setStatus("อัปเดตแล้ว");
      })
      .catch(function (error) {
        boardState.loaded = false;
        boardState.cards = [];
        renderCounts();
        renderQueue();
        renderDetail();
        setStatus("โหลดรายการไม่สำเร็จ", true);
        console.warn("MMD Kenji board read failed", error);
      })
      .finally(function () {
        boardState.loading = false;
        setLoading(false);
      });
  }

  function boardRequest(path) {
    return fetch(path, { credentials: "same-origin", cache: "no-store" }).then(function (response) {
      if (response.status === 401 || response.status === 403) {
        location.href = "/internal/admin/login?next=" + encodeURIComponent(location.pathname + location.search);
        throw new Error("unauthorized");
      }
      return response.text().then(function (textValue) {
        var data;
        try { data = textValue ? JSON.parse(textValue) : {}; } catch (_) { throw new Error("invalid_board_json"); }
        if (!response.ok || !data || data.ok !== true) throw new Error((data && data.error) || ("board_" + response.status));
        return data;
      });
    });
  }

  function applyStatus(data) {
    if (data.mode !== "read_only" || !data.counts || typeof data.counts !== "object") throw new Error("invalid_board_status");
    boardState.lastChecked = safeText(data.last_checked, "");
    boardState.source = safeText(data.source, "worker");
    var meta = root.querySelector("[data-ksb-meta]");
    if (meta) meta.textContent = boardState.lastChecked ? "ข้อมูลล่าสุดจากระบบ" : "ข้อมูลจริงจากระบบ";
  }

  function applyQueue(data) {
    if (data.mode !== "read_only" || !Array.isArray(data.cards)) throw new Error("invalid_board_queue");
    var sanitized = data.cards.map(sanitizeCard).filter(Boolean);
    boardState.hiddenRenewals = sanitized.filter(isRenewalCard).length;
    boardState.cards = sanitized.filter(function (card) { return !isRenewalCard(card); });
    var visibleSelected = boardState.cards.some(function (card) { return card.id === boardState.selectedId; });
    if (!visibleSelected) boardState.selectedId = firstUsefulCardId();
    renderCounts();
    var summary = root.querySelector("[data-ksb-summary]");
    if (summary) {
      summary.textContent = boardState.cards.length + " รายการที่ยังต้องดู" + (boardState.hiddenRenewals ? " · ตัดรายการต่ออายุออกแล้ว " + boardState.hiddenRenewals + " รายการ" : "");
    }
    renderQueue();
    renderDetail();
  }

  function sanitizeCard(card, index) {
    if (!card || typeof card !== "object") return null;
    return {
      id: safeText(card.id, "board_card_" + index),
      title: safeText(card.title, "รายการที่ต้องดู"),
      lane: safeText(card.lane, "Board"),
      status: safeText(card.status, "Read Only"),
      priority: safeText(card.priority, "Normal"),
      risk: safeText(card.risk, "Read-only advisory"),
      next_action: safeText(card.next_action, "ตรวจรายละเอียดรายการนี้"),
      owner: safeText(card.owner, "MMD"),
      needs_per_decision: card.needs_per_decision === true,
      summary: safeText(card.summary, "ข้อมูลสรุปจากระบบ"),
    };
  }

  function isRenewalCard(card) {
    var text = [card.title, card.lane, card.status, card.risk, card.next_action, card.summary].join(" ").toLowerCase();
    return /renewal|ต่ออายุ/.test(text);
  }

  function firstUsefulCardId() {
    var decision = boardState.cards.find(function (card) { return isDecision(card); });
    if (decision) return decision.id;
    return boardState.cards.length ? boardState.cards[0].id : "";
  }

  function renderCounts() {
    var counts = {
      decision: boardState.cards.filter(isDecision).length,
      payment: boardState.cards.filter(isPayment).length,
      need_info: boardState.cards.filter(isNeedInfo).length,
    };
    Object.keys(counts).forEach(function (key) {
      var node = root.querySelector('[data-ksb-count="' + key + '"]');
      if (node) node.textContent = String(counts[key]);
    });
  }

  function renderQueue() {
    var queue = root.querySelector("[data-ksb-queue]");
    if (!queue) return;
    var cards = boardState.cards.filter(matchesFilter).sort(sortCards);
    if (!cards.length) {
      queue.innerHTML = '<div class="ksb-empty">' + (boardState.loaded ? "ไม่มีรายการในกลุ่มนี้" : "ไม่มีข้อมูลจริงจาก Worker ในตอนนี้") + '</div>';
      return;
    }
    queue.innerHTML = cards.map(function (card) {
      var active = card.id === boardState.selectedId ? " is-on" : "";
      var badge = card.needs_per_decision ? "ต้องตัดสินใจ" : priorityLabel(card.priority);
      return '<button type="button" class="ksb-row' + active + '" data-ksb-card="' + attr(card.id) + '"><span class="ksb-row-top"><b>' + esc(card.title) + '</b><span class="ksb-badge">' + esc(badge) + '</span></span><span class="ksb-meta"><span>' + esc(laneLabel(card.lane)) + '</span><span>' + esc(statusLabel(card.status)) + '</span></span><p><strong>ต่อไป:</strong> ' + esc(card.next_action) + '</p></button>';
    }).join("");
  }

  function renderDetail() {
    var node = root.querySelector("[data-ksb-detail]");
    if (!node) return;
    var card = boardState.cards.find(function (item) { return item.id === boardState.selectedId; });
    if (!card) {
      node.innerHTML = '<h3>เลือกหนึ่งรายการ</h3><p>แล้ว Kenji จะสรุปให้ว่าต้องทำอะไรต่อ</p><div class="ksb-empty">ยังไม่มีเคสที่เลือก</div>';
      return;
    }
    var action = actionForCard(card);
    node.innerHTML = '<h3>' + esc(card.title) + '</h3><p>' + esc(laneLabel(card.lane)) + ' · ' + esc(statusLabel(card.status)) + '</p>'
      + '<div class="ksb-detail-grid">'
      + detail("เกิดอะไรขึ้น", card.summary)
      + detail("ต้องระวังอะไร", card.risk)
      + detail("ทำอะไรต่อ", card.next_action)
      + detail("คนดูเรื่องนี้", ownerLabel(card.owner))
      + '</div>'
      + '<div class="ksb-decision">' + (card.needs_per_decision ? '<strong>ต้องให้เปอร์ตัดสินใจ</strong><br>ดูข้อมูลด้านบนแล้วดำเนินการที่หน้าของงานนั้น' : '<strong>ยังไม่ต้องตัดสินใจตอนนี้</strong><br>ทำตาม “ทำอะไรต่อ” ได้เลย') + '</div>'
      + (action ? '<div class="ksb-action"><a class="ksb-button is-primary" href="' + attr(action.href) + '">' + esc(action.label) + '</a></div>' : '')
      + '<details class="ksb-system"><summary>รายละเอียดระบบ</summary><p>หน้านี้อ่านอย่างเดียวจาก Worker และไม่เปลี่ยน Money Truth, Membership/Access หรือ Private Model เอง</p></details>';
  }

  function actionForCard(card) {
    if (isPayment(card)) return { href: "/internal/admin/payments", label: "ไปหน้าตรวจเงิน" };
    return null;
  }

  function isDecision(card) {
    return card.needs_per_decision === true || String(card.owner).toLowerCase() === "per" || String(card.priority).toLowerCase() === "critical";
  }

  function isPayment(card) {
    var text = (card.lane + " " + card.status + " " + card.next_action).toLowerCase();
    return /payment|slip|deposit|เงิน|สลิป|มัดจำ/.test(text);
  }

  function isNeedInfo(card) {
    var text = (card.lane + " " + card.status + " " + card.next_action).toLowerCase();
    return /need info|awaiting info|missing info|ข้อมูลเพิ่ม|ข้อมูลไม่ครบ|ขอข้อมูล/.test(text);
  }

  function isCritical(card) {
    return String(card.priority).toLowerCase() === "critical" || String(card.lane).toLowerCase() === "risk";
  }

  function matchesFilter(card) {
    var filter = boardState.filter;
    if (filter === "decision") return isDecision(card);
    if (filter === "payment") return isPayment(card);
    if (filter === "need_info") return isNeedInfo(card);
    if (filter === "critical") return isCritical(card);
    return true;
  }

  function sortCards(a, b) {
    var scoreA = cardScore(a);
    var scoreB = cardScore(b);
    if (scoreA !== scoreB) return scoreB - scoreA;
    return a.title.localeCompare(b.title, "th");
  }

  function cardScore(card) {
    var score = 0;
    if (card.needs_per_decision) score += 100;
    if (isCritical(card)) score += 80;
    if (isPayment(card)) score += 40;
    if (isNeedInfo(card)) score += 20;
    return score;
  }

  function laneLabel(value) {
    var text = String(value || "").toLowerCase();
    if (text === "payment") return "เรื่องเงิน";
    if (text === "need info") return "ข้อมูลไม่ครบ";
    if (text === "private review") return "ตรวจ Private";
    if (text === "risk") return "เรื่องเสี่ยง";
    if (text === "campaign") return "แคมเปญ";
    return value || "งาน";
  }

  function statusLabel(value) {
    var text = String(value || "").toLowerCase();
    if (text.indexOf("need info") >= 0 || text.indexOf("awaiting info") >= 0) return "ข้อมูลไม่ครบ";
    if (text.indexOf("payment") >= 0 || text.indexOf("pending") >= 0) return "กำลังรอตรวจ";
    if (text.indexOf("critical") >= 0) return "เร่งด่วน";
    if (text.indexOf("ready") >= 0) return "พร้อมให้ดู";
    return value || "รอดู";
  }

  function priorityLabel(value) {
    var text = String(value || "").toLowerCase();
    if (text === "critical") return "เร่งด่วน";
    if (text === "high") return "สำคัญ";
    if (text === "low") return "รอได้";
    return "ทั่วไป";
  }

  function ownerLabel(value) {
    var text = String(value || "");
    if (text.toLowerCase() === "per") return "เปอร์";
    if (text.toLowerCase() === "kenji") return "Kenji";
    return text || "MMD";
  }

  function detail(label, textValue) {
    return '<div class="ksb-detail-item"><span>' + esc(label) + '</span><p>' + esc(textValue || "—") + '</p></div>';
  }

  function setLoading(on) {
    var button = root.querySelector("[data-ksb-refresh]");
    if (button) {
      button.disabled = Boolean(on);
      button.textContent = on ? "กำลังอัปเดต…" : "อัปเดตรายการ";
    }
  }

  function setStatus(message, bad) {
    var node = root.querySelector("[data-ksb-status]");
    if (!node) return;
    node.textContent = message || "";
    node.classList.toggle("is-bad", Boolean(bad));
  }

  function safeText(value, fallback) {
    var textValue = String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, 240);
    return textValue || fallback || "";
  }

  function attr(value) { return esc(value).replace(/'/g, "&#39;"); }
  function esc(value) { return String(value == null ? "" : value).replace(/[&<>\"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }
})();
