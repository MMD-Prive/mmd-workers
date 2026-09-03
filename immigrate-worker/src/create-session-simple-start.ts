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
