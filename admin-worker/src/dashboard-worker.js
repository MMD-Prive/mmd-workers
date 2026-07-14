// admin-worker/src/dashboard-worker.js
// =========================================================
// Admin dashboard wrapper
//
// Purpose:
// - Add GET /v1/admin/dashboard without touching the large core router.
// - Delegate every other request to the existing admin-worker implementation.
// - Keep the dashboard endpoint read-only and safe for Webflow.
// =========================================================

import coreWorker from "./index.js";
