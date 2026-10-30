// Presentation only: never supplies settlement, eligibility or payment purpose.
export function paymentProofOpsSummary({ customer = {}, extraction = {}, intelligence = {}, copy }) {
  const clean = value => String(value ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 180);
  const rename = customer.status === "matched" && customer.rename_source === "exact_line_client_per_rename_v1"
    ? clean(customer.per_rename) : "";
  const name = rename || clean(customer.display_name) || copy.customerUnknown;
  const value = extraction.amount_thb;
  const amount = typeof value === "number" && Number.isFinite(value) && value > 0
    ? value.toLocaleString("th-TH", { maximumFractionDigits: 2 }) + " " + copy.currency
    : extraction.extraction_error ? copy.amountUnreadable : copy.amountPending;
  const purpose = intelligence.tracking_kind === "membership_renewal" ? copy.renewal
    : intelligence.tracking_kind === "membership_signup" ? copy.signup : copy.purposeUnknown;
  return { name, amount, purpose, bankStatus: copy.bankUnverified };
}
