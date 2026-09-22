import { MODEL_SESSION_STATE_SET, MODEL_SESSION_STATE_ALIASES } from "./modelSessionContractV1.js";

const text = (value, max = 360) => typeof value === "string" ? value.trim().slice(0, max) : "";
const code = value => text(value, 80).toLowerCase();
const timestamp = value => text(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const formula = value => text(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const terminal = new Set(["applied", "rejected", "withdrawn"]);
const types = new Set(["time_change", "location_change", "date_change", "reschedule", "cancellation", "remark"]);
const statuses = new Set(["pending_review", "approved", ...terminal]);
const C = Object.freeze({
  id: "fldWMwebmHhyVQLzW", session: "fldbL2Ya44l6xEYe1", sessionId: "fldMD3Fhu0ibDmjk0",
  type: "fldxg0WIVCmxtdRCF", status: "fldcBkBS70bWBgI8A", before: "fld9W8UEOXpsfJT5P",
  requested: "fld8DqBrOmY6lQzGA", remark: "fldjwQWRjxXqrFiAU", at: "fldU2e6BO3fVdGyFF",
});

function snapshot(raw) {
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return null; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const out = {};
  // Never relay raw JSON, arbitrary URLs, payout data or private notes.
  for (const key of ["job_date", "start_time", "end_time", "location_name"]) {
    if (text(parsed[key])) out[key] = text(parsed[key]);
  }
  if (text(parsed.google_map_url)) out.map_provided = true;
  return out;
}

const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString().slice(0, 10) === value;
const validTime = value => /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)
  || /^\d{4}-\d{2}-\d{2}T/.test(value) && !!timestamp(value);
const placeholder = value => !text(value) || /^(?:-|—|tbd|tbc|unknown|pending|ยังไม่ระบุ|ยังไม่สรุป|รอสรุป|รอยืนยัน)(?:\s|$)/i.test(text(value));

export async function jobReadinessFollowthrough(env, { session, sessionId, list }) {
  const s = session.fields || {};
  const details = {
    job_date: text(s.fldpnqoIsUMfN7y3c, 40), start_time: text(s.fldBeG0FkWwa8kgnp, 80),
    end_time: text(s.fldiDSz0wW9Ct9I3P, 80), location_name: text(s.fldIiRpaxoafjTkFt),
  };
  const missing = [];
  if (!validDate(details.job_date)) missing.push("job_date");
  if (!validTime(details.start_time)) missing.push("start_time");
  if (!validTime(details.end_time)) missing.push("end_time");
  if (placeholder(details.location_name)) missing.push("location_name");
  const customerAck = timestamp(s.fldJSS5GNN7quJwa8), modelAck = timestamp(s.fldFgkHXivIAThfDz);
  let requests = [], source = "complete";
  try {
    const records = await list(text(env.AIRTABLE_TABLE_CUSTOMER_CHANGE_REQUESTS, 120) || "tblhQGfJc4GgiteZr", {
      filterByFormula: `{session_id}='${formula(sessionId)}'`, maxRecords: 100, requireComplete: true,
      returnFieldsByFieldId: true, fields: Object.values(C), sort: [{ field: "requested_at", direction: "desc" }],
    });
    const seen = new Set();
    for (const record of records) {
      const f = record.fields || {}, links = f[C.session];
      // Text session ID alone never authorizes a cross-job request projection.
      if (text(f[C.sessionId], 180) !== sessionId || !Array.isArray(links) || links.length !== 1 || links[0] !== session.id) {
        source = "incomplete"; continue;
      }
      const id = text(f[C.id], 120);
      if (!id || seen.has(id)) { source = "incomplete"; continue; }
      seen.add(id);
      const type = code(f[C.type]), status = code(f[C.status]), at = timestamp(f[C.at]);
      const before = snapshot(f[C.before]), requested = snapshot(f[C.requested]);
      if (!types.has(type) || !statuses.has(status) || !at || !before || !requested) source = "incomplete";
      requests.push({ request_id: id, request_type: types.has(type) ? type : "unknown",
        status: statuses.has(status) ? status : "unknown", requested_at: at,
        current_value: before || {}, requested_value: requested || {}, remark: text(f[C.remark], 2000),
      });
    }
  } catch { source = "unavailable"; }
  requests.sort((a, b) => String(b.requested_at || "").localeCompare(a.requested_at || ""));
  const open = requests.filter(r => !terminal.has(r.status));
  const rawState = code(s.fld57fhdWqIcOy4Jp), normalized = MODEL_SESSION_STATE_ALIASES[rawState] || rawState;
  const state = MODEL_SESSION_STATE_SET.has(normalized) ? normalized : null;
  const checks = [
    { key: "details", status: missing.length ? "pending" : "complete" },
    { key: "changes", status: source !== "complete" ? "unknown" : open.length ? "pending" : "complete" },
    { key: "customer", status: customerAck ? "complete" : "pending" },
    { key: "model", status: modelAck ? "complete" : "pending" },
  ];
  if (["offer_declined", "offer_expired"].includes(state)) checks.push({ key: "model_assignment", status: "pending" });
  const next = source !== "complete" ? "reload_changes" : open.length ? "review_changes" : missing.length ? "complete_details"
    : !customerAck ? "customer_confirmation" : !modelAck ? "model_confirmation"
    : ["offer_declined", "offer_expired"].includes(state) ? "model_assignment"
    : state && !["offered", "confirmed"].includes(state) ? "follow_session" : "await_model_update";
  return {
    schema: "job_readiness_v1", source: "canonical_session", details, missing_fields: missing,
    checks, checklist_complete: checks.every(x => x.status === "complete"), next_action: next,
    change_requests: { source_status: source, open_count: source === "complete" ? open.length : null,
      items: [...open, ...requests.filter(r => terminal.has(r.status))], limit: 100 },
    lifecycle: { state, updated_at: timestamp(s.fldFJI1Leni6wvzR4), source: "model_session_contract_v1" },
    // Informational checklist only. Service start remains guarded by its own
    // canonical model workflow and final-payment authority.
    can_start_work: false,
  };
}
