import { resolveMemberEntitlements } from "../../auth-worker/src/member-entitlement-resolver.js";
import { allowedCustomerModelFolders } from "./customer-search-policy.js";
import { resolveDiscoveryViewer } from "./customer-discovery-policy.js";

// Names verified against the current entitlement schema. These are only the
// resolver's canonical capability/lifecycle inputs; no contact fields are read.
const ENTITLEMENT_FIELDS = ["member", "capability", "entitlement_level", "package_code", "member_lifecycle_status", "member_status", "access_status", "start_at", "expire_at", "grace_until"];

// Booking/session handles locate a draft; only the existing verified member
// session can bind its stored Members record to this caller.
export async function currentPrivateAccess(request, env, memberRecordId, verifiedViewerRef) {
  const denied = { snapshot: resolveMemberEntitlements([]), viewerRef: "", allowedFolders: [] };
  try {
    if (!/^rec[A-Za-z0-9]{14,24}$/.test(memberRecordId || "")) return denied;
    const viewerRef = verifiedViewerRef ?? await resolveDiscoveryViewer(request, env);
    if (!/^[a-f0-9]{64}$/.test(viewerRef)) return denied;
    const members = env.AIRTABLE_TABLE_MEMBERS_ID || env.AIRTABLE_TABLE_MEMBERS || "Members";
    const member = await read(env, members + "/" + memberRecordId);
    if (member?.id !== memberRecordId || !member.fields) return denied;
    const fields = member.fields;
    const statuses = [fields["Membership Status"], fields.membership_status, fields.member_lifecycle_status, fields.status, fields["Verification Status"]]
      .map(value => clean(value).toLowerCase().replace(/[\s-]+/g, "_"));
    if (statuses.some(status => ["blocked", "suspended", "revoked", "pending_review"].includes(status))) return denied;
    // Same business-ID normalization used by auth-worker's verified LIFF
    // member profile. Airtable record.id itself is not the business member ID.
    const memberId = clean(fields.member_id || fields["Member ID"] || fields.auth_member_id || `mmd_rec_${memberRecordId}`).slice(0, 160);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("mmd-discovery-member-v1:" + memberId));
    const expected = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
    if (viewerRef !== expected) return denied;
    const table = env.AIRTABLE_TABLE_ENTITLEMENTS_ID || env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS_ID || env.AIRTABLE_TABLE_MEMBER_ENTITLEMENTS || "MMD — Member Entitlements";
    // The canonical inverse link gives the complete per-member inventory.
    // Never compare linked-record display labels in an Airtable formula.
    const linked = fields["MMD — Member Entitlements"] || [];
    if (!Array.isArray(linked) || linked.length > 500 || linked.some(id => !/^rec[A-Za-z0-9]{14,24}$/.test(id)) || new Set(linked).size !== linked.length) return denied;
    const owned = [];
    for (let start = 0; start < linked.length; start += 50) {
      const ids = linked.slice(start, start + 50);
      const expectedIds = new Set(ids);
      const found = new Map();
      const seenOffsets = new Set();
      let offset = "";
      for (let page = 0; page < 5; page++) {
        // RECORD_ID() compares actual record IDs, regardless of display labels.
        const formula = `OR(${ids.map(id => `RECORD_ID()="${id}"`).join(",")})`;
        const qs = new URLSearchParams({ pageSize: "100", filterByFormula: formula });
        for (const field of ENTITLEMENT_FIELDS) qs.append("fields[]", field);
        if (offset) qs.set("offset", offset);
        const result = await read(env, table, qs);
        if (!Array.isArray(result.records) || result.records.length > 100) return denied;
        for (const row of result.records) {
          if (!expectedIds.has(row.id)) continue;
          if (found.has(row.id) || !Array.isArray(row.fields?.member) || !row.fields.member.includes(memberRecordId)) return denied;
          found.set(row.id, row);
        }
        offset = clean(result.offset);
        if (!offset) break;
        if (seenOffsets.has(offset) || page === 4) return denied;
        seenOffsets.add(offset);
      }
      if (found.size !== ids.length) return denied;
      owned.push(...found.values());
    }
    const snapshot = resolveMemberEntitlements(owned);
    return { snapshot, viewerRef, allowedFolders: allowedCustomerModelFolders(snapshot) };
  } catch { return denied; }
}

async function read(env, path, qs) {
  if (!env.AIRTABLE_API_KEY || !env.AIRTABLE_BASE_ID) throw new Error("private_access_unavailable");
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encoded}${qs ? "?" + qs : ""}`, {
    headers: { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` },
  });
  if (!response.ok) throw new Error("private_access_unavailable");
  return response.json();
}
function clean(value) { return String(value ?? "").trim(); }
