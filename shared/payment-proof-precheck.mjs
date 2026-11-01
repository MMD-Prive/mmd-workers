// Read-only evidence correlation. A match is never verification of money.
const text = value => String(value ?? "").trim();
const ids = value => Array.isArray(value) ? [...new Set(value.map(text).filter(Boolean))] : [];
const quote = value => text(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const money = value => value !== null && value !== undefined && text(value) !== "" && Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
const stopped = value => /^(?:cancelled|canceled|rejected|void|refunded|failed|revoked)$/.test(text(value).toLowerCase());
const evidenceSchemas = new Set(["mmd_web_payment_proof_v1", "mmd_shop_payment_proof_v1", "line_payment_evidence_v3", "line_payment_evidence_v4", "mmd_admin_slip_upload_v1"]);
export function paymentProofReviewUrl(proofId, sessionId = "") {
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(text(proofId))) return null;
  const params = new URLSearchParams({ proof_id: proofId, focus: "verify" });
  if (/^sess[-_][A-Za-z0-9_-]{1,210}$/.test(text(sessionId))) params.set("session_id", sessionId);
  return `https://www.mmdbkk.com/internal/admin/payments?${params}`;
}
export function paymentProofNote(value) {
  try { const note = JSON.parse(text(value)); if (note && typeof note === "object" && !Array.isArray(note)) return note; } catch {}
  return Object.fromEntries(text(value).split(/;\s*/).map(part => { const i = part.indexOf("="); return i > 0 ? [part.slice(0, i), part.slice(i + 1)] : []; }).filter(part => part.length === 2));
}
export function paymentProofIdentity(proof = {}) {
  const f = proof.fields || {}, n = paymentProofNote(f.note), x = n.extraction || {};
  const trusted = evidenceSchemas.has(n.schema);
  const hash = trusted ? text(n.evidence_sha256).toLowerCase() : "";
  const ref = trusted ? text(x.bank_transaction_ref || x.provider_txn_id || n.manual_evidence_review?.bank_reference) : "";
  const at = text(x.paid_at || n.manual_evidence_review?.paid_at || f.paid_at);
  return { hash: /^[a-f0-9]{64}$/.test(hash) ? hash : "", bankRef: /^[A-Za-z0-9][A-Za-z0-9._/ -]{2,179}$/.test(ref) ? ref : "", bank: text(x.sender_bank || x.provider).toLowerCase(), receiverBank: text(x.receiver_bank).toLowerCase(),
    amount: money(x.amount_thb ?? f.amount_thb), at: /T.*(?:Z|[+-]\d\d:\d\d)$/.test(at) && Number.isFinite(Date.parse(at)) ? Date.parse(at) : null,
    clients: ids(f.Client || f.client || (n.links?.client ? [n.links.client] : [])), members: ids(f.member || f.Member || (n.links?.member ? [n.links.member] : [])),
  };
}
function sameCustomer(a, b) {
  if ([a.clients, b.clients, a.members, b.members].some(v => v.length > 1)) return false;
  if (a.clients.length && b.clients.length && a.clients[0] !== b.clients[0]) return false;
  if (a.members.length && b.members.length && a.members[0] !== b.members[0]) return false;
  return Boolean(a.clients[0] && a.clients[0] === b.clients[0] || a.members[0] && a.members[0] === b.members[0]);
}
const table = (env, kind) => kind === "proofs" ? text(env.AIRTABLE_TABLE_PAYMENT_PROOFS_ID || env.AIRTABLE_TABLE_PAYMENT_PROOFS || "tblfJfM4Sqag9zrLi")
  : kind === "payments" ? text(env.AIRTABLE_TABLE_PAYMENTS_ID || env.AIRTABLE_TABLE_PAYMENTS || "tblWGGJJOx5eBvBZJ")
  : text(env.AIRTABLE_TABLE_SESSIONS_ID || env.AIRTABLE_TABLE_SESSIONS || "tblC98mKWbzmPuNzX");
async function rows(env, kind, formula, limit = 20) {
  if (!env.AIRTABLE_BASE_ID || !env.AIRTABLE_API_KEY) throw Error("precheck_not_configured");
  const url = new URL(`https://api.airtable.com/v0/${encodeURIComponent(env.AIRTABLE_BASE_ID)}/${encodeURIComponent(table(env, kind))}`);
  url.searchParams.set("filterByFormula", formula); url.searchParams.set("pageSize", String(limit));
  const request = new Request(url, { headers: { authorization: `Bearer ${env.AIRTABLE_API_KEY}` }, signal: AbortSignal.timeout(8000) });
  const response = await (env.AIRTABLE_HTTP?.fetch ? env.AIRTABLE_HTTP.fetch(request) : fetch(request));
  if (!response.ok) throw Error("precheck_lookup_failed");
  const data = await response.json();
  if (data.offset || !Array.isArray(data.records) || data.records.length > limit) throw Error("precheck_incomplete");
  return data.records;
}
async function canonicalContext(env, proof, identity) {
  const f = proof.fields || {}, ref = text(f.payment_ref), linkedPayments = ids(f.payment), linkedSessions = ids(f.session);
  if (!ref || linkedPayments.length !== 1 || linkedSessions.length !== 1) return null;
  const payments = await rows(env, "payments", `{payment_ref}='${quote(ref)}'`, 2);
  if (payments.length !== 1 || payments[0].id !== linkedPayments[0]) return null;
  const p = payments[0].fields || {}, pIdentity = paymentProofIdentity({ fields: p });
  if (!sameCustomer(identity, pIdentity) || stopped(p.payment_status || p["Payment Status"])) return null;
  const sid = text(p.session_id), stage = text(p.payment_stage || p.payment_type).toLowerCase();
  if (!/^sess[-_][A-Za-z0-9_-]{1,210}$/.test(sid) || !["deposit", "full", "final", "tips"].includes(stage)) return null;
  const sessions = await rows(env, "sessions", `{session_id}='${quote(sid)}'`, 2);
  if (sessions.length !== 1 || sessions[0].id !== linkedSessions[0]) return null;
  const s = sessions[0].fields || {};
  if (!sameCustomer(identity, paymentProofIdentity({ fields: s })) || stopped(s["Session Status"] || s.session_state)) return null;
  return { status: "exact", payment_record_id: payments[0].id, payment_ref: ref, session_record_id: sessions[0].id, session_id: sid,
    payment_stage: stage, expected_amount_thb: money(p.amount_thb ?? p.Amount),
    client_name: text(s.client_name), model_name: text(s.model_name), job_date: text(s.job_date), start_time: text(s.start_time), end_time: text(s.end_time), location_name: text(s.location_name) };
}
export function unavailableProofPrecheck(proofId) {
  return { schema: "payment_proof_precheck_v1", status: "unavailable", complete: false, duplicate_count: null, matches: [], canonical: null,
    primary_proof_id: text(proofId), review_url: paymentProofReviewUrl(proofId), money_truth_changed: false, official_verification_required: true };
}
export async function inspectPaymentProof(env, proof) {
  const f = proof.fields || {}, proofId = text(f.proof_id), identity = paymentProofIdentity(proof);
  const base = { ...unavailableProofPrecheck(proofId), status: "insufficient_evidence", complete: true, duplicate_count: 0 };
  const terms = [];
  if (identity.hash) terms.push(`FIND('${identity.hash}',{note})`);
  if (identity.bankRef) terms.push(`FIND('${quote(identity.bankRef)}',{note})`);
  if (text(f.payment_ref) && ids(f.payment).length === 1) terms.push(`{payment_ref}='${quote(f.payment_ref)}'`);
  if (!terms.length) return base;
  try {
    const candidates = await rows(env, "proofs", `OR(${terms.join(",")})`);
    const exact = [], possible = [];
    for (const row of candidates) {
      if (row.id === proof.id || text(row.fields?.proof_id) === proofId || stopped(row.fields?.status)) continue;
      const n = paymentProofNote(row.fields?.note);
      if (n.schema === "mmd_historical_slip_backfill_v1") continue;
      const other = paymentProofIdentity(row);
      const hashMatch = identity.hash && identity.hash === other.hash;
      const bankMatch = identity.bankRef && identity.bankRef === other.bankRef;
      if (!hashMatch && !bankMatch) {
        if (text(f.payment_ref) && text(f.payment_ref) === text(row.fields?.payment_ref) && sameCustomer(identity, other)) {
          possible.push({ proof_id: text(row.fields?.proof_id), channel: text(row.fields?.channel), basis: "same_payment_different_evidence", same_customer: true, conflict: false, row });
        }
        continue;
      }
      const conflict = identity.amount !== null && other.amount !== null && Math.abs(identity.amount - other.amount) > .009
        || identity.at !== null && other.at !== null && identity.at !== other.at
        || identity.bankRef && other.bankRef && identity.bankRef !== other.bankRef
        || identity.bank && other.bank && identity.bank !== other.bank
        || identity.receiverBank && other.receiverBank && identity.receiverBank !== other.receiverBank;
      const transactionMatch = bankMatch && identity.bank && identity.bank === other.bank && identity.amount !== null && other.amount !== null && identity.at !== null && identity.at === other.at;
      const match = { proof_id: text(row.fields?.proof_id), channel: text(row.fields?.channel), basis: hashMatch ? "same_image_sha256" : "same_bank_transaction",
        same_customer: sameCustomer(identity, other), conflict: Boolean(conflict), row };
      (match.same_customer && !conflict && (hashMatch || transactionMatch) ? exact : possible).push(match);
    }
    const contexts = [];
    const linked = new Map();
    for (const match of exact) {
      const f = match.row.fields || {};
      if (text(f.payment_ref) && ids(f.payment).length === 1 && ids(f.session).length === 1) linked.set(`${f.payment_ref}:${ids(f.payment)[0]}:${ids(f.session)[0]}`, match);
    }
    // One canonical context costs at most two exact reads, even if many copies
    // of the same slip exist. Different contexts are ambiguous before lookup.
    if (linked.size === 1) {
      const match = [...linked.values()][0], context = await canonicalContext(env, match.row, identity);
      if (context) contexts.push({ match, context });
    }
    const keys = new Set(contexts.map(x => `${x.context.payment_ref}:${x.context.session_id}`));
    const ambiguous = linked.size > 1 || keys.size > 1 || possible.length > 0;
    const selected = !ambiguous ? contexts[0] : null;
    // An existing proof's payment/session links may not be silently redirected.
    const currentRef = text(f.payment_ref), currentPayments = ids(f.payment), currentSessions = ids(f.session);
    const conflict = selected && (currentPayments.length > 1 || currentSessions.length > 1
      || currentPayments.length === 1 && currentPayments[0] !== selected.context.payment_record_id
      || currentSessions.length === 1 && currentSessions[0] !== selected.context.session_record_id
      || currentRef && currentPayments.length && currentRef !== selected.context.payment_ref);
    const canonical = conflict ? null : selected?.context || null;
    const primary = canonical ? selected.match.proof_id : proofId;
    return { ...base, status: ambiguous || conflict ? "needs_review" : exact.length ? "duplicate" : "clear",
      duplicate_count: exact.length, matches: [...exact, ...possible].map(({ row, ...match }) => match), canonical,
      primary_proof_id: primary, review_url: paymentProofReviewUrl(primary, canonical?.session_id),
      issues: [ambiguous ? "duplicate_match_ambiguous" : "", possible.some(match => match.basis === "same_payment_different_evidence") ? "existing_payment_proof_not_transfer_dedup" : "", conflict ? "existing_payment_context_conflict" : ""].filter(Boolean) };
  } catch { return unavailableProofPrecheck(proofId); }
}
export function proofPrecheckLines(check = {}) {
  if (check.issues?.includes("existing_payment_proof_not_transfer_dedup")) return ["⚠️ Payment นี้มีหลักฐานเดิมแล้ว · ยังไม่ยืนยันว่าภาพใหม่เป็นธุรกรรมซ้ำ", "เปิดรายการเดิมเพื่อตรวจเทียบก่อนนับยอดรับ"];
  if (check.status === "duplicate") {
    const sources = [...new Set((check.matches || []).map(match => match.channel === "web_pay" ? "หน้า Payment" : ["line", "line_oa", "line_ofc"].includes(match.channel) ? "LINE OFC" : "คิวหลักฐานเดิม"))];
    return ["⚠️ พบหลักฐานซ้ำจากช่องทางอื่น · อย่านับยอดรับซ้ำ", sources.length ? `ต้นทางหลักฐานเดิม: ${sources.join(" / ")}` : "", "เทียบภาพ/เลขธุรกรรมกับหลักฐานเดิมก่อนยืนยันเงินเข้า"].filter(Boolean);
  }
  if (check.status === "needs_review") return ["⚠️ พบหลักฐานที่อาจซ้ำหรือข้อมูลขัดกัน · ต้องตรวจจับคู่ก่อน"];
  if (check.status === "clear") return ["ตรวจเบื้องต้น: ยังไม่พบหลักฐานซ้ำที่ตรงกัน · ยังไม่ยืนยันเงินเข้า"];
  return ["ตรวจเบื้องต้นยังไม่ครบ · ตรวจภาพและรายการเงินเข้าก่อนยืนยัน"];
}
