// Read-only search projections. Exact record links establish identity; names never do.
import { exactRows } from "./payment-review-display-context.js";

const text = value => String(value ?? "").trim().slice(0, 180);
const ids = value => Array.isArray(value) ? value.map(text).filter(Boolean) : [];
const unique = values => [...new Set(values.map(text).filter(Boolean))];
const one = value => ids(value).length === 1 ? ids(value)[0] : null;
const positive = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
const pending = new Set(["pending", "review", "review_required", "needs_review", "unmatched", "new", "submitted"]);
const cancelled = new Set(["cancelled", "canceled", "rejected", "void", "failed", "refunded"]);
const paid = new Set(["paid", "verified", "approved"]);
const stageFields = ["Payment Reference", "payment_ref", "Amount", "Payment Status", "payment_stage", "payment_type", "session_id", "Client"];

export function discoveryTables(env) {
  return {
    sessions: text(env.AIRTABLE_TABLE_SESSIONS_ID || env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX"),
    clients: "tblVv58TCbwh5j1fS",
    models: "tblI4B0bI446vp9GX",
    index: text(env.AIRTABLE_TABLE_PRE_SESSION_CLIENT_INDEX_ID || env.AIRTABLE_TABLE_PRE_SESSION_CLIENT_INDEX || "tblwn6I9VWie5d7Ui"),
  };
}

export async function enrichDiscoveryNames(items, { list, page, tables }) {
  if (!items.length) return items;
  const clientIds = unique(items.map(item => item.client_record_id));
  const modelIds = unique(items.map(item => item.model_record_id));
  let clients = [], models = [], aliases = [], status = "complete";
  try { clients = await exactRows(list, tables.clients, "RECORD_ID()", clientIds); }
  catch { status = "partial"; }
  try { models = await exactRows(list, tables.models, "RECORD_ID()", modelIds); }
  catch { status = "partial"; }
  if (clientIds.length) {
    try {
      let offset;
      for (let count = 0; count < 20; count++) {
        const result = await page(tables.index, {
          pageSize: 100, offset,
          fields: ["identity_key", "source_type", "preferred_name", "line_display_name", "line_user_id", "linked_client", "resolution_status", "session_lookup_status"],
        });
        aliases.push(...result.records.filter(row => {
          const f = row.fields || {};
          return text(f.identity_key).startsWith("line_ofc_per_rename:")
            && ["line_ofc_staging", "line ofc staging"].includes(text(f.source_type).toLowerCase())
            && text(f.resolution_status).toLowerCase() === "linked"
            && ["canonical_ready", "canonical ready"].includes(text(f.session_lookup_status).toLowerCase())
            && one(f.linked_client) && clientIds.includes(one(f.linked_client))
            && text(f.preferred_name) && text(f.line_user_id);
        }));
        offset = result.offset;
        if (!offset) break;
        if (count === 19) { aliases = []; status = "partial"; }
        else await new Promise(resolve => setTimeout(resolve, 210));
      }
    } catch { aliases = []; status = "partial"; }
  }
  return items.map(item => {
    const c = clients.find(row => row.id === item.client_record_id)?.fields || {};
    const m = models.find(row => row.id === item.model_record_id)?.fields || {};
    const rows = aliases.filter(row => one(row.fields.linked_client) === item.client_record_id);
    const preferred = unique(rows.map(row => row.fields.preferred_name));
    return {
      ...item,
      customer_name: preferred.length === 1 ? preferred[0] : item.customer_name || text(c.mmd_client_name || c["Client Name"] || c.line_display_name),
      customer_name_source: preferred.length === 1 ? "per_rename" : "canonical_context",
      customer_aliases: unique([...(item.customer_aliases || []), item.customer_name, c.mmd_client_name, c["Client Name"], c.line_display_name, c.nickname, ...rows.flatMap(row => [row.fields.preferred_name, row.fields.line_display_name])]),
      model_aliases: unique([item.model_name, m.working_name, m.display_name_compact, m.nickname, m.username, m.folder_name, m.suffix_code]),
      search_names_status: status,
    };
  });
}

export async function recentPaymentJobs({ list, page, tables, paymentsTable, proofsTable, limit = 100 }) {
  const sessions = await list(tables.sessions, {
    maxRecords: limit, sort: [{ field: "created_at", direction: "desc" }],
    fields: ["session_id", "Client", "Canonical Model", "client_name", "model_name", "created_at", "job_date", "start_time", "end_time", "location_name", "Session Status"],
  });
  const payments = await exactRows((table, params) => list(table, { ...params, fields: stageFields }), paymentsTable, "session_id", sessions.map(row => text(row.fields?.session_id)));
  const proofs = await exactRows(list, proofsTable, "payment_ref", payments.map(row => text(row.fields?.["Payment Reference"] || row.fields?.payment_ref)));
  const jobs = sessions.map(row => {
    const s = row.fields || {}, sessionId = text(s.session_id);
    const requests = payments.filter(p => sessionId && text(p.fields?.session_id) === sessionId).map(payment => {
      const p = payment.fields || {}, ref = text(p["Payment Reference"] || p.payment_ref);
      const matches = proofs.filter(proof => text(proof.fields?.payment_ref) === ref);
      const mismatch = sessions.filter(other => text(other.fields?.session_id) === sessionId).length !== 1
        || (ids(s.Client).length > 1 || ids(p.Client).length > 1 || (one(s.Client) && one(p.Client) && one(s.Client) !== one(p.Client)))
        || payments.filter(other => text(other.fields?.["Payment Reference"] || other.fields?.payment_ref) === ref).length !== 1;
      let inconsistentProof = false;
      const reviewProofs = matches.filter(proof => {
        const f = proof.fields || {};
        if (/mmd_historical_slip_backfill_v1/.test(String(f.note || ""))) return false;
        const conflict = ids(f.payment).length > 1 || (one(f.payment) && one(f.payment) !== payment.id)
          || ids(f.session).length > 1 || (one(f.session) && one(f.session) !== row.id)
          || ids(f.client).length > 1 || (one(f.client) && one(s.Client) && one(f.client) !== one(s.Client));
        if (conflict) { inconsistentProof = true; return false; }
        return text(f.proof_id) && pending.has(text(f.status || "pending").toLowerCase());
      });
      const status = text(p["Payment Status"]).toLowerCase();
      const state = mismatch || inconsistentProof || !ref || positive(p.Amount) === null ? "needs_review"
        : cancelled.has(status) ? "cancelled"
        : paid.has(status) ? "paid"
        : !pending.has(status) ? "needs_review"
        : reviewProofs.length ? "proof_pending" : "waiting_proof";
      return {
        payment_ref: ref, payment_stage: text(p.payment_stage || p.payment_type).toLowerCase(),
        expected_amount_thb: positive(p.Amount), payment_status: status, state,
        proof_ids: state === "proof_pending" ? unique(reviewProofs.map(proof => proof.fields.proof_id)) : [],
      };
    });
    return {
      session_record_id: row.id, session_id: sessionId,
      client_record_id: one(s.Client), model_record_id: one(s["Canonical Model"]),
      customer_name: text(s.client_name), model_name: text(s.model_name),
      job_date: text(s.job_date), start_time: text(s.start_time), end_time: text(s.end_time), location_name: text(s.location_name),
      created_at: text(s.created_at || row.createdTime),
      cancelled: cancelled.has(text(s["Session Status"]).toLowerCase()),
      payments: requests,
    };
  });
  return enrichDiscoveryNames(jobs, { list, page, tables });
}
