export const CREATE_SESSION_SIMPLE_START_MODE = "simple-start-v1";

const SIMPLE_START_CSS = `
/* Per Owner Simple Start — presentation only. Backend gates remain authoritative. */
.mmd-cs-v14__hero,
.mmd-cs-v14__lights,
.mmd-cs-v14__quickRow,
.mmd-cs-v14 [data-op-check-session],
.mmd-cs-v14 [data-op-refresh-models],
.mmd-cs-v14 [data-op-demo-client],
.mmd-cs-v14 [data-op-clear-client],
.mmd-cs-v14 [data-op-fill-demo],
.mmd-cs-v14 [data-op-fill-demo-job],
.mmd-cs-v14 [data-op-debug-toggle] {
  display: none !important;
}

.mmd-cs-v14__shell {
  width: min(1040px, calc(100vw - 24px)) !important;
  gap: 14px !important;
}

.mmd-cs-v14__topbar {
  position: sticky;
  top: max(8px, env(safe-area-inset-top));
  z-index: 30;
  padding: 12px !important;
  border-radius: 22px !important;
}

.mmd-cs-v14__toprow {
  min-height: 46px;
}

.mmd-cs-v14__brand img {
  width: 166px !important;
  height: 26px !important;
}

.mmd-cs-v14__toolbar {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) auto !important;
  gap: 9px !important;
  align-items: center !important;
  margin-top: 8px !important;
}

.mmd-cs-v14__search {
  min-height: 62px !important;
  padding-left: 46px !important;
  border-radius: 18px !important;
  font-size: 17px !important;
  border-color: rgba(212, 181, 106, 0.34) !important;
  background: rgba(6, 6, 10, 0.94) !important;
}

.mmd-cs-v14__toolbarActions {
  display: flex !important;
  gap: 8px !important;
}

.mmd-cs-v14__toolbarActions .mmd-cs-v14__btn {
  min-height: 52px !important;
}

.mmd-cs-v14__layout {
  display: block !important;
}

.mmd-cs-v14__stack,
.mmd-cs-v14__section {
  width: 100% !important;
}

#client-search .mmd-cs-v14__sectionHead p,
#client-search .mmd-cs-v14__statusGrid,
#client-search .mmd-cs-v14__fields,
#client-search .mmd-cs-v14__compatFields,
.mmd-cs-v14 .mmdop__tags,
.mmd-cs-v14 .mmdop__clientMain span:last-child {
  display: none !important;
}

#client-search .mmd-cs-v14__sectionHead {
  margin-bottom: 10px !important;
}

#client-search .mmd-cs-v14__sectionCopy h2 {
  font-size: clamp(24px, 5vw, 34px) !important;
}

.mmd-cs-v14 .mmdop__clientCard {
  grid-template-columns: 52px minmax(0, 1fr) !important;
  min-height: 82px !important;
  padding: 13px !important;
}

.mmd-cs-v14 .mmdop__clientMain strong {
  font-size: 17px !important;
}

.mmd-cs-v14 .mmdop__clientMain span {
  font-size: 12px !important;
}

#work-panel {
  transition: opacity 180ms ease, transform 180ms ease, border-color 180ms ease;
}

.mmd-cs-v14:not(.is-simple-has-client) #work-panel {
  opacity: 0.38;
  transform: translateY(4px);
}

.mmd-cs-v14:not(.is-simple-has-client) #work-panel [data-op-work-type] {
  pointer-events: none;
}

#work-panel .mmd-cs-v14__sectionCopy p {
  display: none !important;
}

#work-panel .mmd-cs-v14__typeButtons {
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  gap: 10px !important;
}

#work-panel .mmd-cs-v14__typeBtn {
  min-height: 132px !important;
  border-radius: 22px !important;
}

#work-panel .mmd-cs-v14__typeBtn span {
  font-size: clamp(22px, 4vw, 31px) !important;
}

.mmd-cs-v14 [data-simple-hidden="true"] {
  display: none !important;
}

.mmd-cs-v14__simpleHint {
  margin: 10px 0 0;
  padding: 11px 13px;
  border: 1px solid rgba(212, 181, 106, 0.16);
  border-radius: 14px;
  background: rgba(212, 181, 106, 0.045);
  color: rgba(247, 242, 234, 0.68);
  font-size: 12px;
  line-height: 1.55;
}

.mmd-cs-v14__simpleHint strong {
  color: #f3e0ae;
}

@media (max-width: 767px) {
  .mmd-cs-v14 {
    padding: 8px !important;
  }

  .mmd-cs-v14__shell {
    width: 100% !important;
  }

  .mmd-cs-v14__topbar {
    top: max(4px, env(safe-area-inset-top));
  }

  .mmd-cs-v14__toprow {
    min-height: 38px;
  }

  .mmd-cs-v14__brand img {
    width: 142px !important;
  }

  .mmd-cs-v14__toolbar {
    grid-template-columns: 1fr !important;
  }

  .mmd-cs-v14__toolbarActions {
    display: grid !important;
    grid-template-columns: 1fr auto !important;
  }

  .mmd-cs-v14__toolbarActions [data-op-search-client] {
    width: 100% !important;
  }

  #work-panel .mmd-cs-v14__typeButtons {
    grid-template-columns: 1fr 1fr !important;
  }

  #work-panel .mmd-cs-v14__typeBtn {
    min-height: 112px !important;
    padding: 14px 10px !important;
  }

  #work-panel .mmd-cs-v14__typeBtn span {
    font-size: 19px !important;
  }

  #work-panel .mmd-cs-v14__typeBtn small {
    font-size: 10px !important;
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
    root.setAttribute("data-simple-start-mode", "simple-start-v1");

    var query = root.querySelector("[data-op-client-query]");
    var search = root.querySelector("[data-op-search-client]");
    var recent = root.querySelector("[data-op-load-recent]");
    var selectedName = root.querySelector("[data-op-selected-client-name]");
    var workButtons = Array.prototype.slice.call(root.querySelectorAll("[data-op-work-type]"));
    var lanePanel = root.querySelector("[data-op-folder-grid]");
    lanePanel = lanePanel ? lanePanel.closest("section") : null;
    var modelPanel = root.querySelector("#model-panel");
    var gatePanel = root.querySelector("#gate-panel");
    var detailsControl = root.querySelector("[data-op-date]");
    var detailsPanel = detailsControl ? detailsControl.closest("section") : null;
    var timer = 0;
    var scheduled = false;

    if (query) {
      query.setAttribute("placeholder", "พิมพ์ชื่อที่เปอร์จำ เช่น หนุ่ย");
      query.setAttribute("autocomplete", "off");
      query.setAttribute("autocapitalize", "off");
      setTimeout(function () { query.focus(); }, 80);
      query.addEventListener("input", function () {
        clearTimeout(timer);
        var value = String(query.value || "").trim();
        if (value.length < 2) return;
        timer = window.setTimeout(function () {
          if (search) search.click();
        }, 320);
      });
    }

    if (search) search.textContent = "ค้นหา";
    if (recent) recent.textContent = "ล่าสุด";

    var clientSection = root.querySelector("#client-search");
    if (clientSection && !clientSection.querySelector("[data-simple-hint]")) {
      var hint = document.createElement("p");
      hint.className = "mmd-cs-v14__simpleHint";
      hint.setAttribute("data-simple-hint", "");
      hint.innerHTML = "<strong>หาแบบที่เปอร์จำ:</strong> พิมพ์ชื่อที่เปอร์ Rename ไว้ก่อน ระบบค่อยไล่ canonical client และ aliases ให้ด้านหลัง";
      var head = clientSection.querySelector(".mmd-cs-v14__sectionHead");
      if (head) head.insertAdjacentElement("afterend", hint);
    }

    function isChosen(value) {
      var text = String(value || "").trim();
      return Boolean(text && text !== "-");
    }

    function hideUntil(node, visible) {
      if (!node) return;
      node.setAttribute("data-simple-hidden", visible ? "false" : "true");
    }

    function sync() {
      var hasClient = isChosen(selectedName && selectedName.textContent);
      var selectedWork = root.querySelector("[data-op-work-type].is-selected");
      var hasWork = Boolean(selectedWork);
      var folderStat = root.querySelector("[data-op-stat-folder]");
      var modelStat = root.querySelector("[data-op-stat-model]");
      var hasFolder = isChosen(folderStat && folderStat.textContent);
      var hasModel = isChosen(modelStat && modelStat.textContent);

      root.classList.toggle("is-simple-has-client", hasClient);
      root.classList.toggle("is-simple-has-work", hasWork);
      root.classList.toggle("is-simple-has-folder", hasFolder);
      root.classList.toggle("is-simple-has-model", hasModel);

      workButtons.forEach(function (button) {
        button.setAttribute("aria-disabled", hasClient ? "false" : "true");
        button.tabIndex = hasClient ? 0 : -1;
      });

      hideUntil(lanePanel, hasWork);
      hideUntil(modelPanel, hasFolder);
      hideUntil(gatePanel, hasModel);
      hideUntil(detailsPanel, hasModel);
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
  if (!output || output.includes('data-simple-start-style="simple-start-v1"')) return output;

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
