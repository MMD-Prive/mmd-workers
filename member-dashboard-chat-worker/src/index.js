import {
  isRenewalRoute,
  renderRenewalResponse,
} from "./renderers/single-renewal-renderer.js";
import { KenjiModelIdempotency } from "./kenji-model-idempotency.js";
import { generateKenjiModelReply, KENJI_TOTAL_DEADLINE_MS } from "./kenji-model-policy.js";
import { runKenjiFolderHistoryAssessment } from "./kenji-folder-history-adapter.mjs";
import { buildProtectedCapabilityReply, decideKenjiCapability, KENJI_CAPABILITIES } from "./kenji-capability-policy.js";
import { parseModelKnowledgeIdAllowlist, selectApprovedLineModelKnowledge } from "./kenji-knowledge-policy.js";
// Canonical member-status voice policy (Per/HITO) is resolved before any generic LINE fallback.
import { generateSafeReply, canonicalRichMenuIntent } from "../../shared/verified-member-concierge.mjs";
import { resolveKenjiLiveMemberContext } from "./kenji-live-member-truth-adapter.mjs";
import { INTERNAL_AI_SERVICE_BINDING_SMOKE, runInternalAiServiceBindingSmoke } from "./internal-ai-service-binding-smoke.mjs";

export { KenjiModelIdempotency };

const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";
const LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply";
const LINE_PROFILE_BASE_URL = "https://api.line.me/v2/bot/profile";
const LINE_RICH_MENU_LINK_URL = "https://api.line.me/v2/bot/user";
const LINE_RICH_MENU_API_URL = "https://api.line.me/v2/bot/richmenu";
const LINE_RICH_MENU_DATA_URL = "https://api-data.line.me/v2/bot/richmenu";
const LINE_DEFAULT_RICH_MENU_URL = "https://api.line.me/v2/bot/user/all/richmenu";
const WORKER_NAME = "member-dashboard-chat-worker";
const DEFAULT_HIMAI_SUPPLIERS_TABLE = "tbl81bnFyASeXCj9x";
const LINE_WEBHOOK_PATHS = new Set(["/webhooks/line", "/webhooks/line/", "/webhook/line", "/webhook/line/"]);
const MEMBER_LIFF_PREFIX = "/member/api/liff/";
const MEMBER_LIFF_SHELL_PATHS = new Set(["/member/liff", "/member/liff/"]);
const MEMBER_DASHBOARD_API_PATHS = new Set(["/api/member/dashboard", "/api/member/dashboard/"]);
const MEMBER_LIFF_ID = "2010862595-yT4DCEMc";
const MEMBER_SIGNUP_URL = "https://mmdbkk.com/sigil/member/membership?source=line&intent=signup";
const MEMBER_RENEWAL_URL = "https://mmdbkk.com/sigil/member/membership?source=line&intent=renew";
const LINE_RICH_MENU_SYNC_PATH = "/v1/internal/line/rich-menu/sync";
const LINE_RICH_MENU_PUBLIC_WORLD_BASE_PATH = "/v1/internal/line/rich-menu/public-world";
const LINE_RICH_MENU_DEFAULT_PATH = "/v1/internal/line/rich-menu/default";
const LINE_RICH_MENU_LIST_PATH = "/v1/internal/line/rich-menu/list";
const SERVICE_LINE_RICH_MENU_PUBLIC_WORLD_BASE_PATH = "/__internal/line/rich-menu/public-world";
const SERVICE_LINE_RICH_MENU_PRIVATE_MEMBER_BASE_PATH = "/__internal/line/rich-menu/private-member";
const SERVICE_LINE_RICH_MENU_DEFAULT_PATH = "/__internal/line/rich-menu/default";
const SERVICE_LINE_RICH_MENU_LIST_PATH = "/__internal/line/rich-menu/list";
const DEFAULT_SYNC_TABLE = "MMD — Console Inbox";
const KENJI_MODEL_DEDUPE_TIMEOUT_MS = 300;
const KENJI_MODEL_QUOTA_DEFAULT_LIMIT = 3;
const KENJI_MODEL_QUOTA_DEFAULT_WINDOW_SECONDS = 15 * 60;
const KENJI_MODEL_ACCESS_RPC_URL = "https://admin-worker.local/v1/internal/kenji/model-access";
const KENJI_MODEL_ACCESS_TIMEOUT_MS = 900;
const KENJI_RUNTIME_STATUS_RPC_URL = "https://admin-worker.local/v1/internal/kenji/control/runtime/status";
const KENJI_RUNTIME_STATUS_TIMEOUT_MS = 700;
const KENJI_MODEL_ACCESS_PENDING_TIMEOUT_MS = 500;

// ... existing source unchanged ...

function memberLiffUrl(intent = "status", view = "profile") {
  const url = new URL(`https://liff.line.me/${MEMBER_LIFF_ID}`);
  url.searchParams.set("intent", intent);
  url.searchParams.set("view", view);
  return url.toString();
}
