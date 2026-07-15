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
  var ADMIN_AUTH_ENDPOINT = "/v1/admin/auth/me";
  var SAFE_MODE_COPY = "Safe Mode พร้อมอ่าน แต่