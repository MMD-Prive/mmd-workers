const AIRTABLE_API = "https://api.airtable.com/v0";
const RATE_THB = 100;
const ELIGIBLE_STAGES = new Set(["deposit", "full", "membership"]);

export function computePhase1Points(priorRemainderThb, eligibleAmountThb) {
  const prior = normalizeWholeThb(priorRemainderThb);
  const eligible = normalizeWholeThb(eligibleAmountThb);
  const pool = prior + eligible;
  return {
    prior_remainder_thb: prior,
    eligible_amount_thb: eligible,
    pool_thb: pool,
    points: Math.floor(pool / RATE_THB),
    remainder_after_thb: pool % RATE_THB,
    rate_thb_per_point: RATE_THB,
  };
}

export async function awardBasePointsPhase1(env, payload) {
  const stage = clean(payload.stage).toLowerCase();
  if (!ELIGIBLE_STAGES.has(stage)) {
    return { ok: true, skipped: true, reason: "stage_not_eligible" };
  }

  requireAirtable(env);
  const paymentRef = clean(payload.payment_ref);
  if (!paymentRef) return { ok: false, skipped: true, reason: "payment_ref_required" };

  const memberId = clean(payload.member_id) || await resolveCanonicalMemberId(env, payload.member_email);
  if (!memberId) {
    return { ok: true, skipped: true, awarded: false, reason: "canonical_member_id_required" };
  }

  if (!env.POINTS_PHASE1_COORDINATOR) {
    throw new Error("points_phase1_coordinator_missing");
  }

  const id = env.POINTS_PHASE1_COORDINATOR.idFromName(`member:${memberId}`);
  const stub = env.POINTS_PHASE1_COORDINATOR.get(id);
  const response = await stub.fetch("https://points.internal/award", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      payment_ref: paymentRef,
      stage,
      session_id: clean(payload.session_id),
      amount_thb: payload.amount_thb,
      member_id: memberId,
      member_email: clean(payload.member_email).toLowerCase(),
    }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(result?.error || `points_phase1_coordinator_${response.status}`);
  return result;
}

export class PointsPhase1Coordinator {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
    const body = await request.json().catch(() => ({}));
    try {
      const result = await writeSerializedLedgerEvent(this.env, body);
      return json(result, 200);
    } catch (error) {
      return json({ ok: false, error: String(error?.message || error || "points_phase1_failed") }, 500);
    }
  }
}

async function writeSerializedLedgerEvent(env, payload) {
  requireAirtable(env);
  const paymentRef = clean(payload.payment_ref);
  const memberId = clean(payload.member_id);
  if (!paymentRef) throw new Error("payment_ref_required");
  if (!memberId) throw new Error("canonical_member_id_required");

  const ledgerTable = clean(env.AIRTABLE_TABLE_POINTS_LEDGER || "points_ledger");
  const duplicate = await findFirst(env, ledgerTable, `{payment_ref}=${formulaText(paymentRef)}`);
  if (duplicate?.id) {
    return {
      ok: true,
      duplicate: true,
      awarded: false,
      record_id: duplicate.id,
      member_id: clean(duplicate.fields?.member_id || memberId),
      points: Number(duplicate.fields?.points || 0),
      remainder_after_thb: Number(duplicate.fields?.remainder_after_thb || 0),
    };
  }

  const latest = await findLatestBaseEntry(env, ledgerTable, memberId);
  const priorRemainder = Number(latest?.fields?.remainder_after_thb || 0);
  const computed = computePhase1Points(priorRemainder, payload.amount_thb);
  const postedAt = new Date().toISOString();

  const record = await createRecord(env, ledgerTable, {
    member_id: memberId,
    member_email: clean(payload.member_email).toLowerCase(),
    payment_ref: paymentRef,
    session_id: clean(payload.session_id),
    amount_thb: computed.eligible_amount_thb,
    eligible_amount_thb: computed.eligible_amount_thb,
    prior_remainder_thb: computed.prior_remainder_thb,
    pool_thb: computed.pool_thb,
    points: computed.points,
    remainder_after_thb: computed.remainder_after_thb,
    points_bucket: "base_phase1",
    rate_policy: "phase1_100_thb_1_pt_remainder",
    source: "payments-worker",
    note: "Base Points Phase 1. Wallet and THB remainder are independent of membership expiry; expires_at intentionally unset.",
    idempotency_key: `base_phase1:${paymentRef}`,
    posted_at: postedAt,
    transaction_status: "posted",
  });

  return {
    ok: true,
    awarded: computed.points > 0,
    record_id: record?.id || null,
    member_id: memberId,
    ...computed,
    expires_at: null,
  };
}

async function resolveCanonicalMemberId(env, emailRaw) {
  const email = clean(emailRaw).toLowerCase();
  if (!email || !email.includes("@")) return "";
  const table = clean(env.AIRTABLE_TABLE_MEMBERS || env.AIRTABLE_TABLE_MEMBERS_ID || "Members");
  const formulas = [
    `LOWER({email})=${formulaText(email)}`,
    `LOWER({Contact Email})=${formulaText(email)}`,
    `LOWER({member_email})=${formulaText(email)}`,
  ];
  for (const formula of formulas) {
    try {
      const row = await findFirst(env, table, formula);
      const fields = row?.fields || {};
      const id = clean(fields.member_id || fields["Member ID"] || fields.memberstack_id);
      if (id) return id;
    } catch {}
  }
  return "";
}

async function findLatestBaseEntry(env, table, memberId) {
  const qs = new URLSearchParams({
    maxRecords: "1",
    pageSize: "1",
    filterByFormula: `AND({member_id}=${formulaText(memberId)},{points_bucket}=${formulaText("base_phase1")})`,
  });
  qs.set("sort[0][field]", "posted_at");
  qs.set("sort[0][direction]", "desc");
  const data = await airtable(env, `${encodeURIComponent(table)}?${qs.toString()}`, { method: "GET" });
  return data?.records?.[0] || null;
}

async function findFirst(env, table, formula) {
  const qs = new URLSearchParams({ maxRecords: "1", pageSize: "1", filterByFormula: formula });
  const data = await airtable(env, `${encodeURIComponent(table)}?${qs.toString()}`, { method: "GET" });
  return data?.records?.[0] || null;
}

async function createRecord(env, table, fields) {
  const data = await airtable(env, encodeURIComponent(table), {
    method: "POST",
    body: JSON.stringify({ records: [{ fields: compact(fields) }] }),
  });
  return data?.records?.[0] || null;
}

async function airtable(env, path, init) {
  const response = await fetch(`${AIRTABLE_API}/${encodeURIComponent(clean(env.AIRTABLE_BASE_ID))}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${clean(env.AIRTABLE_API_KEY)}`,
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`airtable_${response.status}:${JSON.stringify(data)}`);
  return data;
}

function requireAirtable(env) {
  if (!clean(env.AIRTABLE_API_KEY) || !clean(env.AIRTABLE_BASE_ID)) throw new Error("airtable_config_missing");
}
function normalizeWholeThb(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}
function formulaText(value) {
  return `"${clean(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
function clean(value) { return String(value ?? "").trim(); }
function compact(obj) { return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined && value !== "")); }
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
