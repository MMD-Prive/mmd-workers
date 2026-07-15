/*
  Kenji Knowledge V9.1 Webflow Loader
  - Webflow only needs: CSS link, placeholder div, this script.
  - Injects the admin HTML into #mmdKenjiKnowledgeV9.
  - Keeps /sigil/board bridge read-only.
*/
(function () {
  "use strict";

  var ROOT_ID = "mmdKenjiKnowledgeV9";
  var STORAGE_KEY = "mmd_kenji_knowledge_v9_cards";
  var STATUS_ENDPOINT = "/v1/sigil/board/status";
  var QUEUE_ENDPOINT = "/v1/sigil/board/queue";
