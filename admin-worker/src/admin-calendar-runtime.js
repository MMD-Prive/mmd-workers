const API = "https://api.airtable.com/v0";
const BASE = "appsV1ILPRfIjkaYg";
const TABLES = Object.freeze({
  sessions: "tblC98mKWbzmPuNzX",
  jobs: "tbl0jxIjN8QYwGABX",
  payments: "tblWGGJJOx5eBvBZJ",
  clients: "tblVv58TCbwh5j1fS",
  models: "tblI4B0bI446vp9GX",
  calLinks: "tbl6saWYEQrEdnMIK",
});
const F = Object.freeze({
  session: {
    sessionId: "fldLTq2kZbyRv22IA", jobId: "fldHw5HdDDdkHXMhG", clientLink: "fld6P6if0vDZCeV0C",
    clientName: "fldMvnQ0BzDfHUYjT", modelLink: "fldrXQAyOMPCvbOaY", modelName: "flddVz6eoWRHrzIQr",
    start: "fldBeG0FkWwa8kgnp", end: "fldiDSz0wW9Ct9I3P", startLegacy: "fldf9v0UqmfjVWVrL", endLegacy: "fldgImpiwmstRduw6",
    location: "fldIiRpaxoafjTkFt", jobType: "fldjK3U9bghnj7xUe", duration: "fldP7Xx99uf5BvJpF",
    total: "fldeBf4gl5iTBj7eX", finalPrice: "fldug5LUyiLyLvrCV", depositPaid: "fldooTlKtkY8VJy7L",
    paidReceived: "fldAdtXEaedGdfOKc", balanceDue: "fldR4e1DrhO4bNnrS", paymentRef: "fldojgjSQLaO0uQLX",
    paymentStatus: "fldTY5lE6m0kQf72n", sessionState: "fldjE7J1ckyXId1Cf", modelState: "fld57fhdWqIcOy4JpF",
    modelAckAt: "fldFgkHXivIAThfDz",
  },
  job: {
    jobId: "fldwreJwlz8sWd6GM", sessionId: "fldTR8yO6xv40HjOX", clientLink: "fldlPdR0pmynCY6fW",
    modelLink: "fldscPK15ejBw0BAH", modelName: "fldA0qyACFQA2AqhB", dateTimeLocation: "fldunoEkUHCE5CcaQ",
    location: "fldXxOmiDiefa2Sdk", budget: "fldSspHLxJPQOg7wA", depositStatus: "fldtn4oA2qLfFUwDu",
    status: "fld3pY2uK4JsHUeYe", paidTotal: "fldXr5dLdOsUk7aSc", remain: "fldjwejFplrwD3SCR", duration: "fldSl1SS6C6ULGuls",
  },
  payment: {
    ref: "fldOO6SY49iDw8VBZ", sessionId: "fld2wdhBvc8xrV6y5", amount: "fldvCSwrUW8OMAooS",
    status: "fldEJ1hmm7KwWuI6q", verification: "fldJ7a0Ube9F0bmRy", stage: "fldrr9g8ZZjqAbdKQ",
    type: "fldydUWHhqVLMkNSC", depositStatus: "fldD0mQWTfdmyBAeT", verifiedAt: "fldPNK6qgxCSdaJRM",
    verificationRef: "flddkMKy5H8RbFwt9", updatedAt: "fldtNVdDacEH03W4f",
  },
  client: { name: "fldrHqkGQzvBLRxlP", display: "fldGUsLfrAdrN2Hhc" },
  model: { name: "fldShiT60bmCxFxRu", modelId: "fldVWbT0gsSe0hn7Q", availability: "fld6RuUDmGcGDc34i", availableNow: "fldwMpYGpA5RvC76m" },
  cal: {
    linkId: "fldWTSUbH69VzTP97", uid: "fld42rRY3ufGeXCcf", bookingId: "fld4PDFuJecAY3HCf", eventTypeId: "fldzl67JJBq9QKoc2",
    sessionId: "fldd0STLRxOGIKXPn", jobId: "fldzvGB5u7t55kwUQ", mappingStatus: "fld449t1h6s7jbcnf",
    trigger: "fldNhk22zLTvR9Y4C", eventAt: "fldfC6D0RXyogXcMG", start: "fldUmuoHj8Bj9OeGB", end: "fldE0OY6Xt3gwwcqK",
  },
});

function clean(value, max = 500) { return String(value ?? "").trim().slice(0, max); }
function num(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function firstLink(value) { return Array.isArray(value) && value.length ? clean(value[0], 80) : null; }
function field(record, id) { return record?.fields?.[id]; }
function config(env = {}) {
  return { base: clean(env.AIRTABLE_BASE_ID, 80) || BASE, token: clean(env.AIRTABLE_API_KEY || env.AIRTABLE_TOKEN, 500) };
}
function headers(env) {
  const { token } = config(env);
  if (!token) throw new Error("airtable_token_missing");
  return { authorization: `Bearer ${token}`, accept: "application/json" };
}
async function airtableList(env, tableId, fieldIds, { formula = "", max = 600 } = {}) {
  const { base } = config(env);
  const out = [];
  let offset = "";
  do {
    const url = new URL(`${API}/${encodeURIComponent(base)}/${encodeURIComponent(tableId)}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("returnFieldsByFieldId", "true");
    for (const id of fieldIds) url.searchParams.append("fields[]", id);
    if (formula) url.searchParams.set("filterByFormula", formula);
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetch(url, { headers: headers(env) });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`airtable_${tableId}_${response.status}:${clean(body?.error?.message || body?.error?.type, 120)}`);
    out.push(...(Array.isArray(body?.records) ? body.records : []));
    offset = clean(body?.offset, 200);
  } while (offset && out.length < max);
  return out.slice(0, max);
}
function quoteFormula(value) { return `'${clean(value, 180).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`; }
function orFormula(fieldName, values) {
  const safe = [...new Set(values.map(v => clean(v, 180)).filter(Boolean))].slice(0, 80);
  if (!safe.length) return "FALSE()";
  const clauses = safe.map(v => `{${fieldName}}=${quoteFormula(v)}`);
  return clauses.length === 1 ? clauses[0] : `OR(${clauses.join(",")})`;
}
function bangkokRange(dateText) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(clean(dateText, 10)) ? clean(dateText, 10) : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const start = new Date(`${date}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 86400000);
  return { date, start, end };
}
function chooseStart(r) { return clean(field(r, F.session.start), 50) || clean(field(r, F.session.startLegacy), 50) || null; }
function chooseEnd(r) { return clean(field(r, F.session.end), 50) || clean(field(r, F.session.endLegacy), 50) || null; }
function isWithinDay(iso, range) { const t = Date.parse(iso || ""); return Number.isFinite(t) && t >= range.start.getTime() && t < range.end.getTime(); }
function stateText(...values) { return values.map(v => clean(v, 100).toLowerCase()).filter(Boolean).join(" "); }
function isVerifiedPayment(payment) {
  const text = stateText(field(payment, F.payment.verification), field(payment, F.payment.depositStatus), field(payment, F.payment.status));
  return /official_verified|verified|paid|confirmed|complete/.test(text) && !/pending|unverified|rejected|failed|void/.test(text);
}
function isDepositPayment(payment) {
  const text = stateText(field(payment, F.payment.stage), field(payment, F.payment.type));
  return /deposit|มัดจำ/.test(text);
}
function pickPayment(payments, session) {
  const ref = clean(field(session, F.session.paymentRef), 180);
  const deposits = payments.filter(isDepositPayment);
  const candidates = deposits.length ? deposits : payments;
  return candidates.sort((a, b) => {
    const ar = clean(field(a, F.payment.ref), 180) === ref ? 1 : 0;
    const br = clean(field(b, F.payment.ref), 180) === ref ? 1 : 0;
    const av = isVerifiedPayment(a) ? 1 : 0;
    const bv = isVerifiedPayment(b) ? 1 : 0;
    const at = Date.parse(field(a, F.payment.updatedAt) || field(a, F.payment.verifiedAt) || 0) || 0;
    const bt = Date.parse(field(b, F.payment.updatedAt) || field(b, F.payment.verifiedAt) || 0) || 0;
    return (br - ar) || (bv - av) || (bt - at);
  })[0] || null;
}
function crossesBangkokMidnight(startIso, endIso) {
  if (!startIso || !endIso) return false;
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" });
  try { return f.format(new Date(startIso)) !== f.format(new Date(endIso)); } catch { return false; }
}
function durationHours(session, job, startIso, endIso) {
  const explicit = num(field(session, F.session.duration)) ?? num(field(job, F.job.duration));
  if (explicit != null) return explicit;
  const a = Date.parse(startIso || ""); const b = Date.parse(endIso || "");
  return Number.isFinite(a) && Number.isFinite(b) && b > a ? Math.round(((b - a) / 3600000) * 100) / 100 : null;
}
function modelConfirmed(session) {
  if (field(session, F.session.modelAckAt)) return true;
  const text = stateText(field(session, F.session.modelState), field(session, F.session.sessionState));
  return /model_confirmed|confirmed|accepted|acknowledged|ready/.test(text) && !/declined|rejected|cancel/.test(text);
}
function mapLookup(records, idField) { const m = new Map(); for (const r of records) { const key = clean(field(r, idField), 180); if (key) m.set(key, r); } return m; }
function recordLookup(records) { return new Map(records.map(r => [r.id, r])); }
function sameModelKey(item) { return item.model?.record_id || clean(item.model?.name, 120).toLowerCase() || null; }
function markConflicts(items) {
  for (let i = 0; i < items.length; i += 1) for (let j = i + 1; j < items.length; j += 1) {
    const a = items[i], b = items[j], keyA = sameModelKey(a), keyB = sameModelKey(b);
    if (!keyA || keyA !== keyB) continue;
    const as = Date.parse(a.start_at || ""), ae = Date.parse(a.end_at || ""), bs = Date.parse(b.start_at || ""), be = Date.parse(b.end_at || "");
    if ([as, ae, bs, be].every(Number.isFinite) && as < be && bs < ae) { a.conflict = true; b.conflict = true; }
  }
}

export async function readAdminCalendar(env, { date = "" } = {}) {
  const range = bangkokRange(date);
  const sessionFields = Object.values(F.session);
  const sessionsRaw = await airtableList(env, TABLES.sessions, sessionFields, { max: 900 });
  const sessions = sessionsRaw.filter(r => isWithinDay(chooseStart(r), range));
  const sessionIds = sessions.map(r => clean(field(r, F.session.sessionId), 180)).filter(Boolean);
  const jobIds = sessions.map(r => clean(field(r, F.session.jobId), 180)).filter(Boolean);
  const clientRecordIds = sessions.map(r => firstLink(field(r, F.session.clientLink))).filter(Boolean);
  const modelRecordIds = sessions.map(r => firstLink(field(r, F.session.modelLink))).filter(Boolean);

  const [jobs, payments, calLinks, clients, models] = await Promise.all([
    jobIds.length ? airtableList(env, TABLES.jobs, Object.values(F.job), { formula: orFormula("job_id", jobIds), max: 250 }) : [],
    sessionIds.length ? airtableList(env, TABLES.payments, Object.values(F.payment), { formula: orFormula("session_id", sessionIds), max: 500 }) : [],
    (sessionIds.length || jobIds.length) ? airtableList(env, TABLES.calLinks, Object.values(F.cal), { formula: `OR(${orFormula("Session ID", sessionIds)},${orFormula("Job ID", jobIds)})`, max: 400 }) : [],
    clientRecordIds.length ? airtableList(env, TABLES.clients, Object.values(F.client), { formula: `OR(${clientRecordIds.slice(0,80).map(id => `RECORD_ID()=${quoteFormula(id)}`).join(",")})`, max: 120 }) : [],
    modelRecordIds.length ? airtableList(env, TABLES.models, Object.values(F.model), { formula: `OR(${modelRecordIds.slice(0,80).map(id => `RECORD_ID()=${quoteFormula(id)}`).join(",")})`, max: 120 }) : [],
  ]);

  const jobById = mapLookup(jobs, F.job.jobId);
  const clientByRecord = recordLookup(clients);
  const modelByRecord = recordLookup(models);
  const paymentsBySession = new Map();
  for (const p of payments) { const sid = clean(field(p, F.payment.sessionId), 180); if (!paymentsBySession.has(sid)) paymentsBySession.set(sid, []); paymentsBySession.get(sid).push(p); }
  const calBySession = new Map();
  for (const link of calLinks) {
    const sid = clean(field(link, F.cal.sessionId), 180); if (!sid) continue;
    const previous = calBySession.get(sid);
    const currentAt = Date.parse(field(link, F.cal.eventAt) || 0) || 0;
    const previousAt = Date.parse(previous ? field(previous, F.cal.eventAt) : 0) || 0;
    if (!previous || currentAt >= previousAt) calBySession.set(sid, link);
  }

  const items = sessions.map(session => {
    const sessionId = clean(field(session, F.session.sessionId), 180) || session.id;
    const jobId = clean(field(session, F.session.jobId), 180) || null;
    const job = jobById.get(jobId) || null;
    const clientRecordId = firstLink(field(session, F.session.clientLink)) || firstLink(field(job, F.job.clientLink));
    const client = clientByRecord.get(clientRecordId) || null;
    const modelRecordId = firstLink(field(session, F.session.modelLink)) || firstLink(field(job, F.job.modelLink));
    const model = modelByRecord.get(modelRecordId) || null;
    const payment = pickPayment(paymentsBySession.get(sessionId) || [], session);
    const cal = calBySession.get(sessionId) || null;
    const startAt = chooseStart(session);
    const endAt = chooseEnd(session);
    const hours = durationHours(session, job, startAt, endAt);
    const depositVerified = payment ? isVerifiedPayment(payment) : /verified|paid|confirmed/.test(stateText(field(session, F.session.paymentStatus), field(job, F.job.depositStatus)));
    const confirmedModel = modelConfirmed(session);
    const hold = confirmedModel && !depositVerified;
    const priceReview = (hours != null && hours > 5) || crossesBangkokMidnight(startAt, endAt);
    const finalPrice = num(field(session, F.session.finalPrice)) ?? num(field(session, F.session.total)) ?? num(field(job, F.job.budget));
    return {
      session_id: sessionId,
      session_record_id: session.id,
      start_at: startAt,
      end_at: endAt,
      location: clean(field(session, F.session.location), 240) || clean(field(job, F.job.location), 240) || null,
      service_type: clean(field(session, F.session.jobType), 120) || null,
      session_state: clean(field(session, F.session.modelState), 100) || clean(field(session, F.session.sessionState), 100) || null,
      internal_hold: hold,
      conflict: false,
      client: { record_id: clientRecordId || null, name: clean(field(client, F.client.display), 160) || clean(field(client, F.client.name), 160) || clean(field(session, F.session.clientName), 160) || null },
      job: job ? { record_id: job.id, job_id: jobId, status: clean(field(job, F.job.status), 100) || null, duration_hours: hours, location: clean(field(job, F.job.location), 240) || null, budget_thb: num(field(job, F.job.budget)) } : { record_id: null, job_id: jobId, status: null, duration_hours: hours, location: null, budget_thb: null },
      model: { record_id: modelRecordId || null, model_id: clean(field(model, F.model.modelId), 120) || null, name: clean(field(model, F.model.name), 160) || clean(field(session, F.session.modelName), 160) || clean(field(job, F.job.modelName), 160) || null, availability_status: clean(field(model, F.model.availability), 100) || null },
      deposit: { payment_ref: payment ? clean(field(payment, F.payment.ref), 180) || null : clean(field(session, F.session.paymentRef), 180) || null, amount_thb: payment ? num(field(payment, F.payment.amount)) : num(field(session, F.session.depositPaid)), verification_status: payment ? clean(field(payment, F.payment.verification), 100) || clean(field(payment, F.payment.depositStatus), 100) || clean(field(payment, F.payment.status), 100) || null : clean(field(session, F.session.paymentStatus), 100) || clean(field(job, F.job.depositStatus), 100) || null, verified: depositVerified, authority: "payments-worker" },
      pricing: { final_quote_thb: finalPrice, review_required: priceReview, duration_hours: hours, crosses_midnight: crossesBangkokMidnight(startAt, endAt), authority: "mmd" },
      cal: cal ? { booking_uid: clean(field(cal, F.cal.uid), 180) || null, booking_id: clean(field(cal, F.cal.bookingId), 120) || null, event_type_id: clean(field(cal, F.cal.eventTypeId), 120) || null, mapping_status: clean(field(cal, F.cal.mappingStatus), 80) || null, last_trigger_event: clean(field(cal, F.cal.trigger), 120) || null, last_event_at: clean(field(cal, F.cal.eventAt), 60) || null } : { booking_uid: null, booking_id: null, event_type_id: null, mapping_status: "unlinked", last_trigger_event: null, last_event_at: null },
    };
  }).sort((a,b) => (Date.parse(a.start_at || 0) || 0) - (Date.parse(b.start_at || 0) || 0));

  markConflicts(items);
  return {
    ok: true,
    schema: "mmd.admin.calendar.v1",
    date: range.date,
    timezone: "Asia/Bangkok",
    authority: { session: "events-worker", payment: "payments-worker", backoffice: "airtable", scheduling: "cal.com", surface: "admin-worker" },
    metrics: { sessions: items.length, holds: items.filter(x => x.internal_hold).length, conflicts: items.filter(x => x.conflict).length, pricing_review: items.filter(x => x.pricing.review_required).length, cal_linked: items.filter(x => x.cal.booking_uid).length },
    items,
  };
}

function esc(value) { return clean(value, 2000).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
export function renderAdminCalendarPage() {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><title>MMD Calendar · Internal</title><style>
  :root{color-scheme:dark;--bg:#08080b;--panel:#121117;--line:rgba(255,255,255,.09);--gold:#d7b872;--gold2:#f1da9c;--text:#f7f2ea;--muted:rgba(247,242,234,.62);--ok:#79d6a2;--warn:#e7bd63;--bad:#ed8f9a}*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--text);font-family:"LINE Seed Sans TH","Noto Sans Thai",system-ui,-apple-system,sans-serif}a{color:inherit;text-decoration:none}button{font:inherit}.app{min-height:100vh;background:radial-gradient(circle at 88% 0,rgba(215,184,114,.09),transparent 28%),var(--bg)}.rail{position:fixed;inset:0 auto 0 0;width:244px;padding:22px 17px;border-right:1px solid var(--line);background:rgba(8,8,11,.96);display:flex;flex-direction:column;z-index:20}.brand{display:flex;gap:12px;align-items:center}.mark{width:42px;height:42px;border:1px solid rgba(215,184,114,.4);border-radius:14px;display:grid;place-items:center;color:var(--gold);font-weight:900}.brand b,.brand small{display:block}.brand b{font-size:11px;letter-spacing:.1em}.brand small{margin-top:4px;color:var(--muted);font-size:8px;letter-spacing:.14em}.nav{display:grid;gap:6px;margin-top:26px}.nav a{min-height:46px;padding:0 12px;border-radius:13px;display:flex;align-items:center;gap:12px;color:var(--muted);font-size:11px;font-weight:800}.nav a span{width:22px;color:var(--gold);font-size:8px}.nav a.active,.nav a:hover{color:var(--text);background:rgba(255,255,255,.05);box-shadow:inset 3px 0 var(--gold)}.railfoot{margin-top:auto;padding:13px;border:1px solid var(--line);border-radius:15px;color:var(--muted);font-size:9px}.main{margin-left:244px;padding:30px 34px 42px}.top{display:grid;grid-template-columns:1fr auto;gap:20px;align-items:end}.eyebrow{margin:0;color:var(--gold);font-size:8px;font-weight:900;letter-spacing:.18em}.top h1{margin:8px 0 0;font-size:clamp(52px,6vw,82px);line-height:.92;letter-spacing:-.055em}.sub{max-width:760px;margin:14px 0 0;color:var(--muted);font-size:12px;line-height:1.7}.actions{display:flex;gap:8px}.actions button,.actions a{min-height:42px;padding:0 14px;border:1px solid var(--line);border-radius:999px;background:rgba(255,255,255,.025);color:var(--text);font-size:9px;font-weight:900;cursor:pointer}.actions a{display:grid;place-items:center;background:linear-gradient(90deg,#9f7e45,#e4c77f);color:#17120c;border:0}.status{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}.chip{min-height:36px;padding:0 11px;border:1px solid var(--line);border-radius:999px;display:flex;align-items:center;gap:7px;color:var(--muted);font-size:8px}.chip b{color:var(--text)}.dot{width:7px;height:7px;border-radius:50%;background:var(--warn)}.metrics{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:12px}.metric{padding:15px;border:1px solid var(--line);border-radius:17px;background:var(--panel)}.metric span,.metric b,.metric small{display:block}.metric span{color:var(--muted);font-size:8px}.metric b{margin-top:10px;font-size:30px}.metric small{margin-top:5px;color:var(--muted);font-size:7px}.datebar{display:grid;grid-template-columns:40px 1fr auto 40px;gap:8px;align-items:center;margin-top:10px;padding:9px;border:1px solid var(--line);border-radius:17px;background:var(--panel)}.datebar button{min-height:38px;border:1px solid var(--line);border-radius:11px;background:transparent;color:var(--text);cursor:pointer}.datecopy small,.datecopy b{display:block}.datecopy small{color:var(--gold);font-size:8px}.datecopy b{margin-top:3px;font-size:14px}.tabs{display:flex;gap:6px;overflow:auto;margin-top:9px}.tab{white-space:nowrap;min-height:38px;padding:0 13px;border:1px solid var(--line);border-radius:999px;background:transparent;color:var(--muted);font-size:8px;font-weight:900;cursor:pointer}.tab.active{background:var(--gold2);color:#17120c;border-color:transparent}.grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(290px,.55fr);gap:10px;margin-top:10px;align-items:start}.panel{padding:17px;border:1px solid var(--line);border-radius:21px;background:linear-gradient(180deg,rgba(255,255,255,.025),rgba(255,255,255,.01)),var(--panel)}.ph{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.ph h2{margin:5px 0 0;font-size:26px}.hint{color:var(--muted);font-size:8px}.list{display:grid;gap:8px;margin-top:14px}.event{display:grid;grid-template-columns:70px 1fr auto;gap:12px;padding:13px;border:1px solid var(--line);border-radius:15px;background:rgba(255,255,255,.018)}.time b,.time span{display:block}.time b{font-size:16px}.time span{margin-top:3px;color:var(--muted);font-size:8px}.event h3{margin:0;font-size:13px}.meta{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.tag{padding:5px 7px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:7px}.tag.hold{color:var(--warn);border-color:rgba(231,189,99,.35)}.tag.ok{color:var(--ok)}.tag.bad{color:var(--bad)}.money{text-align:right}.money b,.money span{display:block}.money b{font-size:12px}.money span{margin-top:4px;color:var(--muted);font-size:7px}.side{display:grid;gap:10px}.queue{display:grid;gap:7px;margin-top:12px}.q{padding:12px;border:1px solid var(--line);border-radius:14px}.q b,.q span{display:block}.q b{font-size:10px}.q span{margin-top:5px;color:var(--muted);font-size:8px;line-height:1.5}.empty{padding:26px 10px;text-align:center;color:var(--muted);font-size:10px}.footer{display:flex;justify-content:space-between;gap:14px;margin-top:15px;color:var(--muted);font-size:7px}.mobile{display:none}.loading{opacity:.55}.error{padding:14px;border:1px solid rgba(237,143,154,.3);border-radius:14px;color:var(--bad);font-size:9px}
  @media(max-width:1050px){.rail{position:relative;width:auto;height:auto}.main{margin-left:0;padding:22px}.railfoot{display:none}.nav{display:flex;overflow:auto}.nav a{white-space:nowrap}.grid{grid-template-columns:1fr}.metrics{grid-template-columns:repeat(3,1fr)}}@media(max-width:767px){body{padding-bottom:72px}.rail{display:none}.main{padding:18px 13px 28px}.top{grid-template-columns:1fr}.top h1{font-size:50px}.metrics{grid-template-columns:1fr 1fr}.metric:last-child{grid-column:1/-1}.event{grid-template-columns:58px 1fr}.money{grid-column:2;text-align:left}.footer{display:grid}.mobile{position:fixed;z-index:50;left:10px;right:10px;bottom:10px;height:58px;padding:5px;border:1px solid var(--line);border-radius:18px;background:rgba(13,12,17,.93);backdrop-filter:blur(20px);display:grid;grid-template-columns:repeat(4,1fr)}.mobile a,.mobile button{border:0;background:transparent;color:var(--muted);display:grid;place-items:center;align-content:center;gap:2px;font-size:8px}.mobile .active{color:var(--gold2)}}
  </style></head><body><div class="app"><aside class="rail"><a class="brand" href="/internal/admin/control-room"><span class="mark">M</span><span><b>MMD PRIVÉ</b><small>CALENDAR CONTROL</small></span></a><nav class="nav"><a href="/internal/admin/control-room"><span>01</span>Control Room</a><a class="active" href="/internal/admin/calendar"><span>02</span>Calendar</a><a href="/internal/admin/jobs/all"><span>03</span>Jobs</a><a href="/internal/admin/payments"><span>04</span>Payments</a><a href="/internal/admin/customer-data"><span>05</span>Customer 360</a></nav><div class="railfoot">Owner session required<br>Worker-rendered surface</div></aside><main class="main"><header class="top"><div><p class="eyebrow">MMD OS · SCHEDULING</p><h1>Calendar</h1><p class="sub">Client + Job + Model + Deposit + Cal booking identity ในหน้าเดียว โดย Session และ Payment truth ยังอยู่กับ MMD Workers</p></div><div class="actions"><button id="refresh">Refresh</button><a href="https://app.cal.com" target="_blank" rel="noopener">Open Cal</a></div></header><section class="status"><div class="chip"><i class="dot"></i>CAL BRIDGE <b>SHADOW</b></div><div class="chip">TIMEZONE <b>Asia/Bangkok</b></div><div class="chip">SURFACE <b>admin-worker</b></div></section><section class="metrics" id="metrics"></section><section class="datebar"><button id="prev">‹</button><div class="datecopy"><small id="weekday">—</small><b id="dateLabel">—</b></div><button id="today">Today</button><button id="next">›</button></section><nav class="tabs"><button class="tab active" data-view="today">Today</button><button class="tab" data-view="holds">Holds</button><button class="tab" data-view="confirmed">Confirmed</button><button class="tab" data-view="models">Models</button><button class="tab" data-view="pricing">Pricing Review</button></nav><section class="grid"><section class="panel"><header class="ph"><div><p class="eyebrow">DAY FLOW</p><h2>Timeline</h2></div><span class="hint" id="count"></span></header><div class="list" id="events"><div class="empty">Loading canonical calendar…</div></div></section><aside class="side"><section class="panel"><header class="ph"><div><p class="eyebrow">DEPOSIT GATE</p><h2>Internal Holds</h2></div></header><div class="queue" id="holds"></div></section><section class="panel"><p class="eyebrow">PRICING CONTROL</p><h2 style="margin:5px 0 0;font-size:22px">Extended work</h2><p class="hint" style="line-height:1.7">งานเกิน 5 ชม. / ข้ามเที่ยงคืน / overnight / multi-day ต้องมี final quote ก่อนออก Deposit Link</p></section></aside></section><footer class="footer"><span>MMD Privé Internal · Worker rendered</span><span>events-worker · payments-worker · Airtable · Cal.com</span></footer></main><nav class="mobile"><a class="active" href="/internal/admin/calendar">Today</a><button data-mobile="holds">Holds</button><a href="/internal/admin/jobs/all">Jobs</a><a href="/internal/admin/control-room">More</a></nav></div><script>
  (()=>{const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];let selected=new Date(),view='today',payload=null;const pad=n=>String(n).padStart(2,'0');const ymd=d=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);const o=Object.fromEntries(parts.map(x=>[x.type,x.value]));return o.year+'-'+o.month+'-'+o.day};const money=n=>n==null?'—':new Intl.NumberFormat('th-TH',{maximumFractionDigits:0}).format(n)+' ฿';const hm=x=>{if(!x)return'—';return new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(x))};const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));function dateText(){const d=selected;$('#weekday').textContent=new Intl.DateTimeFormat('th-TH',{weekday:'long',timeZone:'Asia/Bangkok'}).format(d);$('#dateLabel').textContent=new Intl.DateTimeFormat('th-TH',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Bangkok'}).format(d)}function filtered(){const all=payload?.items||[];if(view==='holds')return all.filter(x=>x.internal_hold);if(view==='confirmed')return all.filter(x=>x.deposit?.verified);if(view==='models')return all.filter(x=>x.model?.name);if(view==='pricing')return all.filter(x=>x.pricing?.review_required);return all}function render(){dateText();if(!payload)return;const m=payload.metrics||{};$('#metrics').innerHTML=[['งานวันนี้',m.sessions,'Sessions'],['รอมัดจำ',m.holds,'Internal Hold'],['คิวชน',m.conflicts,'Needs review'],['Extended quote',m.pricing_review,'Pricing gate'],['Cal linked',m.cal_linked,'Booking UID']].map(x=>'<article class="metric"><span>'+x[0]+'</span><b>'+e(x[1]??0)+'</b><small>'+x[2]+'</small></article>').join('');const items=filtered();$('#count').textContent=items.length+' items';$('#events').innerHTML=items.length?items.map(x=>'<article class="event"><div class="time"><b>'+hm(x.start_at)+'</b><span>'+hm(x.end_at)+'</span></div><div><h3>'+e(x.model?.name||'Model pending')+' · '+e(x.client?.name||'Client pending')+'</h3><div class="meta"><span class="tag">'+e(x.service_type||x.job?.status||'Session')+'</span>'+(x.internal_hold?'<span class="tag hold">INTERNAL HOLD</span>':'')+(x.deposit?.verified?'<span class="tag ok">DEPOSIT VERIFIED</span>':'<span class="tag hold">DEPOSIT PENDING</span>')+(x.conflict?'<span class="tag bad">CONFLICT</span>':'')+(x.pricing?.review_required?'<span class="tag hold">QUOTE REVIEW</span>':'')+'<span class="tag">JOB '+e(x.job?.job_id||'—')+'</span><span class="tag">CAL '+e(x.cal?.booking_uid||'UNLINKED')+'</span></div><div class="meta"><span class="tag">'+e(x.location||'Location pending')+'</span><span class="tag">'+e(x.deposit?.verification_status||'payment pending')+'</span></div></div><div class="money"><b>'+money(x.pricing?.final_quote_thb)+'</b><span>Deposit '+money(x.deposit?.amount_thb)+'</span></div></article>').join(''):'<div class="empty">ไม่มีรายการในมุมมองนี้</div>';const holds=(payload.items||[]).filter(x=>x.internal_hold);$('#holds').innerHTML=holds.length?holds.map(x=>'<div class="q"><b>'+e(x.model?.name||'Model')+' · '+hm(x.start_at)+'</b><span>'+e(x.client?.name||'Client')+' · '+e(x.deposit?.verification_status||'รอมัดจำ')+'</span></div>').join(''):'<div class="empty">ไม่มี Internal Hold</div>'}async function load(){document.body.classList.add('loading');try{const r=await fetch('/v1/admin/calendar?date='+encodeURIComponent(ymd(selected)),{credentials:'include',cache:'no-store',headers:{accept:'application/json'}});if(r.status===401){location.href='/internal/admin/login?next='+encodeURIComponent('/internal/admin/calendar');return}const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||'calendar_unavailable');payload=j;render()}catch(err){$('#events').innerHTML='<div class="error">Calendar unavailable: '+e(err.message)+'</div>'}finally{document.body.classList.remove('loading')}}$('#prev').onclick=()=>{selected.setDate(selected.getDate()-1);load()};$('#next').onclick=()=>{selected.setDate(selected.getDate()+1);load()};$('#today').onclick=()=>{selected=new Date();load()};$('#refresh').onclick=load;$$('.tab').forEach(b=>b.onclick=()=>{$$('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');view=b.dataset.view;render()});$('[data-mobile="holds"]').onclick=()=>{view='holds';$$('.tab').forEach(x=>x.classList.toggle('active',x.dataset.view==='holds'));render();scrollTo({top:document.querySelector('.grid').offsetTop-10,behavior:'smooth'})};load()})();
  </script></body></html>`;
}

export async function calendarApiResponse(env, url) {
  const payload = await readAdminCalendar(env, { date: url.searchParams.get("date") || "" });
  return Response.json(payload, { status: 200, headers: { "cache-control": "no-store, private", "content-type": "application/json; charset=utf-8", "x-mmd-calendar-contract": "v1" } });
}
export function calendarPageResponse() {
  return new Response(renderAdminCalendarPage(), { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, private", "x-robots-tag": "noindex, nofollow", "x-mmd-calendar-surface": "admin-worker-v1" } });
}
