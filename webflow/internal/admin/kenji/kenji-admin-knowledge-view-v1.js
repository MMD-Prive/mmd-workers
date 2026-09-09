(function () {
  "use strict";

  var root = document.getElementById("mmdKenjiAdminV1");
  if (!root || root.dataset.knowledgeViewV1 === "1") return;
  root.dataset.knowledgeViewV1 = "1";

  bindKnowledgeRoute();
  syncKnowledgeFromUrl(true);

  function bindKnowledgeRoute() {
    root.addEventListener("click", function (event) {
      var knowledge = event.target.closest('.kso-nav [data-tab="knowledge"]');
      if (knowledge) {
        setTimeout(function () {
          setHeader("KENJI · KNOWLEDGE", "Knowledge");
          updateView("knowledge", false);
        }, 0);
        return;
      }

      var leave = event.target.closest('.kso-nav [data-kso-home],.kso-nav [data-kso-scroll],.kso-nav [data-tab]:not([data-tab="knowledge"]),.kso-nav [data-kso-advanced]');
      if (leave && currentView() === "knowledge") {
        setTimeout(function () {
          setHeader("KENJI · SINGLE OWNER", "สอน Kenji");
          updateView("", false);
        }, 0);
      }
    });

    window.addEventListener("popstate", function () {
      syncKnowledgeFromUrl(true);
    });
  }

  function syncKnowledgeFromUrl(replace) {
    if (currentView() !== "knowledge") return;
    var nativeButton = root.querySelector('.ka__nav [data-tab="knowledge"]');
    var friendlyButton = root.querySelector('.kso-nav [data-tab="knowledge"]');
    var button = nativeButton || friendlyButton;
    if (button) button.click();
    setHeader("KENJI · KNOWLEDGE", "Knowledge");
    updateView("knowledge", Boolean(replace));
  }

  function currentView() {
    return new URL(location.href).searchParams.get("view") || "";
  }

  function updateView(view, replace) {
    var url = new URL(location.href);
    if (view) url.searchParams.set("view", view);
    else url.searchParams.delete("view");
    var method = replace ? "replaceState" : "pushState";
    var next = url.pathname + url.search + url.hash;
    var current = location.pathname + location.search + location.hash;
    if (next === current) return;
    if (history && history[method]) history[method]({}, "", next);
  }

  function setHeader(eyebrowText, titleText) {
    var header = root.querySelector(".ka__header");
    if (!header) return;
    var eyebrow = header.querySelector("div > span");
    var title = header.querySelector("h1");
    if (eyebrow) eyebrow.textContent = eyebrowText;
    if (title) title.textContent = titleText;
  }
})();
