import { resolveMemberEntitlements } from "../../auth-worker/src/member-entitlement-resolver.js";

const BLOCKED = new Set(["blocked", "suspended", "revoked", "expired", "unresolved"]);

function text(value) {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(",");
  if (typeof value === "object") return String(value.name || value.value || "").trim();
  return String(value).trim();
}

function token(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function fields(row) {
  return row?.fields || row || {};
}

export function parseMmdRichMenuPostback(event = {}) {
  if (event?.type !== "postback") return null;
  const raw = text(event?.postback?.data);
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  if (params.get("mmd_action") !== "support") return null;
  return { action: "support", requested_audience: text(params.get("audience")), intent: text(params.get("intent")) };
}

export function resolveCanonicalRichMenuMembership(client, entitlements = [], now = new Date()) {
  if (!client) return { level: "guest", reason: "identity_not_verified" };
  const clientFields = fields(client);
  const verification = token(clientFields["Verification Status"] || clientFields.verification_status);
  const memberStatus = token(clientFields["Membership Status"] || clientFields.membership_status || clientFields.status);
  if (BLOCKED.has(memberStatus)) return { level: "guest", reason: `member_${memberStatus}` };
  if (verification !== "verified") return { level: "guest", reason: "identity_not_verified" };

  const snapshot = resolveMemberEntitlements(entitlements, { now: new Date(now).toISOString() });
  if (snapshot.member_blocked || snapshot.review?.blocked_records?.length || snapshot.review?.revoked_records?.length) {
    return { level: "guest", reason: "entitlement_blocked" };
  }
  if (snapshot.access?.private_visibility_envelope && snapshot.access.private_visibility_envelope !== "none") {
    return { level: "private_member", reason: "private_entitlement_active" };
  }
  return { level: "public_member", reason: "verified_without_private_entitlement" };
}

function payloadFor(card = {}) {
  try {
    return typeof card.payload_json === "string" ? JSON.parse(card.payload_json) : (card.payload_json || {});
  } catch (_) {
    return {};
  }
}

export function selectRichMenuResponsePack(cards = [], level = "guest") {
  const wanted = ["guest", "public_member", "private_member"].includes(level) ? level : "guest";
  return cards.find((card) => {
    const payload = payloadFor(card);
    return payload.knowledge_type === "rich_menu_response" &&
      payload.version === "v1" &&
      payload.level === wanted &&
      text(card.customer_answer).length > 0;
  }) || null;
}
