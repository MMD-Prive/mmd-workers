#!/usr/bin/env node

const { AirtableClient } = require("./dry-run-import.js");

const POINTS_LEDGER_TABLE = process.env.AIRTABLE_TABLE_POINTS_LEDGER || "tbl5dfnwjUFMLbnWL";
const POINTS_BUCKET = "base_phase1";
const RATE_THB = 100;
const REBUILDER = "points_wallet_rebuild_v1";

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function formulaString(value) {
  return `"${clean(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function parseArgs(argv) {
  const out = { apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--member-id") out.memberId = argv[index + 1];
    if (arg === "--apply") out.apply = true;
  }
  return out;
}

function eventTime(row) {
  const posted = Date.parse(clean(row?.fields?.posted_at));
  if (!Number.isFinite(posted)) throw coded("WALLET_REBUILD_POSTED_AT_REQUIRED");
  return posted;
}

function eligibleAmount(row) {
  const fields = row?.fields || {};
  return Math.floor(number(fields.eligible_amount_thb || fields.amount_thb));
}

function sortBaseEvents(rows, memberId) {
  return (rows || [])
    .filter((row) => clean(row?.fields?.member_id) === clean(memberId))
    .filter((row) => clean(row?.fields?.points_bucket) === POINTS_BUCKET)
    .filter((row) => !clean(row?.fields?.transaction_status) || clean(row?.fields?.transaction_status) === "posted")
    .map((row) => ({ row, time: eventTime(row) }))
    .sort((a, b) => {
      if (a.time !== b.time) return a.time - b.time;
      const aRef = clean(a.row?.fields?.payment_ref || a.row?.fields?.idempotency_key || a.row?.id);
      const bRef = clean(b.row?.fields?.payment_ref || b.row?.fields?.idempotency_key || b.row?.id);
      return aRef.localeCompare(bRef);
    })
    .map((item) => item.row);
}

function buildWalletRebuildPlan(rows, { memberId } = {}) {
  const canonicalMemberId = clean(memberId);
  if (!canonicalMemberId) throw coded("WALLET_REBUILD_MEMBER_ID_REQUIRED");

  const ordered = sortBaseEvents(rows, canonicalMemberId);
  let remainder = 0;
  const events = ordered.map((row) => {
    const fields = row.fields || {};
    const eligible = eligibleAmount(row);
    const pool = remainder + eligible;
    const points = Math.floor(pool / RATE_THB);
    const nextRemainder = pool % RATE_THB;
    const expected = {
      prior_remainder_thb: remainder,
      pool_thb: pool,
      points,
      remainder_after_thb: nextRemainder,
    };
    const changed =
      number(fields.prior_remainder_thb) !== expected.prior_remainder_thb ||
      number(fields.pool_thb) !== expected.pool_thb ||
      number(fields.points) !== expected.points ||
      number(fields.remainder_after_thb) !== expected.remainder_after_thb;
    remainder = nextRemainder;
    return {
      record_id: clean(row.id),
      payment_ref: clean(fields.payment_ref),
      idempotency_key: clean(fields.idempotency_key),
      posted_at: clean(fields.posted_at),
      eligible_amount_thb: eligible,
      changed,
      expected,
    };
  });

  return {
    schema: REBUILDER,
    member_id: canonicalMemberId,
    points_bucket: POINTS_BUCKET,
    rate_thb_per_point: RATE_THB,
    total_events: events.length,
    changed_events: events.filter((event) => event.changed).length,
    final_remainder_thb: remainder,
    events,
    forbidden_writes: ["MMD — Member Entitlements"],
  };
}

async function loadWalletRows(airtable, memberId) {
  return airtable.list(POINTS_LEDGER_TABLE, {
    filterByFormula: `AND({member_id}=${formulaString(memberId)},{points_bucket}=${formulaString(POINTS_BUCKET)})`,
    maxRecords: "1000",
  });
}

async function rebuildPointsWallet({ memberId, apply = false, airtable = new AirtableClient() } = {}) {
  const canonicalMemberId = clean(memberId);
  if (!canonicalMemberId) throw coded("WALLET_REBUILD_MEMBER_ID_REQUIRED");
  const rows = await loadWalletRows(airtable, canonicalMemberId);
  const plan = buildWalletRebuildPlan(rows, { memberId: canonicalMemberId });

  if (!apply) return { ok: true, dry_run: true, plan, entitlement_write: false };

  const writes = [];
  for (const event of plan.events.filter((item) => item.changed)) {
    if (!event.record_id) throw coded("WALLET_REBUILD_RECORD_ID_REQUIRED");
    const updated = await airtable.requestWithFieldFallback(POINTS_LEDGER_TABLE, {
      method: "PATCH",
      recordId: event.record_id,
      body: { fields: event.expected },
    });
    writes.push({ record_id: clean(updated?.id || event.record_id), payment_ref: event.payment_ref });
  }

  const after = buildWalletRebuildPlan(await loadWalletRows(airtable, canonicalMemberId), { memberId: canonicalMemberId });
  if (after.changed_events !== 0) throw coded("WALLET_REBUILD_POST_APPLY_DRIFT");

  return {
    ok: true,
    dry_run: false,
    schema: REBUILDER,
    member_id: canonicalMemberId,
    patched_records: writes,
    final_remainder_thb: after.final_remainder_thb,
    entitlement_write: false,
  };
}

function coded(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.memberId) {
    console.error("Usage: node scripts/line-official-legacy/points-wallet-rebuild.js --member-id <canonical_member_id> [--apply]");
    process.exitCode = 1;
    return;
  }
  try {
    const result = await rebuildPointsWallet(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, schema: REBUILDER, error: String(error?.code || error?.message || error) }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  POINTS_BUCKET,
  RATE_THB,
  REBUILDER,
  buildWalletRebuildPlan,
  parseArgs,
  rebuildPointsWallet,
  sortBaseEvents,
};