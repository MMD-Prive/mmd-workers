import { verifiedMemberContext } from "./promotion-claim.js";

const READBACK_PATH = "/v1/internal/promotions/member-readback";
const CAMPAIGN_ID = "mmd_6th_anniversary_2026";

export async function handleMemberDashboardReadback(request, env = {}) {
  if (request.method === "OPTIONS") return new Response(null, { status:204,headers:apiHeaders() });
  if (request.method !== "POST") return json({ ok:false,error:"method_not_allowed" },405);

  const context = await verifiedMemberContext(request, env);
  if (!context.ok) return json({ ok:false,error:context.error },context.status);
  if (!env.PROMOTION_WORKER?.fetch) return json({ ok:false,error:"promotion_worker_binding_missing" },503);

  const upstream = await env.PROMOTION_WORKER.fetch(new Request(`https://promotion-worker.local${READBACK_PATH}`, {
    method:"POST",
    headers:{
      "content-type":"application/json",
      "x-mmd-service-binding":"member-pages-worker",
      "x-mmd-internal-secret":String(env.INTERNAL_SERVICE_SECRET || ""),
      "x-request-id":request.headers.get("x-request-id") || crypto.randomUUID(),
    },
    body:JSON.stringify({ campaignId:CAMPAIGN_ID,identityHash:context.identityHash }),
  }));
  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok || payload?.ok === false) {
    return json({ ok:false,error:payload.error || "campaign_readback_unavailable" },upstream.status >= 400 ? upstream.status : 503);
  }

  return json({ ok:true,data:customerDashboard(context.snapshot,payload.data) });
}

export function customerDashboard(snapshot = {}, campaign = {}) {
  const membershipEnd = safeDate(snapshot.membershipEndAt);
  const status = membershipStatus(membershipEnd);
  return {
    member:{ display_name:safeText(snapshot.displayName) || "สมาชิก MMD" },
    membership:{ tier:safeText(snapshot.membershipTier) || "Member",status,effective_until:membershipEnd },
    points:{ active_points:safeNumber(snapshot.pointsActive) },
    next_session:{},
    payment:{},
    actions:{
      primary_url:status === "active" ? "/sigil/guide" : "/member/membership",
      primary_label:status === "active" ? "เลือก Personal Main" : "ดู Membership",
      renewal_url:"/member/membership",
    },
    campaign:normalizeCampaign(campaign),
  };
}

function normalizeCampaign(input = {}) {
  const allowed = new Set(["not_started","under_review","payment_required","payment_verifying","approved","completed","unavailable","temporarily_unavailable"]);
  const status = allowed.has(input.status) ? input.status : "temporarily_unavailable";
  const action = input.action && typeof input.action === "object" ? input.action : {};
  const output = {
    id:CAMPAIGN_ID,
    label:"6 YEARS · CARE BACK",
    status,
    title:safeText(input.title) || null,
    message:safeText(input.message) || null,
    benefit_summary:safeText(input.benefit_summary) || null,
    effective_until:safeDate(input.effective_until),
    action:{ type:safeActionType(action.type),label:safeText(action.label) || null,href:safeHref(action.href) },
    updated_at:safeDateTime(input.updated_at),
  };
  return output;
}

function membershipStatus(end) {
  if (!end) return "under_review";
  return Date.parse(`${end}T23:59:59+07:00`) >= Date.now() ? "active" : "expired";
}
function safeText(value) { return String(value || "").trim().slice(0,240); }
function safeNumber(value) { const number=Number(value); return Number.isFinite(number) && number >= 0 ? number : null; }
function safeDate(value) { const text=String(value || "").trim(); return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null; }
function safeDateTime(value) { const text=String(value || "").trim(); return text && !Number.isNaN(Date.parse(text)) ? new Date(text).toISOString() : null; }
function safeActionType(value) { return ["none","link","retry"].includes(value) ? value : "none"; }
function safeHref(value) { const text=String(value || "").trim(); if (!text) return null; if (text.startsWith("/")) return text; try { const url=new URL(text); return url.hostname === "lin.ee" ? url.href : null; } catch { return null; } }
function apiHeaders() { return {"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"https://mmdbkk.com","access-control-allow-methods":"POST,OPTIONS","access-control-allow-headers":"authorization,content-type,x-request-id","vary":"origin"}; }
function json(value,status=200) { return new Response(JSON.stringify(value),{status,headers:apiHeaders()}); }
