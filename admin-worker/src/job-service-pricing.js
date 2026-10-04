const OPTIONS = ["mk", "burn", "live"];
export const SERVICE_PRICING_MARKER = "[MMD SERVICE PRICING v1]";
const money = value => typeof value === "number" && Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.round(value * 100)) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
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
  if (body?.work?.job_visibility !== "private" || body.amount_thb !== p.client_total_amount_thb) fail();
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
  for (const amount of [body.amount_thb, body.service_amount_thb, body.original_amount_thb,
    body?.payment?.amount_thb, body?.payment?.service_amount_thb]) {
    if (amount !== undefined && amount !== clientTotal) fail();
  }
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
  return { version: 1, currency: "THB", settlement_mode: p.settlement_mode,
    client_base_amount_thb: p.client_base_amount_thb, model_base_payout_thb: p.model_base_payout_thb,
    addons: OPTIONS.flatMap(option => p.addons.filter(a => a.option === option).map(a => ({ option,
      client_amount_thb: a.client_amount_thb, model_payout_thb: a.model_payout_thb }))),
    client_total_amount_thb: clientTotal, model_total_payout_thb: modelTotal };
}

export function withJobServicePricingNote(note, pricing) {
  if (!pricing) return note;
  const cleanNote = String(note ?? "").split("\n").filter(line => !line.startsWith(SERVICE_PRICING_MARKER)).join("\n");
  return [cleanNote, `${SERVICE_PRICING_MARKER} ${JSON.stringify(pricing)}`].filter(Boolean).join("\n");
}
