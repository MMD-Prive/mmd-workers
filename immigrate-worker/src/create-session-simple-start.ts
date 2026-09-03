export const CREATE_SESSION_SIMPLE_START_MODE = "kenji-airtable-v4";

const SIMPLE_START_CSS = `
/* Kenji Airtable Create Session v4 — presentation only. Backend gates remain authoritative. */
.mmd-cs-v14__heroArt,
.mmd-cs-v14__thumb,
.mmd-cs-v14 [data-cs-media],
.mmd-cs-v14 [data-cs-lane-image],
.mmd-cs-v14__lights,
.mmd-cs-v14__quickRow,
.mmd-cs-v14 [data-op-check-session],
.mmd-cs-v14 [data-op-refresh-models],
.mmd-cs-v14 [data-op-demo-client],
.mmd-cs-v14 [data-op-clear-client],
.mmd-cs-v14 [data-op-fill-demo],
.mmd-cs-v14 [data-op-fill-demo-job],
.mmd-cs-v14 [data-op-debug-toggle],
.mmd-cs-v14__compatFields,
.mmd-cs-v14__compatHidden,
.mmd-cs-v14 [data-simple-hidden="true"] {
  display: none !important;
}

.mmd-cs-v14:not(.is-simple-has-client) #work-panel {
  opacity: .42;
  transform: translateY(4px);
}

.mmd-cs-v14:not(.is-simple-has-client) #work-panel [data-op-work-type] {
  pointer-events: none;
}

.mmd-cs-v14:not(.is-simple-has-client) .mmd-cs-v14__advanced {
  display: none !important;
}

.mmd-cs-v14__kenjiGate {
  margin: 14px 14px 0;
  padding: 16px;
  border: 1px solid rgba(212,181,106,.22);
  border-radius: 22px;
  background: linear-gradient(145deg, rgba(212,181,106,.10), rgba(255,255,255,.025));
  box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
}

.mmd-cs-v14__kenjiGateTop {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.mmd-cs-v14__kenjiEyebrow {
  display: block;
  margin-bottom: 6px;
  color: rgba(242,223,170,.72);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: .14em;
  text-transform: uppercase;
}

.mmd-cs-v14__kenjiTitle {
  margin: 0;
  color: #fffdf8;
  font-size: clamp(20px, 3vw, 27px);
  line-height: 1.08;
  letter-spacing: -.02em;
}

.mmd-cs-v14__kenjiCopy {
  max-width: 760px;
  margin: 8px 0 0;
  color: rgba(248,243,235,.66);
  font-size: 12px;
  line-height: 1.6;
}

.mmd-cs-v14__kenjiBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 0 15px;
  border: 1px solid rgba(212,181,106,.36);
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(212,181,106,.22), rgba(212,181,106,.10));
  color: #f5e3ae;
  font-size: 11px;
  font-weight: 850;
  text-decoration: none;
  white-space: nowrap;
}

.mmd-cs-v14__kenjiVisuals {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 10px;
  margin-top: 14px;
}

.mmd-cs-v14__kenjiVisual {
  width: 100%;
  height: 190px;
  display: block;
  object-fit: cover;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 16px;
  background: #0b0b10;
}

.mmd-cs-v14__flowVisual {
  width: calc(100% - 28px);
  max-height: 360px;
  display: block;
  object-fit: cover;
  margin: 14px 14px 0;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 20px;
  background: #0b0b10;
}

.mmd-cs-v14__paymentVisual {
  width: 100%;
  display: block;
  object-fit: cover;
  margin-top: 14px;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 18px;
  background: #0b0b10;
}

.mmd-cs-v14__paymentVisual--mob { display: none; }

.mmd-cs-v14__airtableHint {
  margin: 10px 14px 0;
  padding: 10px 12px;
  border: 1px solid rgba(116,215,160,.16);
  border-radius: 14px;
  background: rgba(116,215,160,.04);
  color: rgba(248,243,235,.66);
  font-size: 11px;
  line-height: 1.55;
}

.mmd-cs-v14__airtableHint strong { color: #dff8e8; }

.mmd-cs-v14__noClient {
  margin: 12px 0 0;
  padding: 18px;
  border: 1px dashed rgba(212,181,106,.28);
  border-radius: 18px;
  background: rgba(212,181,106,.035);
  text-align: center;
}

.mmd-cs-v14__noClient strong {
  display: block;
  color: #fffdf8;
  font-size: 15px;
}

.mmd-cs-v14__noClient span {
  display: block;
  margin-top: 6px;
  color: rgba(248,243,235,.58);
  font-size: 11px;
}

.mmd-cs-v14__noClient a {
  display: inline-flex;
  margin-top: 12px;
  min-height: 40px;
  align-items: center;
  justify-content: center;
  padding: 0 14px;
  border: 1px solid rgba(212,181,106,.34);
  border-radius: 999px;
  background: rgba(212,181,106,.08);
  color: #f2dfaa;
  font-size: 11px;
  font-weight: 850;
  text-decoration: none;
}

.mmd-cs-v14 .mmdop__clientCard.is-manual-client,
.mmd-cs-v14 .mmdop__clientCard[data-manual-public-only="true"] {
  display: none !important;
}

@media (max-width: 719px) {
  .mmd-cs-v14__toolbarActions {
    display: grid !important;
    grid-template-columns: minmax(0,1fr) auto !important;
    width: 100%;
  }

  .mmd-cs-v14__toolbarActions [data-op-search-client] { width: 100%; }
  .mmd-cs-v14__toolbarActions a.mmd-cs-v14__btn { grid-column: 1 / -1; }

  .mmd-cs-v14__kenjiGateTop { display: block; }
  .mmd-cs-v14__kenjiBtn { width: 100%; margin-top: 14px; }
  .mmd-cs-v14__kenjiVisuals { grid-template-columns: 1fr; }
  .mmd-cs-v14__kenjiVisual { height: 210px; }
  .mmd-cs-v14__paymentVisual--desk { display: none; }
  .mmd-cs-v14__paymentVisual--mob { display: block; }
}

@media (prefers-reduced-motion: reduce) {
  .mmd-cs-v14 * { scroll-behavior: auto !important; transition: none !important; }
}
`;

const SIMPLE_START_SCRIPT = `
(function () {
  "use strict";

  var KENJI_INTAKE_PATH = "/internal/admin/kenji-client-intake";
  var CREATE_SESSION_PATH = "/internal/admin/jobs/create-session";
  var IMG_KENJI = "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a53f69aac6671f077397a31_Kenji%20know4.webp";
  var IMG_MEMBER = "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a548060e5132b9ba40ef0aa_Member%20Account.webp";
  var IMG_FLOW = "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a56c6f3a5c0c136eb7cbd7b_Wall%20a%20Long.webp";
  var IMG_PAY_DESK = "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a5685444a92de9e30f1ab45_Pay%20Renewal%20Desk.webp";
  var IMG_PAY_MOB = "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a5685441778e55896d23910_Pay%20Renewal%20Mob.webp";

  function make(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function image(src, className, alt) {
    var img = document.createElement("img");
    img.src = src;
    img.className = className;
    img.alt = alt;
    img.loading = "lazy";
    img.decoding = "async";
    return img;
  }

  function isChosen(value) {
    var content = String(value || "").trim();
    return Boolean(content && content !== "-");
  }

  function hasSelectedClient(value) {
    var content = String(value || "").trim().toLowerCase();
    return Boolean(content && content !== "-" && !content.startsWith("no client") && content !== "not selected");
  }

  function buildIntakeHref(value) {
    var params = new URLSearchParams();
    var name = String(value || "").trim();
    if (name) params.set("display_name", name);
    params.set("return_to", CREATE_SESSION_PATH);
    return KENJI_INTAKE_PATH + "?" + params.toString();
  }

  function boot() {
    var root = document.querySelector("[data-mmd-create-session-pro]");
    if (!root || root.getAttribute("data-simple-start-bound") === "1") return;

    root.setAttribute("data-simple-start-bound", "1");
    root.setAttribute("data-simple-start-mode", "kenji-airtable-v4");
    root.setAttribute("data-client-source", "airtable-canonical");

    var query = root.querySelector("[data-op-client-query]");
    var search = root.querySelector("[data-op-search-client]");
    var recent = root.querySelector("[data-op-load-recent]");
    var selectedName = root.querySelector("[data-op-selected-client-name]");
    var canonicalClientName = root.querySelector("[data-op-client-name]");
    var results = root.querySelector("[data-op-client-results]");
    var workButtons = Array.prototype.slice.call(root.querySelectorAll("[data-op-work-type]"));
    var laneGrid = root.querySelector("[data-op-folder-grid]");
    var lanePanel = laneGrid ? laneGrid.closest("section") : null;
    var modelPanel = root.querySelector("#model-panel");
    var gatePanel = root.querySelector("#gate-panel");
    var detailsControl = root.querySelector("[data-op-date]");
    var detailsPanel = detailsControl ? detailsControl.closest("section") : null;
    var reviewPanel = root.querySelector(".mmd-cs-v14__section--review");
    var dock = root.querySelector(".mmd-cs-v14__dock");
    var timer = 0;
    var scheduled = false;

    if (query) {
      query.setAttribute("placeholder", "LINE / โทร / Email / Member ID / Client ID");
      query.setAttribute("autocomplete", "off");
      query.setAttribute("autocapitalize", "off");
      query.setAttribute("spellcheck", "false");

      query.addEventListener("input", function () {
        clearTimeout(timer);
        var value = String(query.value || "").trim();
        if (value.length < 2) return;
        timer = window.setTimeout(function () {
          if (search) search.click();
        }, 320);
      });

      query.addEventListener("keydown", function (event) {
        if (event.key !== "Enter") return;
        event.preventDefault();
        clearTimeout(timer);
        if (search) search.click();
      });
    }

    if (search) search.textContent = "ค้นหา Client";
    if (recent) recent.textContent = "ลูกค้าล่าสุด";

    var clientSection = root.querySelector("#client-search");
    if (clientSection && !clientSection.querySelector("[data-kenji-airtable-gate]")) {
      var gate = make("div", "mmd-cs-v14__kenjiGate");
      gate.setAttribute("data-kenji-airtable-gate", "");

      var top = make("div", "mmd-cs-v14__kenjiGateTop");
      var body = make("div", "");
      body.appendChild(make("span", "mmd-cs-v14__kenjiEyebrow", "01 · KENJI CLIENT INTAKE → AIRTABLE"));
      body.appendChild(make("h2", "mmd-cs-v14__kenjiTitle", "Client ต้องอยู่ใน Airtable ก่อนเปิด Session"));
      body.appendChild(make("p", "mmd-cs-v14__kenjiCopy", "ถ้ายังไม่มี Client ให้ Kenji หา record เดิมจาก LINE / โทร / Email ก่อน แล้วค่อยสร้างใหม่เมื่อหาไม่เจอจริง Create Session จะใช้ canonical Client record เท่านั้น"));

      var action = make("a", "mmd-cs-v14__kenjiBtn", "+ เพิ่ม / ผูก Client");
      action.href = buildIntakeHref(query && query.value);
      top.appendChild(body);
      top.appendChild(action);
      gate.appendChild(top);

      var visuals = make("div", "mmd-cs-v14__kenjiVisuals");
      visuals.appendChild(image(IMG_KENJI, "mmd-cs-v14__kenjiVisual", "Kenji client intake"));
      visuals.appendChild(image(IMG_MEMBER, "mmd-cs-v14__kenjiVisual", "Canonical client account"));
      gate.appendChild(visuals);

      var toolbar = clientSection.querySelector(".mmd-cs-v14__toolbar");
      if (toolbar) toolbar.insertAdjacentElement("beforebegin", gate);
      else clientSection.insertAdjacentElement("afterbegin", gate);

      var hint = make("p", "mmd-cs-v14__airtableHint");
      hint.innerHTML = "<strong>Airtable Client only:</strong> ชื่อที่เปอร์เรียกสามารถเก็บเป็น alias ได้ แต่ไม่ใช้สร้าง identity ระหว่างเปิดงาน";
      if (toolbar) toolbar.insertAdjacentElement("afterend", hint);

      clientSection.appendChild(image(IMG_FLOW, "mmd-cs-v14__flowVisual", "Create Session flow overview"));
    }

    if (detailsPanel && !detailsPanel.querySelector("[data-payment-visual]")) {
      var desk = image(IMG_PAY_DESK, "mmd-cs-v14__paymentVisual mmd-cs-v14__paymentVisual--desk", "Session details and payment desktop");
      desk.setAttribute("data-payment-visual", "desktop");
      detailsPanel.appendChild(desk);
      var mob = image(IMG_PAY_MOB, "mmd-cs-v14__paymentVisual mmd-cs-v14__paymentVisual--mob", "Session details and payment mobile");
      mob.setAttribute("data-payment-visual", "mobile");
      detailsPanel.appendChild(mob);
    }

    function hideManualFallbackCards() {
      if (!results) return;
      var cards = Array.prototype.slice.call(results.querySelectorAll(".mmdop__clientCard"));
      var visible = 0;
      cards.forEach(function (card) {
        var raw = String(card.textContent || "");
        var manual = raw.indexOf("manual_name_pending_reconcile") !== -1 ||
          raw.indexOf("identity_pending_reconcile") !== -1 ||
          raw.indexOf("guest_public_only") !== -1 ||
          card.getAttribute("data-manual-public-only") === "true";
        if (manual) {
          card.classList.add("is-manual-client");
          card.setAttribute("aria-hidden", "true");
          card.tabIndex = -1;
        } else {
          visible += 1;
        }
      });

      var empty = results.querySelector("[data-kenji-no-client]");
      if (cards.length && visible === 0) {
        if (!empty) {
          var requestedName = String(query && query.value || "").trim();
          empty = make("div", "mmd-cs-v14__noClient");
          empty.setAttribute("data-kenji-no-client", "");
          empty.appendChild(make("strong", "", requestedName ? "ยังไม่มี canonical Client สำหรับ “" + requestedName + "”" : "ยังไม่มี canonical Client สำหรับรายการนี้"));
          empty.appendChild(make("span", "", "ข้อมูลที่กรอกในช่องสมาชิก / tier ด้านล่างยังไม่ใช่ Client identity และใช้เปิด Session ไม่ได้"));
          var link = make("a", "", requestedName ? "เพิ่ม / ผูก “" + requestedName + "” เป็น Client →" : "ไป Kenji Client Intake →");
          link.href = buildIntakeHref(requestedName);
          empty.appendChild(link);
          results.appendChild(empty);
        }
      } else if (empty) {
        empty.remove();
      }
    }

    function hideUntil(node, visible) {
      if (!node) return;
      node.setAttribute("data-simple-hidden", visible ? "false" : "true");
      node.setAttribute("aria-hidden", visible ? "false" : "true");
    }

    function hasCanonicalClient() {
      if (canonicalClientName) return Boolean(String(canonicalClientName.value || "").trim());
      return hasSelectedClient(selectedName && selectedName.textContent);
    }

    function updateFlow(hasClient, hasWork, hasLane, hasModel) {
      var order = ["client", "work", "lane", "model", "details", "review"];
      var done = { client: hasClient, work: hasWork, lane: hasLane, model: hasModel, details: false, review: false };
      var current = !hasClient ? "client" : !hasWork ? "work" : !hasLane ? "lane" : !hasModel ? "model" : "details";

      order.forEach(function (name) {
        var node = root.querySelector('[data-simple-step="' + name + '"]');
        if (!node) return;
        var isCurrent = name === current;
        node.classList.toggle("is-current", isCurrent);
        node.classList.toggle("is-done", Boolean(done[name]));
        if (isCurrent) node.setAttribute("aria-current", "step");
        else node.removeAttribute("aria-current");
      });
      root.setAttribute("data-simple-current-step", current);
    }

    function sync() {
      hideManualFallbackCards();

      var hasClient = hasCanonicalClient();
      var selectedWork = root.querySelector("[data-op-work-type].is-selected");
      var hasWork = hasClient && Boolean(selectedWork);
      var folderStat = root.querySelector("[data-op-stat-folder]");
      var modelStat = root.querySelector("[data-op-stat-model]");
      var hasLane = hasWork && isChosen(folderStat && folderStat.textContent);
      var hasModel = hasLane && isChosen(modelStat && modelStat.textContent);

      root.classList.toggle("is-simple-has-client", hasClient);
      root.classList.toggle("is-simple-has-work", hasWork);
      root.classList.toggle("is-simple-has-folder", hasLane);
      root.classList.toggle("is-simple-has-model", hasModel);

      workButtons.forEach(function (button) {
        button.setAttribute("aria-disabled", hasClient ? "false" : "true");
        button.tabIndex = hasClient ? 0 : -1;
      });

      hideUntil(lanePanel, hasWork);
      hideUntil(modelPanel, hasLane);
      hideUntil(gatePanel, hasModel);
      hideUntil(detailsPanel, hasModel);
      hideUntil(reviewPanel, hasModel);
      hideUntil(dock, hasModel);
      updateFlow(hasClient, hasWork, hasLane, hasModel);
    }

    function scheduleSync() {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(function () {
        scheduled = false;
        sync();
      });
    }

    workButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        window.setTimeout(function () {
          scheduleSync();
          if (lanePanel && lanePanel.getAttribute("data-simple-hidden") !== "true") {
            lanePanel.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }, 0);
      });
    });

    var observer = new MutationObserver(scheduleSync);
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "hidden"]
    });

    sync();

    window.setTimeout(function () {
      if (!hasCanonicalClient() && recent) recent.click();
    }, 180);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
`;

export function applyCreateSessionSimpleStart(html: string): string {
  let output = String(html || "");
  if (!output || output.includes(`data-simple-start-style="${CREATE_SESSION_SIMPLE_START_MODE}"`)) return output;

  output = output
    .replace(
      'placeholder="พิมพ์ชื่อ username phone line user id หรือ #hashtag"',
      'placeholder="LINE / โทร / Email / Member ID / Client ID"',
    )
    .replace('>search member</button>', '>ค้นหา Client</button>')
    .replace('>recent</button>', '>ลูกค้าล่าสุด</button>');

  output = output.replace(
    "</head>",
    `<style data-simple-start-style="${CREATE_SESSION_SIMPLE_START_MODE}">${SIMPLE_START_CSS}</style></head>`,
  );
  output = output.replace(
    "</body>",
    `<script data-simple-start-script="${CREATE_SESSION_SIMPLE_START_MODE}">${SIMPLE_START_SCRIPT}</script></body>`,
  );
  return output;
}