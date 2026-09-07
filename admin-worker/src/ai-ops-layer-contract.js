export const AI_OPS_SCHEMA_VERSION = "mmd_ai_ops_layer_v1";

export const AI_OPS_SURFACES = Object.freeze([
  ["/internal/admin/control-room", "control_room"],
  ["/internal/admin/dashboard", "dashboard"],
  ["/internal/admin/jobs/create-job", "create_job"],
  ["/internal/admin/payments/historical-backfill", "payments_historical_backfill"],
  ["/internal/admin/payments", "payments"],
  ["/internal/admin/membership-access", "membership_access"],
  ["/internal/admin/member-intelligence", "member_intelligence"],
  ["/internal/admin/access/invite", "access_invite"],
  ["/internal/admin/owner/setup", "owner_setup"],
  ["/internal/admin/studio/upload", "studio_upload"],
  ["/internal/admin/studio/review", "studio_review"],
  ["/internal/admin/studio/model-preview", "studio_model_preview"],
  ["/internal/admin/studio/care-back", "studio_care_back"],
  ["/internal/admin/studio", "studio"],
  ["/internal/admin/mms", "mms"],
  ["/internal/admin/customer-data", "customer_data_hold"],
  ["/internal/admin/kenji", "kenji"],
]);

export const AI_OPS_AUTHORITY = Object.freeze({
  money: "payments-worker",
  entitlement: "my_mmd_entitlement_resolver_v1",
  telegram_drive: "observed_state_only",
  model_private_access: "backend_eligibility_authority",
});

export function normalizeAdminPath(value = "") {
  const text = String(value || "").split("?")[0].split("#")[0].replace(/\/{2,}/g, "/");
  if (!text) return "/";
  const withSlash = text.startsWith("/") ? text : `/${text}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/g, "") : withSlash;
}

export function resolveAiOpsSurface(pathname = "") {
  const path = normalizeAdminPath(pathname);
  const exact = AI_OPS_SURFACES.find(([route]) => route === path);
  if (exact) return { path, surface: exact[1], canonical: true };
  if (path.startsWith("/internal/admin/")) return { path, surface: "admin_other", canonical: false };
  return { path, surface: "outside_admin", canonical: false };
}

export function safeAiOpsContext(input = {}) {
  const pick = (key, max = 180) => String(input?.[key] || "").trim().slice(0, max);
  return {
    client_id: pick("client_id"),
    member_id: pick("member_id"),
    model_id: pick("model_id"),
    job_id: pick("job_id"),
    session_id: pick("session_id"),
    payment_ref: pick("payment_ref"),
    record_id: pick("record_id"),
  };
}

export function baseAiOpsBrief(surface, ctx = {}) {
  const brief = [];
  const anomalies = [];
  const nextActions = [];
  const has = (key) => Boolean(ctx?.[key]);

  if (surface.surface === "create_job") {
    brief.push("Create Job copilot is active. Confirm Client, narrow Job Scope, visually confirm Model, then complete details and review.");
    if (!has("client_id") && !has("member_id")) anomalies.push({ code: "client_context_missing", level: "info", text: "No canonical client identifier is visible yet." });
    if (!has("model_id")) anomalies.push({ code: "model_context_missing", level: "info", text: "No confirmed model identifier is visible yet." });
    nextActions.push({ priority: 1, action: "continue_current_flow", label: "Continue Create Job", href: "/internal/admin/jobs/create-job" });
  } else if (surface.surface === "payments" || surface.surface === "payments_historical_backfill") {
    brief.push("Payment evidence may be summarized and triaged here, but paid-state authority remains with payments-worker.");
    if (!has("payment_ref") && !has("record_id")) anomalies.push({ code: "payment_context_missing", level: "info", text: "No payment reference is visible in the current page context." });
    nextActions.push({ priority: 1, action: "review_payment_evidence", label: "Review payment evidence", href: "/internal/admin/payments" });
  } else if (surface.surface === "membership_access") {
    brief.push("Compare canonical entitlement expectation with observed Telegram/Drive state; unresolved evidence must remain Review/Waiting.");
    if (!has("client_id") && !has("member_id")) anomalies.push({ code: "member_context_missing", level: "info", text: "Select a canonical client/member before reconciling access." });
    nextActions.push({ priority: 1, action: "inspect_access", label: "Inspect expected vs observed access", href: "/internal/admin/membership-access" });
  } else if (surface.surface.startsWith("studio")) {
    brief.push("Studio copilot should prioritize canonical record, R2 migration, primary image, public profile, gallery and compcard readiness.");
    if (!has("model_id")) anomalies.push({ code: "model_context_missing", level: "info", text: "No model identifier is visible in the current Studio context." });
    nextActions.push({ priority: 1, action: "inspect_model_readiness", label: "Check model readiness", href: "/internal/admin/studio" });
  } else if (surface.surface === "customer_data_hold") {
    brief.push("Customer 360 is a HOLD surface. AI may explain current identity evidence, but incomplete controls must not be presented as operational.");
    anomalies.push({ code: "surface_hold", level: "warning", text: "Customer Data runtime remains incomplete; use canonical Client Index / Create Job lookup for active identity work." });
    nextActions.push({ priority: 1, action: "use_client_lookup", label: "Use Create Job client lookup", href: "/internal/admin/jobs/create-job" });
  } else if (surface.surface === "kenji") {
    brief.push("Kenji admin remains the canonical knowledge, QA, publish and audit surface. AI can prepare suggestions; publish remains supervised.");
    nextActions.push({ priority: 1, action: "review_kenji", label: "Review Kenji control", href: "/internal/admin/kenji" });
  } else if (surface.surface === "control_room" || surface.surface === "dashboard") {
    brief.push("Use the owner view to triage what needs attention next; recommendations should route into canonical operational surfaces.");
    nextActions.push({ priority: 1, action: "create_job", label: "Create Job", href: "/internal/admin/jobs/create-job" });
    nextActions.push({ priority: 2, action: "review_payments", label: "Review Payments", href: "/internal/admin/payments" });
    nextActions.push({ priority: 3, action: "review_membership_access", label: "Review Membership Access", href: "/internal/admin/membership-access" });
  } else {
    brief.push("AI Ops can summarize this admin surface and route work toward the canonical owner without taking authority away from backend systems.");
  }

  return { brief, anomalies, next_actions: nextActions };
}
