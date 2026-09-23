import { safeAvailabilityReceipt, SIGIL_AVAILABILITY_KV_PREFIX } from "../../shared/sigil-availability-snapshot-v1.mjs";

const API = "https://api.airtable.com/v0";
const DEFAULT_BASE_ID = "appsV1ILPRfIjkaYg";
const TABLE = Object.freeze({
  sessions: "tblC98mKWbzmPuNzX",
  jobs: "tbl0jxIjN8QYwGABX",
  payments: "tblWGGJJOx5eBvBZJ",
  clients: "tblVv58TCbwh5j1fS",
  models: "tblI4B0bI446vp9GX",
  cal: "tbl6saWYEQrEdnMIK",
});
const F = Object.freeze({
  session: {
    id: "fldLTq2kZbyRv22IA", jobId: "fldHw5HdDDdkHXMhG", client: "fld6P6if0vDZCeV0C",
    clientName: "fldMvnQ0BzDfHUYjT", model: "fldrXQAyOMPCvbOaY", modelName: "flddVz6eoWRHrzIQr",
    start: "fldBeG0FkWwa8kgnp", end: "fldiDSz0wW9Ct9I3P", legacyStart: "fldf9v0UqmfjVWVrL", legacyEnd: "fldgImpiwmstRduw6",
    location: "fldIiRpaxoafjTkFt", service: "fldjK3U9bghnj7xUe", duration: "fldP7Xx99uf5BvJpF",
    total: "fldeBf4gl5iTBj7eX", finalPrice: "fldug5LUyiLyLvrCV", depositPaid: "fldooTlKtkY8VJy7L",
    paymentRef: "fldojgjSQLaO0uQLX", paymentStatus: "fldTY5lE6m0kQf72n", state: "fldjE7J1ckyXId1Cf",
    sessionStatus: "fldmwuvOaiCFdzzRa", status: "fldHAlxnRfpKucnNV",
    modelState: "fld57fhdWqIcOy4Jp", modelAckAt: "fldFgkHXivIAThfDz", partnerId: "fld0jkscGAtyX7i2J",
  },
  job: {
    id: "fldwreJwlz8sWd6GM", sessionId: "fldTR8yO6xv40HjOX", client: "fldlPdR0pmynCY6fW",
    model: "fldscPK15ejBw0BAH", modelName: "fldA0qyACFQA2AqhB", location: "fldXxOmiDiefa2Sdk",
    budget: "fldSspHLxJPQOg7wA", depositStatus: "fldtn4oA2qLfFUwDu", status: "fld3pY2uK4JsHUeYe",
    duration: "fldSl1SS6C6ULGuls",
  },
  payment: {
    ref: "fldOO6SY49iDw8VBZ", sessionId: "fld2wdhBvc8xrV6y5", amount: "fldvCSwrUW8OMAooS",
    status: "fldEJ1hmm7KwWuI6q", verification: "fldJ7a0Ube9F0bmRy", stage: "fldrr9g8ZZjqAbdKQ",
    type: "fldydUWHhqVLMkNSC", depositStatus: "fldD0mQWTfdmyBAeT", verifiedAt: "fldPNK6qgxCSdaJRM", updatedAt: "fldtNVdDacEH03W4f",
  },
  client: { name: "fldrHqkGQzvBLRxlP", display: "fldGUsLfrAdrN2Hhc" },
  model: {
    name: "fldShiT60bmCxFxRu",
    modelId: "fldVWbT0gsSe0hn7Q",
    modelKey: "fldYvAbkENGQ4NaaI",
    availability: "fld6RuUDmGcGDc34i",
    availableNow: "fldwMpYGpA5RvC76m",
    status: "fldRcAE3bL8dKmURH",
    operatingRole: "fldW4h38yZnANUVY3",
    registryRecordType: "fldKTbOlADC1OqNur",
    salesLayer: "fldOrRNL8PocDILk5",
    modelTier: "fldM8m82fwIB9hRjz",
    approvedPrivateSales: "fldGVmYjRgLGVUiTX",
    offerRules: "fldxSomvQZvjYZHU6",
    lineUserId: "fld2ywTFI6MZhX6PV",
  },
  cal: {
    uid: "fld42rRY3ufGeXCcf", bookingId: "fld4PDFuJecAY3HCf", eventTypeId: "fldzl67JJBq9QKoc2",
    sessionId: "fldd0STLRxOGIKXPn", jobId: "fldzvGB5u7t55kwUQ", status: "fld449t1h6s7jbcnf",
    trigger: "fldNhk22zLTvR9Y4C", eventAt: "fldfC6D0RXyogXcMG",
  },
});

const clean = (v, max = 500) => String(v ?? "").trim().slice(0, max);
function safeHttpsUrl(value) {
  try {
    const url = new URL(clean(value, 1200));
    return url.protocol === "https:" ? url.toString() : "";
  } catch { return ""; }
}
const field = (r, id) => r?.fields?.[id];
const link = v => Array.isArray(v) && v.length ? clean(v[0], 80) : null;
const number = v => Number.isFinite(Number(v)) ? Number(v) : null;
const state = (...v) => v.map(x => clean(x, 120).toLowerCase()).filter(Boolean).join(" ");
const quoted = v => `'${clean(v, 180).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
function idsFormula(ids) {
  const list = [...new Set(ids.map(x => clean(x, 80)).filter(Boolean))].slice(0, 80);
  if (!list.length) return "FALSE()";
  return `OR(${list.map(id => `RECORD_ID()=${quoted(id)}`).join(",")})`;
}
function valuesFormula(name, values) {
  const list = [...new Set(values.map(x => clean(x, 180)).filter(Boolean))].slice(0, 80);
  if (!list.length) return "FALSE()";
  return `OR(${list.map(v => `{${name}}=${quoted(v)}`).join(",")})`;
}
function envConfig(env = {}) {
  return {
    base: clean(env.AIRTABLE_BASE_ID, 80) || DEFAULT_BASE_ID,
    token: clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 500),
  };
}
async function list(env, table, fields, formula = "", max = 700) {
  const { base, token } = envConfig(env);
  if (!token) throw new Error("airtable_token_missing");
  const records = [];
  let offset = "";
  do {
    const u = new URL(`${API}/${encodeURIComponent(base)}/${encodeURIComponent(table)}`);
    u.searchParams.set("pageSize", "100");
    u.searchParams.set("returnFieldsByFieldId", "true");
    for (const f of fields) u.searchParams.append("fields[]", f);
    if (formula) u.searchParams.set("filterByFormula", formula);
    if (offset) u.searchParams.set("offset", offset);
    const r = await fetch(u, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`airtable_${table}_${r.status}`);
    records.push(...(body.records || []));
    offset = clean(body.offset, 200);
  } while (offset && records.length < max);
  return records.slice(0, max);
}
function range(dateText) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const date = /^\d{4}-\d{2}-\d{2}$/.test(clean(dateText, 10)) ? clean(dateText, 10) : today;
  const start = new Date(`${date}T00:00:00+07:00`);
  return { date, start: start.getTime(), end: start.getTime() + 86400000 };
}
const startOf = r => clean(field(r, F.session.start), 50) || clean(field(r, F.session.legacyStart), 50) || null;
const endOf = r => clean(field(r, F.session.end), 50) || clean(field(r, F.session.legacyEnd), 50) || null;
function verifiedPayment(p) {
  const s = state(field(p, F.payment.verification), field(p, F.payment.depositStatus), field(p, F.payment.status));
  return /official_verified|verified|paid|confirmed|complete/.test(s) && !/pending|unverified|rejected|failed|void/.test(s);
}
function depositPayment(p) { return /deposit|มัดจำ/.test(state(field(p, F.payment.stage), field(p, F.payment.type))); }
function latestDeposit(records, preferredRef = "") {
  return [...records].sort((a, b) => {
    const aRef = clean(field(a, F.payment.ref), 180) === preferredRef ? 1 : 0;
    const bRef = clean(field(b, F.payment.ref), 180) === preferredRef ? 1 : 0;
    const aDep = depositPayment(a) ? 1 : 0, bDep = depositPayment(b) ? 1 : 0;
    const aVer = verifiedPayment(a) ? 1 : 0, bVer = verifiedPayment(b) ? 1 : 0;
    const aTime = Date.parse(field(a, F.payment.updatedAt) || field(a, F.payment.verifiedAt) || 0) || 0;
    const bTime = Date.parse(field(b, F.payment.updatedAt) || field(b, F.payment.verifiedAt) || 0) || 0;
    return (bRef-aRef) || (bDep-aDep) || (bVer-aVer) || (bTime-aTime);
  })[0] || null;
}
function confirmedModel(s) {
  if (field(s, F.session.modelAckAt)) return true;
  const x = state(field(s, F.session.modelState), field(s, F.session.state));
  return /model_confirmed|confirmed|accepted|acknowledged|ready/.test(x) && !/declined|rejected|cancel/.test(x);
}
function durationHours(s, j, start, end) {
  const explicit = number(field(s, F.session.duration)) ?? number(field(j, F.job.duration));
  if (explicit != null) return explicit;
  const a = Date.parse(start || ""), b = Date.parse(end || "");
  return Number.isFinite(a) && Number.isFinite(b) && b > a ? Math.round((b-a)/36000)/100 : null;
}
function crossesMidnight(a, b) {
  if (!a || !b) return false;
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(new Date(a)) !== f.format(new Date(b));
}
function overlap(items) {
  for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
    const x = items[a], y = items[b];
    const kx = x.model.record_id || clean(x.model.name).toLowerCase();
    const ky = y.model.record_id || clean(y.model.name).toLowerCase();
    if (!kx || kx !== ky) continue;
    const xs = Date.parse(x.start_at || ""), xe = Date.parse(x.end_at || ""), ys = Date.parse(y.start_at || ""), ye = Date.parse(y.end_at || "");
    if ([xs,xe,ys,ye].every(Number.isFinite) && xs < ye && ys < xe) x.conflict = y.conflict = true;
  }
}

async function readMmsTherapistAvailability(env = {}) {
  if (!env.MMS_WORKER || typeof env.MMS_WORKER.fetch !== "function") {
    return { status: "service_binding_missing", therapists: [] };
  }
  try {
    const response = await env.MMS_WORKER.fetch(new Request("https://mms.internal/internal/mms/admin/snapshot", {
      method: "GET",
      headers: { accept: "application/json" },
    }));
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.ok !== true || !Array.isArray(body.therapists)) {
      return { status: "snapshot_unavailable", therapists: [] };
    }
    return {
      status: "ok",
      therapists: body.therapists
        .map(item => ({
          therapist_id: clean(item?.therapist_id, 80) || null,
          display_name: clean(item?.display_name, 120) || null,
          availability_status: clean(item?.availability_status, 40) || "Unknown",
          public_photo_url: safeHttpsUrl(item?.public_photo_url),
          status: clean(item?.status, 40) || null,
          matching_enabled: item?.matching_enabled === true,
        }))
        .filter(item => item.therapist_id || item.display_name)
        .slice(0, 150),
    };
  } catch {
    return { status: "snapshot_unavailable", therapists: [] };
  }
}

const SIGIL_AVAILABILITY_ADOPTION_RECOVERY_PREFIX = "availability-adoption:v1:recovery:";
const RECOVERY_REMINDER_FOLLOW_UP_MS = 24 * 60 * 60 * 1000;

const SAFE_AVAILABILITY_STATES = new Set([
  "available_now",
  "available_today",
  "available_soon",
  "limited",
  "unavailable",
  "unknown",
]);

function modelKey(record) {
  const value = clean(field(record, F.model.modelKey), 120);
  return /^[A-Za-z0-9][A-Za-z0-9_.:-]{1,119}$/.test(value) ? value : "";
}

function isOperationalAvailabilityModel(record) {
  const status = clean(field(record, F.model.status), 120).toLowerCase().trim();
  if (status !== "active") return false;

  const operatingRole = clean(field(record, F.model.operatingRole), 120).toLowerCase().trim();
  if (operatingRole && operatingRole !== "receiving job model") return false;

  // Legacy approved inventory predates these hygiene fields, so blank role/type
  // remains eligible only when the explicit status is active. Any explicit
  // non-model registry classification fails closed.
  const registryType = clean(field(record, F.model.registryRecordType), 120).toLowerCase().trim();
  if (registryType && registryType !== "existing model record") return false;

  return true;
}

async function availabilitySnapshotKeys(binding) {
  if (!binding || typeof binding.list !== "function") return null;
  const names = new Set();
  let cursor = undefined;
  for (let page = 0; page < 10; page += 1) {
    const result = await binding.list({
      prefix: SIGIL_AVAILABILITY_KV_PREFIX,
      limit: 1000,
      ...(cursor ? { cursor } : {}),
    });
    for (const item of Array.isArray(result?.keys) ? result.keys : []) {
      const name = clean(item?.name, 240);
      if (name.startsWith(SIGIL_AVAILABILITY_KV_PREFIX)) names.add(name);
    }
    if (result?.list_complete !== false || !result?.cursor) break;
    cursor = result.cursor;
  }
  return names;
}

async function readCalendarAvailabilitySnapshots(env = {}, records = [], nowMs = Date.now()) {
  const binding = env.SIGIL_AVAILABILITY_SNAPSHOTS;
  if (!binding || typeof binding.get !== "function") {
    return { status: "storage_unavailable", by_model_key: new Map() };
  }

  const modelKeys = [...new Set(records.map(modelKey).filter(Boolean))];
  if (!modelKeys.length) return { status: "ok", by_model_key: new Map() };

  let existing = null;
  try {
    existing = await availabilitySnapshotKeys(binding);
  } catch {
    existing = null;
  }

  const targetKeys = existing
    ? modelKeys.filter(key => existing.has(`${SIGIL_AVAILABILITY_KV_PREFIX}${key}`))
    : modelKeys;

  const byModelKey = new Map();
  const failedModelKeys = new Set();
  let readFailures = 0;
  await Promise.all(targetKeys.map(async key => {
    let raw;
    try {
      raw = await binding.get(`${SIGIL_AVAILABILITY_KV_PREFIX}${key}`, "json");
    } catch {
      readFailures += 1;
      failedModelKeys.add(key);
      return;
    }
    if (!raw || typeof raw !== "object") return;
    const receipt = safeAvailabilityReceipt(raw);
    const state = clean(receipt.safe_availability_state, 40).toLowerCase();
    const expiresMs = Date.parse(clean(receipt.expires_at, 100));
    const updatedMs = Date.parse(clean(receipt.updated_at, 100));
    const fresh = SAFE_AVAILABILITY_STATES.has(state) && Number.isFinite(expiresMs) && expiresMs > nowMs;
    byModelKey.set(key, {
      snapshot_state: fresh ? "fresh" : Number.isFinite(expiresMs) ? "stale" : "invalid_expiry",
      fresh,
      safe_availability_state: fresh ? state : "",
      confidence: clean(receipt.confidence, 40) || null,
      updated_at: Number.isFinite(updatedMs) ? receipt.updated_at : null,
      expires_at: Number.isFinite(expiresMs) ? receipt.expires_at : null,
      age_seconds: Number.isFinite(updatedMs) ? Math.max(0, Math.floor((nowMs - updatedMs) / 1000)) : null,
      ttl_remaining_seconds: fresh ? Math.max(0, Math.ceil((expiresMs - nowMs) / 1000)) : 0,
    });
  }));

  return {
    status: readFailures ? "partial" : "ok",
    by_model_key: byModelKey,
    failed_model_keys: failedModelKeys,
  };
}

async function readCalendarRecoveryEvidence(env = {}, records = []) {
  const binding = env.SIGIL_AVAILABILITY_SNAPSHOTS;
  if (!binding || typeof binding.get !== "function") return { status: "storage_unavailable", by_model_key: new Map() };
  const modelKeys = [...new Set(records.map(modelKey).filter(Boolean))];
  const byModelKey = new Map();
  const failedModelKeys = new Set();
  let readFailures = 0;
  await Promise.all(modelKeys.map(async key => {
    try {
      const raw = await binding.get(SIGIL_AVAILABILITY_ADOPTION_RECOVERY_PREFIX + key, "json");
      if (!raw || typeof raw !== "object") return;
      const activationIssuedAt = clean(raw.activation_link_issued_at, 100);
      const activationExpiresAt = clean(raw.activation_link_expires_at, 100);
      const reminderSentAt = clean(raw.reminder_sent_at, 100);
      if (activationIssuedAt || activationExpiresAt || reminderSentAt) {
        byModelKey.set(key, {
          ...(activationIssuedAt ? { activation_link_issued_at: activationIssuedAt } : {}),
          ...(activationExpiresAt ? { activation_link_expires_at: activationExpiresAt } : {}),
          ...(reminderSentAt ? { reminder_sent_at: reminderSentAt } : {}),
        });
      }
    } catch {
      readFailures += 1;
      failedModelKeys.add(key);
    }
  }));
  return { status: readFailures ? "partial" : "ok", by_model_key: byModelKey, failed_model_keys: failedModelKeys };
}

function recoveryProjection({ snapshotState, fresh, lineConnected, modelKey: key, evidence = null, snapshotUpdatedAt = null }, nowMs = Date.now()) {
  if (snapshotState === "excluded") return { recovery_stage: "excluded", recovery_action: "none", follow_up_at: null };
  if (!key) return { recovery_stage: "identity_recovery_required", recovery_action: "link_canonical_model_key", follow_up_at: null };
  if (snapshotState === "source_unavailable") return { recovery_stage: "source_unavailable", recovery_action: "wait_for_source", follow_up_at: null };
  if (fresh) {
    return {
      recovery_stage: evidence?.activation_link_issued_at || evidence?.reminder_sent_at ? "coverage_recovered" : "coverage_current",
      recovery_action: "none",
      follow_up_at: null,
    };
  }
  if (!lineConnected) {
    const expiresMs = Date.parse(evidence?.activation_link_expires_at || "");
    if (evidence?.activation_link_issued_at && Number.isFinite(expiresMs) && expiresMs > nowMs) {
      return { recovery_stage: "line_link_issued_waiting_for_connection", recovery_action: "wait_for_line_connection", follow_up_at: evidence.activation_link_expires_at };
    }
    return { recovery_stage: evidence?.activation_link_issued_at ? "line_link_expired" : "line_link_required", recovery_action: "issue_line_link", follow_up_at: null };
  }
  const reminderSentMs = Date.parse(evidence?.reminder_sent_at || "");
  const snapshotUpdatedMs = Date.parse(snapshotUpdatedAt || "");
  // A later canonical confirmation has satisfied the earlier reminder.  When
  // that snapshot later expires, it starts a new gap instead of inheriting a
  // stale 24-hour follow-up obligation from the old reminder.
  if (Number.isFinite(reminderSentMs) && !(Number.isFinite(snapshotUpdatedMs) && snapshotUpdatedMs >= reminderSentMs)) {
    const followUpMs = reminderSentMs + RECOVERY_REMINDER_FOLLOW_UP_MS;
    return {
      recovery_stage: followUpMs <= nowMs ? "reminder_follow_up_due" : "reminder_sent_waiting_for_confirmation",
      recovery_action: followUpMs <= nowMs ? "review_model_status" : "wait_for_confirmation",
      follow_up_at: new Date(followUpMs).toISOString(),
    };
  }
  return { recovery_stage: "availability_confirmation_required", recovery_action: "remind_model", follow_up_at: null };
}

function modelAvailability(records = [], snapshotIndex = { status: "storage_unavailable", by_model_key: new Map() }, recoveryIndex = { status: "storage_unavailable", by_model_key: new Map() }, nowMs = Date.now()) {
  return records
    .map(record => {
      const key = modelKey(record);
      const snapshot = key ? snapshotIndex.by_model_key.get(key) : null;
      const evidence = key ? recoveryIndex.by_model_key.get(key) || null : null;
      const excluded = !isOperationalAvailabilityModel(record);
      const state = !excluded && snapshot?.fresh ? snapshot.safe_availability_state : "";
      const snapshotReadFailed = Boolean(key && snapshotIndex.failed_model_keys?.has(key));
      const recoveryReadFailed = Boolean(key && recoveryIndex.failed_model_keys?.has(key));
      const snapshotState = excluded
        ? "excluded"
        : !key
          ? "identity_missing"
          : snapshotReadFailed || recoveryReadFailed
            ? "source_unavailable"
            : snapshot?.snapshot_state || (snapshotIndex.status === "storage_unavailable" ? "source_unavailable" : "missing");
      const lineConnected = /^U[0-9a-f]{32}$/i.test(clean(field(record, F.model.lineUserId), 80));
      return {
        record_id: record?.id || null,
        model_id: clean(field(record, F.model.modelId), 120) || null,
        model_key: key || null,
        name: clean(field(record, F.model.name), 160) || null,
        availability_status: state || "unconfirmed",
        snapshot_state: snapshotState,
        availability_fresh: !excluded && snapshot?.fresh === true,
        confidence: snapshot?.confidence || null,
        updated_at: snapshot?.updated_at || null,
        expires_at: snapshot?.expires_at || null,
        age_seconds: snapshot?.age_seconds ?? null,
        ttl_remaining_seconds: snapshot?.ttl_remaining_seconds ?? null,
        line_connected: lineConnected,
        sales_layer: clean(field(record, F.model.salesLayer), 40).toLowerCase() || null,
        model_tier: clean(field(record, F.model.modelTier), 80) || null,
        approved_for_private_sales: field(record, F.model.approvedPrivateSales) === true,
        offer_rule_count: Array.isArray(field(record, F.model.offerRules)) ? field(record, F.model.offerRules).length : 0,
        recovery_evidence: evidence,
        ...recoveryProjection({ snapshotState, fresh: !excluded && snapshot?.fresh === true, lineConnected, modelKey: key, evidence, snapshotUpdatedAt: snapshot?.updated_at || null }, nowMs),
      };
    })
    .filter(item => item.model_id || item.model_key || item.name)
    .slice(0, 300);
}

function availabilityOnboardingCohort(rows = [], sessions = [], nowMs = Date.now()) {
  const actionableStages = new Set([
    "identity_recovery_required",
    "line_link_required",
    "line_link_expired",
    "availability_confirmation_required",
    "reminder_follow_up_due",
  ]);
  const byRecord = new Map();
  for (const session of Array.isArray(sessions) ? sessions : []) {
    const linked = Array.isArray(field(session, F.session.model)) ? field(session, F.session.model) : [];
    if (!linked.length) continue;
    const startAt = startOf(session);
    const startMs = Date.parse(startAt || "");
    const statusText = state(
      field(session, F.session.sessionStatus),
      field(session, F.session.status),
      field(session, F.session.state),
      field(session, F.session.modelState),
    );
    const terminal = /cancel|cancelled|canceled|completed|complete|done|void|rejected|failed/.test(statusText);
    for (const recordIdRaw of linked) {
      const recordId = clean(recordIdRaw, 80);
      if (!recordId) continue;
      const entry = byRecord.get(recordId) || { history_sessions: 0, upcoming: [] };
      entry.history_sessions += terminal ? 0 : 1;
      if (!terminal && Number.isFinite(startMs) && startMs >= nowMs && startMs <= nowMs + 14 * 86400000) {
        entry.upcoming.push({
          start_at: startAt,
          partner_job: Boolean(clean(field(session, F.session.partnerId), 120)),
        });
      }
      byRecord.set(recordId, entry);
    }
  }

  const backlogRows = (Array.isArray(rows) ? rows : []).filter(item => actionableStages.has(clean(item?.recovery_stage, 80)));
  const groups = new Map();
  for (const row of backlogRows) {
    const key = clean(row?.model_key, 120) || `record:${clean(row?.record_id, 80)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const candidates = [];
  for (const group of groups.values()) {
    const ranked = group.map(row => {
      const activity = byRecord.get(clean(row?.record_id, 80)) || { history_sessions: 0, upcoming: [] };
      return { row, activity };
    }).sort((a, b) =>
      Number(Boolean(b.activity.upcoming.length)) - Number(Boolean(a.activity.upcoming.length))
      || Number(b.row?.line_connected === true) - Number(a.row?.line_connected === true)
      || b.activity.history_sessions - a.activity.history_sessions
      || Number(Boolean(b.row?.model_id)) - Number(Boolean(a.row?.model_id))
      || clean(a.row?.record_id, 80).localeCompare(clean(b.row?.record_id, 80))
    );
    const chosen = ranked[0];
    const row = chosen.row;
    const activity = ranked.flatMap(item => item.activity.upcoming || []).sort((a, b) => (Date.parse(a.start_at || "") || 0) - (Date.parse(b.start_at || "") || 0));
    const historySessions = Math.max(...ranked.map(item => nonNegativeInteger(item.activity.history_sessions)), 0);
    const stage = clean(row?.recovery_stage, 80);
    const upcomingJob = activity[0] || null;
    const commercial = row?.approved_for_private_sales === true
      || ["private", "both"].includes(clean(row?.sales_layer, 40))
      || /exclusive|premium/i.test(clean(row?.model_tier, 80))
      || nonNegativeInteger(row?.offer_rule_count) > 0
      || historySessions > 0;

    let bucket = "backfill";
    let bucketRank = 5;
    if (stage === "reminder_follow_up_due") { bucket = "sla_follow_up"; bucketRank = 0; }
    else if (upcomingJob) { bucket = "upcoming_job"; bucketRank = 1; }
    else if (stage === "availability_confirmation_required") { bucket = "line_ready"; bucketRank = 2; }
    else if (stage === "identity_recovery_required") { bucket = "identity_repair"; bucketRank = 3; }
    else if (commercial) { bucket = "commercial_active"; bucketRank = 4; }

    const commercialScore =
      (row?.approved_for_private_sales === true ? 25 : 0)
      + (/exclusive/i.test(clean(row?.model_tier, 80)) ? 18 : /premium/i.test(clean(row?.model_tier, 80)) ? 12 : 0)
      + (["private", "both"].includes(clean(row?.sales_layer, 40)) ? 10 : 0)
      + Math.min(15, historySessions * 3)
      + Math.min(10, nonNegativeInteger(row?.offer_rule_count) * 5);

    candidates.push({
      record_id: clean(row?.record_id, 80) || null,
      model_id: clean(row?.model_id, 120) || null,
      model_key: clean(row?.model_key, 120) || null,
      name: clean(row?.name, 160) || null,
      recovery_stage: stage || null,
      next_action: clean(row?.recovery_action, 80) || null,
      line_connected: row?.line_connected === true,
      priority_bucket: bucket,
      priority_reason: bucket === "sla_follow_up"
        ? "manual_reminder_follow_up_due"
        : bucket === "upcoming_job"
          ? "confirmed_or_open_job_within_14_days"
          : bucket === "line_ready"
            ? "line_connected_ready_for_first_availability_confirmation"
            : bucket === "identity_repair"
              ? "canonical_identity_required_before_model_access"
              : bucket === "commercial_active"
                ? "commercial_or_work_history_signal"
                : "active_operational_backfill",
      upcoming_job_at: upcomingJob?.start_at || null,
      partner_job: activity.some(item => item.partner_job === true),
      history_sessions: historySessions,
      sales_layer: clean(row?.sales_layer, 40) || null,
      model_tier: clean(row?.model_tier, 80) || null,
      approved_for_private_sales: row?.approved_for_private_sales === true,
      offer_rule_count: nonNegativeInteger(row?.offer_rule_count),
      duplicate_records_collapsed: Math.max(0, group.length - 1),
      _rank: bucketRank,
      _commercial_score: commercialScore,
    });
  }

  candidates.sort((a, b) =>
    a._rank - b._rank
    || ((Date.parse(a.upcoming_job_at || "") || Number.MAX_SAFE_INTEGER) - (Date.parse(b.upcoming_job_at || "") || Number.MAX_SAFE_INTEGER))
    || Number(b.line_connected) - Number(a.line_connected)
    || b._commercial_score - a._commercial_score
    || b.history_sessions - a.history_sessions
    || clean(a.name, 160).localeCompare(clean(b.name, 160))
  );

  const safe = candidates.map(({ _rank, _commercial_score, ...item }) => item);
  const counts = safe.reduce((acc, item) => {
    const key = clean(item.priority_bucket, 60) || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const batchSize = 5;
  return {
    schema: "mmd.availability.onboarding-cohorts.v1",
    batch_size: batchSize,
    raw_backlog_rows: backlogRows.length,
    unique_backlog_models: safe.length,
    duplicate_rows_collapsed: Math.max(0, backlogRows.length - safe.length),
    current_batch: safe.slice(0, batchSize),
    next_batch_preview: safe.slice(batchSize, batchSize * 2),
    remaining_after_current: Math.max(0, safe.length - batchSize),
    cohort_counts: counts,
    automatic_send: false,
    owner_click_required: true,
    no_guess: true,
  };
}

function availabilityCoverageHealth(rows = [], { snapshotStatus = "storage_unavailable", recoveryStatus = "storage_unavailable" } = {}) {
  const items = Array.isArray(rows) ? rows : [];
  const actionableStages = new Set([
    "identity_recovery_required",
    "line_link_required",
    "line_link_expired",
    "availability_confirmation_required",
    "reminder_follow_up_due",
  ]);
  const waitingStages = new Set([
    "line_link_issued_waiting_for_connection",
    "reminder_sent_waiting_for_confirmation",
  ]);
  const totalModels = items.length;
  const excluded = items.filter(item => item.snapshot_state === "excluded").length;
  const identityMissing = items.filter(item => item.snapshot_state === "identity_missing").length;
  const canonicalModels = items.filter(item => item.model_key && item.snapshot_state !== "excluded").length;
  const freshModels = items.filter(item => item.availability_fresh === true).length;
  const sourceUnavailable = items.filter(item => item.snapshot_state === "source_unavailable").length;
  const actionRequired = items.filter(item => actionableStages.has(item.recovery_stage)).length;
  const followUpDue = items.filter(item => item.recovery_stage === "reminder_follow_up_due").length;
  const waitingForModel = items.filter(item => waitingStages.has(item.recovery_stage)).length;
  const unconfirmed = items.filter(item => !item.availability_fresh && item.snapshot_state !== "excluded" && item.snapshot_state !== "source_unavailable").length;
  const sourceIncomplete = snapshotStatus !== "ok" || recoveryStatus !== "ok" || sourceUnavailable > 0;
  const reviewStatus = sourceIncomplete
    ? "source_attention"
    : actionRequired > 0
      ? "owner_action_required"
      : waitingForModel > 0
        ? "waiting_for_model"
        : canonicalModels === 0
          ? "no_canonical_models"
          : freshModels === canonicalModels && identityMissing === 0
            ? "coverage_current"
            : "confirmation_pending";
  return {
    schema: "mmd.availability.coverage-health.v1",
    snapshot_source_status: snapshotStatus,
    recovery_source_status: recoveryStatus,
    review_status: reviewStatus,
    total_models: totalModels,
    excluded_models: excluded,
    canonical_models: canonicalModels,
    identity_missing: identityMissing,
    fresh_models: freshModels,
    fresh_coverage_percent: canonicalModels ? Math.round((freshModels / canonicalModels) * 100) : null,
    unconfirmed_models: unconfirmed,
    source_unavailable_models: sourceUnavailable,
    owner_action_required: actionRequired,
    follow_up_due: followUpDue,
    waiting_for_model: waitingForModel,
    automatic_send: false,
    no_guess: true,
  };
}

export async function readAdminCalendar(env, dateText = "") {
  const day = range(dateText);
  const [allSessions, allModels, mmsAvailability] = await Promise.all([
    list(env, TABLE.sessions, Object.values(F.session)),
    list(env, TABLE.models, Object.values(F.model), "", 300),
    readMmsTherapistAvailability(env),
  ]);
  const [modelSnapshotIndex, recoveryIndex] = await Promise.all([
    readCalendarAvailabilitySnapshots(env, allModels),
    readCalendarRecoveryEvidence(env, allModels),
  ]);
  const modelAvailabilityRows = modelAvailability(allModels, modelSnapshotIndex, recoveryIndex);
  const onboarding = availabilityOnboardingCohort(modelAvailabilityRows, allSessions);
  const availability = {
    models: modelAvailabilityRows,
    model_source_status: modelSnapshotIndex.status,
    model_counts: {
      fresh: modelAvailabilityRows.filter(item => item.availability_fresh).length,
      unconfirmed: modelAvailabilityRows.filter(item => item.snapshot_state === "missing").length,
      stale: modelAvailabilityRows.filter(item => item.snapshot_state === "stale" || item.snapshot_state === "invalid_expiry").length,
      identity_missing: modelAvailabilityRows.filter(item => item.snapshot_state === "identity_missing").length,
      source_unavailable: modelAvailabilityRows.filter(item => item.snapshot_state === "source_unavailable").length,
    },
    recovery_source_status: recoveryIndex.status,
    recovery_counts: modelAvailabilityRows.reduce((counts, item) => {
      const key = clean(item.recovery_stage, 80) || "unknown";
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {}),
    coverage_health: availabilityCoverageHealth(modelAvailabilityRows, {
      snapshotStatus: modelSnapshotIndex.status,
      recoveryStatus: recoveryIndex.status,
    }),
    onboarding,
    therapists: mmsAvailability.therapists,
    therapist_source_status: mmsAvailability.status,
  };
  const sessions = allSessions.filter(s => { const t = Date.parse(startOf(s) || ""); return Number.isFinite(t) && t >= day.start && t < day.end; });
  if (!sessions.length) return emptyContract(day.date, availability);

  const sessionIds = sessions.map(s => clean(field(s, F.session.id), 180)).filter(Boolean);
  const jobIds = sessions.map(s => clean(field(s, F.session.jobId), 180)).filter(Boolean);
  const clientIds = sessions.map(s => link(field(s, F.session.client))).filter(Boolean);
  const [jobs, payments, calLinks, clients] = await Promise.all([
    jobIds.length ? list(env, TABLE.jobs, Object.values(F.job), valuesFormula("job_id", jobIds), 250) : [],
    sessionIds.length ? list(env, TABLE.payments, Object.values(F.payment), valuesFormula("session_id", sessionIds), 500) : [],
    list(env, TABLE.cal, Object.values(F.cal), `OR(${valuesFormula("Session ID", sessionIds)},${valuesFormula("Job ID", jobIds)})`, 400),
    clientIds.length ? list(env, TABLE.clients, Object.values(F.client), idsFormula(clientIds), 150) : [],
  ]);
  const byRecord = records => new Map(records.map(r => [r.id, r]));
  const clientsById = byRecord(clients), modelsById = byRecord(allModels);
  const availabilityByModelRecord = new Map(modelAvailabilityRows.map(item => [item.record_id, item]));
  const jobsById = new Map(jobs.map(j => [clean(field(j, F.job.id), 180), j]));
  const paymentsBySession = new Map();
  for (const p of payments) { const key = clean(field(p, F.payment.sessionId), 180); if (!paymentsBySession.has(key)) paymentsBySession.set(key, []); paymentsBySession.get(key).push(p); }
  const calBySession = new Map();
  for (const c of calLinks) {
    const key = clean(field(c, F.cal.sessionId), 180); if (!key) continue;
    const old = calBySession.get(key);
    if (!old || (Date.parse(field(c, F.cal.eventAt) || 0)||0) >= (Date.parse(field(old, F.cal.eventAt) || 0)||0)) calBySession.set(key, c);
  }
  const items = sessions.map(s => {
    const sid = clean(field(s, F.session.id), 180) || s.id;
    const jid = clean(field(s, F.session.jobId), 180) || null;
    const j = jobsById.get(jid) || null;
    const clientId = link(field(s, F.session.client)) || link(field(j, F.job.client));
    const modelId = link(field(s, F.session.model)) || link(field(j, F.job.model));
    const client = clientsById.get(clientId), model = modelsById.get(modelId);
    const p = latestDeposit(paymentsBySession.get(sid) || [], clean(field(s, F.session.paymentRef), 180));
    const c = calBySession.get(sid);
    const start = startOf(s), end = endOf(s), hours = durationHours(s,j,start,end);
    const paid = p ? verifiedPayment(p) : /verified|paid|confirmed/.test(state(field(s,F.session.paymentStatus),field(j,F.job.depositStatus)));
    const hold = confirmedModel(s) && !paid;
    return {
      session_id: sid, start_at: start, end_at: end,
      location: clean(field(s,F.session.location),240) || clean(field(j,F.job.location),240) || null,
      service_type: clean(field(s,F.session.service),120) || null,
      session_state: clean(field(s,F.session.modelState),100) || clean(field(s,F.session.state),100) || null,
      internal_hold: hold, conflict: false,
      client: { record_id: clientId || null, name: clean(field(client,F.client.display),160) || clean(field(client,F.client.name),160) || clean(field(s,F.session.clientName),160) || null },
      job: { record_id: j?.id || null, job_id: jid, status: clean(field(j,F.job.status),100) || null, duration_hours: hours, budget_thb: number(field(j,F.job.budget)) },
      model: (() => {
        const live = availabilityByModelRecord.get(modelId) || null;
        return {
          record_id: modelId || null,
          model_id: clean(field(model,F.model.modelId),120) || null,
          model_key: live?.model_key || modelKey(model) || null,
          name: clean(field(model,F.model.name),160) || clean(field(s,F.session.modelName),160) || clean(field(j,F.job.modelName),160) || null,
          availability_status: live?.availability_status || "unconfirmed",
          snapshot_state: live?.snapshot_state || "missing",
          availability_fresh: live?.availability_fresh === true,
          confidence: live?.confidence || null,
          updated_at: live?.updated_at || null,
          expires_at: live?.expires_at || null,
          line_connected: live?.line_connected === true,
        };
      })(),
      deposit: { payment_ref: p ? clean(field(p,F.payment.ref),180)||null : clean(field(s,F.session.paymentRef),180)||null, amount_thb: p ? number(field(p,F.payment.amount)) : number(field(s,F.session.depositPaid)), verification_status: p ? clean(field(p,F.payment.verification),100)||clean(field(p,F.payment.depositStatus),100)||clean(field(p,F.payment.status),100)||null : clean(field(s,F.session.paymentStatus),100)||clean(field(j,F.job.depositStatus),100)||null, verified: paid, authority: "payments-worker" },
      pricing: { final_quote_thb: number(field(s,F.session.finalPrice)) ?? number(field(s,F.session.total)) ?? number(field(j,F.job.budget)), review_required: (hours != null && hours > 5) || crossesMidnight(start,end), duration_hours: hours, crosses_midnight: crossesMidnight(start,end), authority: "mmd" },
      cal: c ? { booking_uid: clean(field(c,F.cal.uid),180)||null, booking_id: clean(field(c,F.cal.bookingId),120)||null, event_type_id: clean(field(c,F.cal.eventTypeId),120)||null, mapping_status: clean(field(c,F.cal.status),80)||null, last_trigger_event: clean(field(c,F.cal.trigger),120)||null, last_event_at: clean(field(c,F.cal.eventAt),60)||null } : { booking_uid:null, booking_id:null, event_type_id:null, mapping_status:"unlinked", last_trigger_event:null, last_event_at:null },
    };
  }).sort((a,b)=>(Date.parse(a.start_at||0)||0)-(Date.parse(b.start_at||0)||0));
  overlap(items);
  return contract(day.date, items, availability);
}
function contract(date, items, availability = { models: [], model_source_status: "unavailable", model_counts: {}, therapists: [], therapist_source_status: "unavailable" }) {
  return {
    ok:true,
    schema:"mmd.admin.calendar.v1",
    date,
    timezone:"Asia/Bangkok",
    authority:{session:"events-worker",payment:"payments-worker",backoffice:"airtable",scheduling:"cal.com",surface:"admin-worker"},
    metrics:{
      sessions:items.length,
      holds:items.filter(x=>x.internal_hold).length,
      conflicts:items.filter(x=>x.conflict).length,
      pricing_review:items.filter(x=>x.pricing.review_required).length,
      cal_linked:items.filter(x=>x.cal.booking_uid).length,
    },
    availability,
    items,
  };
}
function emptyContract(date, availability) { return contract(date, [], availability); }

export function calendarJsonResponse(payload, status = 200) {
  return Response.json(payload, { status, headers:{"cache-control":"no-store, private","content-type":"application/json; charset=utf-8","x-mmd-calendar-contract":"v1"} });
}
export async function calendarApiResponse(env, url) {
  return calendarJsonResponse(await readAdminCalendar(env, url.searchParams.get("date") || ""));
}

export function calendarPageResponse() {
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>MMD Calendar · Internal</title><style>:root{color-scheme:dark;--b:#08080b;--p:#121117;--l:rgba(255,255,255,.09);--g:#d7b872;--t:#f7f2ea;--m:rgba(247,242,234,.62);--ok:#79d6a2;--w:#e7bd63;--bad:#ed8f9a}*{box-sizing:border-box}html,body{margin:0;background:var(--b);color:var(--t);font-family:"LINE Seed Sans TH","Noto Sans Thai",system-ui,sans-serif}a{color:inherit;text-decoration:none}button{font:inherit}.app{min-height:100vh;background:radial-gradient(circle at 90% 0,rgba(215,184,114,.09),transparent 30%),var(--b)}.rail{position:fixed;inset:0 auto 0 0;width:238px;padding:20px 16px;border-right:1px solid var(--l);background:#09090d;display:flex;flex-direction:column}.brand{display:flex;align-items:center;gap:11px}.mark{width:40px;height:40px;border:1px solid rgba(215,184,114,.4);border-radius:13px;display:grid;place-items:center;color:var(--g);font-weight:900}.brand b,.brand small{display:block}.brand b{font-size:11px}.brand small{margin-top:3px;color:var(--m);font-size:7px;letter-spacing:.15em}.nav{display:grid;gap:5px;margin-top:24px}.nav a{padding:12px;border-radius:12px;color:var(--m);font-size:10px;font-weight:800}.nav a.on{color:var(--t);background:rgba(255,255,255,.05);box-shadow:inset 3px 0 var(--g)}.main{margin-left:238px;padding:28px 30px 40px}.top{display:grid;grid-template-columns:1fr auto;gap:18px;align-items:end}.eye{color:var(--g);font-size:8px;font-weight:900;letter-spacing:.18em}.top h1{margin:7px 0 0;font-size:clamp(50px,6vw,80px);line-height:.92;letter-spacing:-.055em}.sub{max-width:760px;margin:13px 0 0;color:var(--m);font-size:12px;line-height:1.7}.action{display:flex;gap:7px}.action button,.action a,.date button,.tab{min-height:39px;padding:0 12px;border:1px solid var(--l);border-radius:999px;background:rgba(255,255,255,.02);color:var(--t);font-size:8px;font-weight:900;display:grid;place-items:center;cursor:pointer}.chips,.tabs{display:flex;gap:6px;overflow:auto;margin-top:12px}.chip{padding:9px 11px;border:1px solid var(--l);border-radius:999px;color:var(--m);font-size:8px}.chip b{color:var(--t)}.metrics{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin-top:10px}.metric,.panel{border:1px solid var(--l);background:var(--p);border-radius:17px}.metric{padding:14px}.metric span,.metric b,.metric small{display:block}.metric span,.metric small{color:var(--m);font-size:7px}.metric b{margin-top:8px;font-size:28px}.date{display:grid;grid-template-columns:38px 1fr auto 38px;gap:7px;align-items:center;padding:8px;margin-top:9px;border:1px solid var(--l);border-radius:16px;background:var(--p)}.date small,.date b{display:block}.date small{color:var(--g);font-size:7px}.date b{margin-top:3px;font-size:13px}.tab{white-space:nowrap;color:var(--m)}.tab.on{background:#f1da9c;color:#17120c;border-color:transparent}.grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(280px,.5fr);gap:9px;margin-top:9px;align-items:start}.panel{padding:16px}.ph{display:flex;justify-content:space-between;gap:12px}.ph h2{margin:5px 0 0;font-size:24px}.list,.queue{display:grid;gap:7px;margin-top:12px}.event{display:grid;grid-template-columns:62px 1fr auto;gap:10px;padding:12px;border:1px solid var(--l);border-radius:14px;background:rgba(255,255,255,.018)}.time b,.time span{display:block}.time span,.muted{color:var(--m);font-size:7px}.event h3{margin:0;font-size:12px}.tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}.tag{padding:4px 6px;border:1px solid var(--l);border-radius:999px;color:var(--m);font-size:7px}.hold{color:var(--w)}.ok{color:var(--ok)}.bad{color:var(--bad)}.money{text-align:right;font-size:10px}.side{display:grid;gap:9px}.q{padding:11px;border:1px solid var(--l);border-radius:13px;font-size:9px}.empty{padding:28px 8px;text-align:center;color:var(--m);font-size:9px}.mobile{display:none}@media(max-width:1000px){.rail{position:relative;width:auto}.main{margin-left:0;padding:20px}.nav{display:flex;overflow:auto}.grid{grid-template-columns:1fr}.metrics{grid-template-columns:repeat(3,1fr)}}@media(max-width:767px){body{padding-bottom:68px}.rail{display:none}.main{padding:17px 12px 26px}.top{grid-template-columns:1fr}.top h1{font-size:49px}.metrics{grid-template-columns:1fr 1fr}.metric:last-child{grid-column:1/-1}.event{grid-template-columns:52px 1fr}.money{grid-column:2;text-align:left}.mobile{position:fixed;z-index:20;left:9px;right:9px;bottom:9px;height:55px;border:1px solid var(--l);border-radius:17px;background:rgba(12,11,16,.94);display:grid;grid-template-columns:repeat(4,1fr);place-items:center;font-size:8px}.mobile .on{color:var(--g)}}</style></head><body><div class="app"><aside class="rail"><a class="brand" href="/internal/admin/control-room"><span class="mark">M</span><span><b>MMD PRIVÉ</b><small>CALENDAR CONTROL</small></span></a><nav class="nav"><a href="/internal/admin/control-room">Control Room</a><a class="on" href="/internal/admin/calendar">Calendar</a><a href="/internal/admin/jobs/all">Jobs</a><a href="/internal/admin/payments">Payments</a><a href="/internal/admin/customer-data">Customer 360</a></nav></aside><main class="main"><header class="top"><div><div class="eye">MMD OS · SCHEDULING</div><h1>Calendar</h1><p class="sub">Client + Job + Model + Deposit + Cal booking UID ในหน้าเดียว · Session/Payment truth ยังอยู่กับ MMD Workers</p></div><div class="action"><button id="refresh">Refresh</button><a href="https://app.cal.com" target="_blank" rel="noopener">Open Cal</a></div></header><div class="chips"><span class="chip">CAL BRIDGE <b>SHADOW</b></span><span class="chip">TIMEZONE <b>Asia/Bangkok</b></span><span class="chip">SURFACE <b>admin-worker</b></span></div><section class="metrics" id="metrics"></section><section class="date"><button id="prev">‹</button><div><small id="weekday">—</small><b id="dateLabel">—</b></div><button id="today">วันนี้</button><button id="next">›</button></section><nav class="tabs"><button class="tab on" data-view="today">วันนี้</button><button class="tab" data-view="holds">รอมัดจำ</button><button class="tab" data-view="confirmed">ยืนยันแล้ว</button><button class="tab" data-view="models">นายแบบ</button><button class="tab" data-view="pricing">เช็กราคา</button></nav><section class="grid"><section class="panel"><header class="ph"><div><div class="eye">คิววันนี้</div><h2>ตารางงาน</h2></div><span class="muted" id="count"></span></header><div class="list" id="events"><div class="empty">Loading canonical calendar…</div></div></section><aside class="side"><section class="panel"><div class="eye">ต้องทำต่อ</div><h2 style="margin:5px 0 0;font-size:22px">รอมัดจำ</h2><div class="queue" id="holds"></div></section><section class="panel"><div class="eye">งานยาว</div><h2 style="margin:5px 0 0;font-size:22px">งานยาว / ข้ามคืน</h2><p class="muted" style="line-height:1.7">เกิน 5 ชม. / ข้ามเที่ยงคืน / overnight / multi-day ต้องมี final quote ก่อน Deposit Link</p></section></aside></section></main><nav class="mobile"><a class="on" href="/internal/admin/calendar">วันนี้</a><a href="/internal/admin/calendar#holds">รอมัดจำ</a><a href="/internal/admin/jobs/all">งาน</a><a href="/internal/admin/control-room">เมนู</a></nav></div><script>(()=>{const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];let d=new Date(),view='today',data=null;const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const ymd=()=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d),o=Object.fromEntries(p.map(x=>[x.type,x.value]));return o.year+'-'+o.month+'-'+o.day};const hm=x=>x?new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(x)):'—';const money=x=>x==null?'—':new Intl.NumberFormat('th-TH',{maximumFractionDigits:0}).format(x)+' ฿';function date(){weekday.textContent=new Intl.DateTimeFormat('th-TH',{weekday:'long',timeZone:'Asia/Bangkok'}).format(d);dateLabel.textContent=new Intl.DateTimeFormat('th-TH',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Bangkok'}).format(d)}function rows(){let a=data?.items||[];if(view==='holds')a=a.filter(x=>x.internal_hold);if(view==='confirmed')a=a.filter(x=>x.deposit?.verified);if(view==='models')a=a.filter(x=>x.model?.name);if(view==='pricing')a=a.filter(x=>x.pricing?.review_required);return a}function render(){date();if(!data)return;const m=data.metrics;metrics.innerHTML=[['งานวันนี้',m.sessions],['รอมัดจำ',m.holds],['คิวชน',m.conflicts],['งานยาว',m.pricing_review],['เชื่อม Cal',m.cal_linked]].map(x=>'<article class="metric"><span>'+x[0]+'</span><b>'+x[1]+'</b><small>MMD Calendar</small></article>').join('');const a=rows();count.textContent=a.length+' รายการ';events.innerHTML=a.length?a.map(x=>'<article class="event"><div class="time"><b>'+hm(x.start_at)+'</b><span>'+hm(x.end_at)+'</span></div><div><h3>'+esc(x.model?.name||'Model pending')+' · '+esc(x.client?.name||'Client pending')+'</h3><div class="tags"><span class="tag">JOB '+esc(x.job?.job_id||'—')+'</span><span class="tag">CAL '+esc(x.cal?.booking_uid||'UNLINKED')+'</span>'+(x.internal_hold?'<span class="tag hold">INTERNAL HOLD</span>':'')+(x.deposit?.verified?'<span class="tag ok">DEPOSIT VERIFIED</span>':'<span class="tag hold">DEPOSIT PENDING</span>')+(x.conflict?'<span class="tag bad">CONFLICT</span>':'')+(x.pricing?.review_required?'<span class="tag hold">QUOTE REVIEW</span>':'')+'</div><div class="tags"><span class="tag">'+esc(x.location||'Location pending')+'</span><span class="tag">'+esc(x.deposit?.verification_status||'payment pending')+'</span></div></div><div class="money"><b>'+money(x.pricing?.final_quote_thb)+'</b><div class="muted">Deposit '+money(x.deposit?.amount_thb)+'</div></div></article>').join(''):'<div class="empty">ไม่มีรายการในมุมมองนี้</div>';const h=(data.items||[]).filter(x=>x.internal_hold);holds.innerHTML=h.length?h.map(x=>'<div class="q"><b>'+esc(x.model?.name||'Model')+' · '+hm(x.start_at)+'</b><div class="muted">'+esc(x.client?.name||'Client')+' · '+esc(x.deposit?.verification_status||'รอมัดจำ')+'</div></div>').join(''):'<div class="empty">ไม่มีคิวรอมัดจำ</div>'}async function load(){try{const r=await fetch('/v1/admin/calendar?date='+ymd(),{credentials:'include',cache:'no-store'});if(r.status===401){location.href='/internal/admin/login?next='+encodeURIComponent('/internal/admin/calendar');return}data=await r.json();if(!r.ok||!data.ok)throw Error(data.error||'calendar_unavailable');render()}catch(e){events.innerHTML='<div class="empty bad">Calendar unavailable · '+esc(e.message)+'</div>'}}prev.onclick=()=>{d.setDate(d.getDate()-1);load()};next.onclick=()=>{d.setDate(d.getDate()+1);load()};today.onclick=()=>{d=new Date();load()};refresh.onclick=load;$$('.tab').forEach(b=>b.onclick=()=>{$$('.tab').forEach(x=>x.classList.remove('on'));b.classList.add('on');view=b.dataset.view;render()});date();load()})()</script></body></html>`;
  return new Response(html,{status:200,headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store, private","x-robots-tag":"noindex, nofollow","x-mmd-calendar-surface":"admin-worker-v1"}});
}
