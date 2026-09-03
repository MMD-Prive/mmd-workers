export const CREATE_SESSION_SIMPLE_START_MODE = "simple-start-v2";

const SIMPLE_START_CSS = `
/* Per Owner Simple Start v2 — presentation only. Backend gates remain authoritative. */
/* Emergency visual scrub: Create Session must not render the portrait media set. */
.mmd-cs-v14__heroArt,
.mmd-cs-v14__thumb,
.mmd-cs-v14 [data-cs-media],
.mmd-cs-v14 [data-cs-lane-image] {
  display: none !important;
}

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
.mmd-cs-v14__compatHidden {
  display: none !important;
}

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

.mmd-cs-v14__simpleHint {
  margin: 10px 14px 0;
  padding: 10px 12px;
  border: 1px solid rgba(212,181,106,.18);
  border-radius: 14px;
  background: rgba(212,181,106,.045);
  color: rgba(248,243,235,.66);
  font-size: 11px;
  line-height: 1.55;
}

.mmd-cs-v14__simpleHint strong {
  color: #f2dfaa;
}

.mmd-cs-v14 .mmdop__clientCard.is-manual-client {
  position: relative;
  grid-template-columns: 60px minmax(0,1fr) 40px;
  min-height: 122px;
  padding: 18px;
  overflow: hidden;
  border-color: rgba(212,181,106,.38);
  background:
    radial-gradient(circle at 92% 5%, rgba(212,181,106,.16), transparent 34%),
    linear-gradient(135deg, rgba(212,181,106,.11), rgba(8,8,13,.76) 46%, rgba(116,215,160,.035));
  box-shadow: 0 18px 42px rgba(0,0,0,.22), inset 0 1px 0 rgba(255,255,255,.035);
  transition: transform .22s ease, border-color .22s ease, background .22s ease, box-shadow .22s ease;
}

.mmd-cs-v14 .mmdop__clientCard.is-manual-client:hover {
  transform: translateY(-2px);
  border-color: rgba(212,181,106,.62);
  box-shadow: 0 22px 52px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.05);
}

.mmd-cs-v14 .mmdop__clientCard.is-manual-client.is-selected {
  border-color: rgba(212,181,106,.82);
  background:
    radial-gradient(circle at 92% 5%, rgba(212,181,106,.22), transparent 35%),
    linear-gradient(135deg, rgba(212,181,106,.16), rgba(8,8,13,.78) 48%, rgba(116,215,160,.055));
  box-shadow: 0 20px 50px rgba(0,0,0,.3), 0 0 0 1px rgba(212,181,106,.12) inset;
}

.mmd-cs-v14 .mmdop__manualAvatar {
  width: 60px;
  height: 60px;
  border-radius: 20px;
  border-color: rgba(242,223,170,.34);
  background: linear-gradient(145deg, rgba(212,181,106,.2), rgba(212,181,106,.065));
  color: #f6e6b8;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 8px 24px rgba(0,0,0,.18);
  font-size: 21px;
}

.mmd-cs-v14 .mmdop__manualBody {
  display: block;
  min-width: 0;
}

.mmd-cs-v14 .mmdop__manualEyebrow {
  display: block;
  margin: 0 0 5px;
  color: rgba(242,223,170,.72);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: .13em;
  text-transform: uppercase;
}

.mmd-cs-v14 .mmdop__manualTitle {
  display: block;
  color: #fffdf8;
  font-size: clamp(20px, 3vw, 25px);
  line-height: 1.05;
  letter-spacing: -.02em;
}

.mmd-cs-v14 .mmdop__manualCopy {
  display: block;
  margin-top: 7px;
  color: rgba(248,243,235,.64);
  font-size: 11px;
  line-height: 1.45;
}

.mmd-cs-v14 .mmdop__manualMeta {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 11px;
}

.mmd-cs-v14 .mmdop__manualPill {
  display: inline-flex;
  align-items: center;
  min-height: 25px;
  padding: 0 9px;
  border: 1px solid rgba(255,255,255,.09);
  border-radius: 999px;
  background: rgba(255,255,255,.035);
  color: rgba(248,243,235,.62);
  font-size: 9px;
  font-weight: 850;
  letter-spacing: .02em;
}

.mmd-cs-v14 .mmdop__manualPill--ready {
  border-color: rgba(116,215,160,.23);
  background: rgba(116,215,160,.075);
  color: #dff8e8;
}

.mmd-cs-v14 .mmdop__manualGo {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  align-self: center;
  border: 1px solid rgba(212,181,106,.22);
  border-radius: 50%;
  background: rgba(212,181,106,.065);
  color: #f2dfaa;
  font-size: 22px;
  line-height: 1;
}

.mmd-cs-v14 .mmd-cs-v14__pickedCard.is-manual-client {
  border-color: rgba(212,181,106,.32);
  background: linear-gradient(135deg, rgba(212,181,106,.085), rgba(255,255,255,.018));
}

@media (max-width: 719px) {
  .mmd-cs-v14__toolbarActions {
    display: grid !important;
    grid-template-columns: minmax(0,1fr) auto auto !important;
    width: 100%;
  }

  .mmd-cs-v14__toolbarActions [data-op-search-client] {
    width: 100%;
  }

  .mmd-cs-v14__toolbarActions a.mmd-cs-v14__btn {
    grid-column: 1 / -1;
  }

  .mmd-cs-v14 .mmdop__clientCard.is-manual-client {
    grid-template-columns: 54px minmax(0,1fr) 34px;
    gap: 12px;
    min-height: 116px;
    padding: 16px;
    border-radius: 22px;
  }

  .mmd-cs-v14 .mmdop__manualAvatar {
    width: 54px;
    height: 54px;
    border-radius: 18px;
    font-size: 19px;
  }

  .mmd-cs-v14 .mmdop__manualGo {
    width: 32px;
    height: 32px;
    font-size: 19px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .mmd-cs-v14 .mmdop__clientCard.is-manual-client {
    transition: none;
  }
}
`;

const SIMPLE_START_SCRIPT = `
(function () {
  "use strict";

  function boot() {
    var root = document.querySelector("[data-mmd-create-session-pro]");
    if (!root || root.getAttribute("data-simple-start-bound") === "1") return;

    root.setAttribute("data-simple-start-bound", "1");
    root.setAttribute("data-simple-start-mode", "simple-start-v2");

    var query = root.querySelector("[data-op-client-query]");
    var search = root.querySelector("[data-op-search-client]");
    var recent = root.querySelector("[data-op-load-recent]");
    var selectedName = root.querySelector("[data-op-selected-client-name]");
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
      query.setAttribute("placeholder", "พิมพ์ชื่อที่เปอร์จำ เช่น หนุ่ย");
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

      window.setTimeout(function () {
        var picked = selectedName && String(selectedName.textContent || "").trim();
        if (!picked || picked === "-") query.focus();
      }, 100);
    }

    if (search) search.textContent = "ค้นหา";
    if (recent) recent.textContent = "ล่าสุด";

    var clientSection = root.querySelector("#client-search");
    if (clientSection && !clientSection.querySelector("[data-simple-hint]")) {
      var hint = document.createElement("p");
      hint.className = "mmd-cs-v14__simpleHint";
      hint.setAttribute("data-simple-hint", "");
      hint.innerHTML = "<strong>หาแบบที่เปอร์จำ:</strong> ชื่อที่เปอร์ Rename ไว้เป็น lookup priority #1 แล้วระบบค่อยไล่ canonical client และ aliases ด้านหลัง";
      var toolbar = clientSection.querySelector(".mmd-cs-v14__toolbar");
      if (toolbar) toolbar.insertAdjacentElement("afterend", hint);
    }

    function isChosen(value) {
      var content = String(value || "").trim();
      return Boolean(content && content !== "-");
    }

    function makeTextNode(tag, className, value) {
      var node = document.createElement(tag);
      if (className) node.className = className;
      node.textContent = String(value == null ? "" : value);
      return node;
    }

    function polishManualClientCards() {
      var cards = Array.prototype.slice.call(root.querySelectorAll("[data-op-client-results] .mmdop__clientCard"));
      cards.forEach(function (card) {
        if (card.getAttribute("data-manual-card-polished") === "1") return;
        var raw = String(card.textContent || "");
        var isManual = raw.indexOf("manual_name_pending_reconcile") !== -1 ||
          raw.indexOf("identity_pending_reconcile") !== -1 ||
          raw.indexOf("guest_public_only") !== -1;
        if (!isManual) return;

        var sourceTitle = card.querySelector(".mmdop__clientMain strong");
        var name = sourceTitle ? String(sourceTitle.textContent || "").trim() : "ลูกค้าคนนี้";
        if (!name) name = "ลูกค้าคนนี้";

        card.classList.add("is-manual-client");
        card.setAttribute("data-manual-card-polished", "1");
        card.setAttribute("aria-label", "ใช้ชื่อ " + name + " ต่อสำหรับ Public Session");

        while (card.firstChild) card.removeChild(card.firstChild);

        var avatar = makeTextNode("span", "mmdop__clientAvatar mmdop__manualAvatar", name.charAt(0).toUpperCase() || "C");
        var body = document.createElement("span");
        body.className = "mmdop__manualBody";
        body.appendChild(makeTextNode("span", "mmdop__manualEyebrow", "ชื่อที่เปอร์จำ"));
        body.appendChild(makeTextNode("strong", "mmdop__manualTitle", name));
        body.appendChild(makeTextNode("span", "mmdop__manualCopy", "ยังไม่ผูก Member / LINE — ใช้สร้าง Public Session ได้เลย"));

        var meta = document.createElement("span");
        meta.className = "mmdop__manualMeta";
        meta.appendChild(makeTextNode("span", "mmdop__manualPill mmdop__manualPill--ready", "Public Ready"));
        meta.appendChild(makeTextNode("span", "mmdop__manualPill", "รอผูกประวัติ"));
        body.appendChild(meta);

        var go = makeTextNode("span", "mmdop__manualGo", "›");
        go.setAttribute("aria-hidden", "true");

        card.appendChild(avatar);
        card.appendChild(body);
        card.appendChild(go);
      });
    }

    function polishManualSelection() {
      var selectedManual = root.querySelector("[data-op-client-results] .mmdop__clientCard.is-manual-client.is-selected");
      var pickedCard = root.querySelector(".mmd-cs-v14__pickedCard");
      var pickedEyebrow = root.querySelector(".mmd-cs-v14__pickedEyebrow");

      if (!selectedManual) {
        root.removeAttribute("data-simple-manual-client");
        if (pickedCard) pickedCard.classList.remove("is-manual-client");
        if (pickedEyebrow) pickedEyebrow.textContent = "Selected client";
        return;
      }

      root.setAttribute("data-simple-manual-client", "true");
      if (pickedCard) pickedCard.classList.add("is-manual-client");
      if (pickedEyebrow) pickedEyebrow.textContent = "Ready for Public";

      var title = selectedManual.querySelector(".mmdop__manualTitle");
      var name = title ? String(title.textContent || "").trim() : String(selectedName && selectedName.textContent || "").trim();
      var selectedMeta = root.querySelector("[data-op-selected-client-meta]");
      var selectedConfidence = root.querySelector("[data-op-selected-confidence]");
      var lineageNotice = root.querySelector("[data-op-lineage-notice]");

      if (selectedMeta) selectedMeta.textContent = "ชื่อที่เปอร์จำ · Public Session";
      if (selectedConfidence) selectedConfidence.textContent = "รอผูก Member / LINE และประวัติภายหลัง";
      if (lineageNotice) lineageNotice.textContent = "ใช้ชื่อ “" + (name || "ลูกค้าคนนี้") + "” ต่อได้เลยสำหรับ Public — ระบบจะผูก identity และประวัติให้ทีหลัง";
    }

    function hideUntil(node, visible) {
      if (!node) return;
      node.setAttribute("data-simple-hidden", visible ? "false" : "true");
      node.setAttribute("aria-hidden", visible ? "false" : "true");
    }

    function updateFlow(hasClient, hasWork, hasLane, hasModel) {
      var order = ["client", "work", "lane", "model", "details", "review"];
      var done = {
        client: hasClient,
        work: hasWork,
        lane: hasLane,
        model: hasModel,
        details: false,
        review: false
      };
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
      polishManualClientCards();

      var hasClient = isChosen(selectedName && selectedName.textContent);
      var selectedWork = root.querySelector("[data-op-work-type].is-selected");
      var hasWork = Boolean(selectedWork);
      var folderStat = root.querySelector("[data-op-stat-folder]");
      var modelStat = root.querySelector("[data-op-stat-model]");
      var hasLane = isChosen(folderStat && folderStat.textContent);
      var hasModel = isChosen(modelStat && modelStat.textContent);

      root.classList.toggle("is-simple-has-client", hasClient);
      root.classList.toggle("is-simple-has-work", hasWork);
      root.classList.toggle("is-simple-has-folder", hasLane);
      root.classList.toggle("is-simple-has-model", hasModel);

      workButtons.forEach(function (button) {
        button.setAttribute("aria-disabled", hasClient ? "false" : "true");
        button.tabIndex = hasClient ? 0 : -1;
      });

      polishManualSelection();
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
  if (!output || output.includes('data-simple-start-style="simple-start-v2"')) return output;

  output = output
    .replace(
      'placeholder="พิมพ์ชื่อ username phone line user id หรือ #hashtag"',
      'placeholder="พิมพ์ชื่อที่เปอร์จำ เช่น หนุ่ย"',
    )
    .replace('>search member</button>', '>ค้นหา</button>')
    .replace('>recent</button>', '>ล่าสุด</button>');

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
