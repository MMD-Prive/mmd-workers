import { parseSigilMembershipPaymentComponents } from "../../shared/sigil-membership-payment-components.mjs";
const OPTIONS = ["mk", "burn", "live", "group"];
export const SERVICE_PRICING_MARKER = "[MMD SERVICE PRICING v1]";
const money = value => typeof value === "number" && Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.round(value * 100)) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
const sameMoney = (left, right) => money(left) && money(right) && Math.round(left * 100) === Math.round(right * 100);
const total = (base, addons, key) => Math.round((base + addons.reduce((sum, a) => sum + a[key], 0)) * 100) / 100;

/** Optional, backward-compatible quote envelope. Never grants membership or changes settlement policy. */
export function validateJobServicePricing(body) {
  if (body?.service_pricing === undefined) return null;
  const p = body.service_pricing;
  const fail = () => { const error = new Error("Invalid service pricing breakdown or aggregate amounts.");
    error.code = "service_pricing_invalid"; error.status = 400; throw error; };
  if (!p || p.version !== 1 || p.currency !== "THB" || !["direct", "platform"].includes(p.settlement_mode)
    || p.settlement_mode !== body?.private_access?.settlement_mode || !Array.isArray(p.addons)
    || p.addons.length > OPTIONS.length || !money(p.client_base_amount_thb) || p.client_base_amount_thb <= 0) fail();
  if (body?.work?.job_visibility !== "private" || !money(body.amount_thb) || body.amount_thb <= 0) fail();
  if (p.settlement_mode === "platform" && [body.pay_model_thb, body.model_payout_thb,
    body?.model_payout?.amount_thb, body?.payment?.model_payout_thb].some(value => value !== undefined)) fail();
  const requested = body?.work?.service_options ?? [];
  if (!Array.isArray(requested) || new Set(requested).size !== requested.length || requested.some(o => !OPTIONS.includes(o))) fail();
  if (new Set(p.addons.map(a => a?.option)).size !== p.addons.length || p.addons.length !== requested.length) fail();
  for (const a of p.addons) {
    if (!a || !requested.includes(a.option) || !money(a.client_amount_thb) || !money(a.model_payout_thb)) fail();
  }
  const clientTotal = total(p.client_base_amount_thb, p.addons, "client_amount_thb");
  if (!money(clientTotal) || p.client_total_amount_thb !== clientTotal) fail();
  const note = body.note || body?.notes?.operation_note || body?.notes?.handling_note || body.notes || "";
  let components;
  try { components = parseSigilMembershipPaymentComponents(note, body.amount_thb); }
  catch { fail(); }
  // Only the existing, official-verification-bound renewal marker can explain
  // a non-service payment component. It does not grant or renew membership.
  const customerTotal = components?.customer_total_thb ?? clientTotal;
  if (components && components.service_amount_thb !== clientTotal) fail();
  if (!sameMoney(body.amount_thb, customerTotal)) fail();
  for (const amount of [body.service_amount_thb, body.original_amount_thb, body?.payment?.service_amount_thb]) {
    if (amount !== undefined && !sameMoney(amount, clientTotal)) fail();
  }
  if (body?.payment?.amount_thb !== undefined && !sameMoney(body.payment.amount_thb, customerTotal)) fail();
  const needsModel = p.settlement_mode === "direct" || p.addons.length > 0;
  if (needsModel && (!money(p.model_base_payout_thb) || p.model_base_payout_thb <= 0)) fail();
  const modelTotal = needsModel ? total(p.model_base_payout_thb, p.addons, "model_payout_thb") : null;
  if ((needsModel && !money(modelTotal)) || p.model_total_payout_thb !== modelTotal
    || (!needsModel && p.model_base_payout_thb !== null)) fail();
  if (p.settlement_mode === "direct") {
    for (const amount of [body.pay_model_thb, body.model_payout_thb, body?.model_payout?.amount_thb, body?.payment?.model_payout_thb]) {
      if (amount !== undefined && amount !== modelTotal) fail();
    }
    if (body.pay_model_thb !== modelTotal) fail();
  }
  // Persist only validated bounded fields, never arbitrary browser metadata.
  const snapshot = { version: 1, currency: "THB", settlement_mode: p.settlement_mode,
    client_base_amount_thb: p.client_base_amount_thb, model_base_payout_thb: p.model_base_payout_thb,
    addons: OPTIONS.flatMap(option => p.addons.filter(a => a.option === option).map(a => ({ option,
      client_amount_thb: a.client_amount_thb, model_payout_thb: a.model_payout_thb }))),
    client_total_amount_thb: clientTotal, model_total_payout_thb: modelTotal };
  // Reject an oversized machine envelope before grants or creation writes.
  withJobServicePricingNote(preservePartnerSnapshot(note, body), snapshot);
  return snapshot;
}

export function withJobServicePricingNote(note, pricing) {
  if (!pricing) return note;
  // Match the issuer's control-character normalization before identifying old
  // snapshots, including indented CRLF/tab-prefixed markers.
  const lines = String(note ?? "").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, " ")
    .split("\n").filter(line => !line.trimStart().startsWith(SERVICE_PRICING_MARKER));
  const protectedLines = [];
  const humanLines = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trimStart();
    if (trimmed.startsWith("[MMD_MEMBERSHIP_ACTION_V1]")) {
      protectedLines.push(line);
    } else if (trimmed.startsWith(PARTNER_SNAPSHOT_MARKER)) {
      // Canonical partner evidence is a marker followed by single-line JSON.
      // Keep that block immutable, including the legacy inline JSON form.
      protectedLines.push(line);
      if (!trimmed.slice(PARTNER_SNAPSHOT_MARKER.length).trim()) {
        if (index + 1 < lines.length) protectedLines.push(lines[++index]);
      }
    } else {
      humanLines.push(line);
    }
  }
  const human = humanLines.join("\n").trim();
  // Put complete machine snapshots first. The issuer may prepend a held-job
  // marker or append SIGIL pricing before applying its 4,000-character limit.
  const machine = [`${SERVICE_PRICING_MARKER} ${JSON.stringify(pricing)}`, ...protectedLines].join("\n");
  // Reserve room for the issuer's bounded held-job prefix as well.
  const persistedBudget = 3800;
  if (machine.length > persistedBudget) {
    const error = new Error("Protected pricing snapshots exceed the persisted note limit.");
    error.code = "service_pricing_note_too_large"; error.status = 400; throw error;
  }
  const humanBudget = Math.max(0, persistedBudget - machine.length - 1);
  const boundedHuman = human.slice(0, humanBudget);
  return boundedHuman ? `${machine}\n${boundedHuman}` : machine;
}

export const PARTNER_SNAPSHOT_MARKER = "[SIGIL Partner Snapshot v1]";
export function preservePartnerSnapshot(existingNote, body = {}) {
  const note = String(existingNote ?? "").trim();
  // Only the initial job snapshot is attached. Later roster/rate edits never
  // replace historical evidence. This is internal operator evidence, not a grant.
  if (note.includes(PARTNER_SNAPSHOT_MARKER)) return note;
  const relationship = body.job_details?.partner_relationship;
  const attribution = body.partner_attribution;
  if (!relationship && !attribution) return note;
  const snapshot = {
    source: "sigil_jobs_operator_snapshot",
    recorded_at: new Date().toISOString(),
    partner_relationship: relationship || null,
    partner_attribution: attribution || null,
    model_payout_thb: body.model_payout_thb ?? body.pay_model_thb ?? relationship?.model_payout_thb ?? null,
  };
  return [note, PARTNER_SNAPSHOT_MARKER, JSON.stringify(snapshot)].filter(Boolean).join("\n");
}
