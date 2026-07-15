/*
  Kenji Knowledge V9 legacy split JS guard.
  The supported Webflow runtime is kenji-knowledge-v9-1-webflow-loader.js.
  This compatibility file is intentionally valid and side-effect free to avoid parse failures.
*/
(function () {
  "use strict";
  var root = document.getElementById("mmdKenjiKnowledgeV9");
  if (!root) return;
  root.setAttribute("data-legacy-js-guard", "true");
  if (!root.getAttribute("data-version")) {
    root.setAttribute("data-version", "kenji-knowledge-v9-legacy-guard");
  }
})();
