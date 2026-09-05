import fs from "node:fs";

const path = "admin-worker/src/payment-review-runtime.js";
let src = fs.readFileSync(path, "utf8");

function replaceOnce(from, to, label) {
  if (!src.includes(from)) throw new Error(`missing ${label}`);
  src = src.replace(from, to);
}

if (!src.includes('const CANONICAL_PAYMENTS_TABLE_ID = "tblWGGJJOx5eBvBZJ";')) {
  replaceOnce(
    'const AIRTABLE_API = "https://api.airtable.com/v0";',
    'const AIRTABLE_API = "https://api.airtable.com/v0";\nconst CANONICAL_PAYMENTS_TABLE_ID = "tblWGGJJOx5eBvBZJ";',
    "canonical payments table constant",
  );
}

replaceOnce(
  '      authority: "payments-worker",\n      money_truth_changed: false,',
  '      authority: "admin-worker",\n      money_truth_changed: false,',
  "non-money-truth authority",
);

replaceOnce(
  `  const audit = await writeAudit(env, {\n    actor,\n    decision,\n    proof_id: proofId,\n    proof_record_id: proof.id,\n    idempotency_key: idempotencyKey,\n    reason,\n    result: "success",\n    authority: "payments-worker",\n    payment_ref: approval.payment_ref,\n    amount_thb: approval.amount_thb,\n    payment_stage: approval.payment_stage,\n  });\n\n  return json({`,
  `  const audit = await writeAudit(env, {\n    actor,\n    decision,\n    proof_id: proofId,\n    proof_record_id: proof.id,\n    idempotency_key: idempotencyKey,\n    reason,\n    result: "success",\n    authority: "payments-worker",\n    payment_ref: approval.payment_ref,\n    amount_thb: approval.amount_thb,\n    payment_stage: approval.payment_stage,\n  }).then((value) => ({ ...value, ok: true })).catch((error) => ({\n    ok: false,\n    event_id: "",\n    error: safeCode(error?.message || error || "payment_review_audit_write_failed"),\n  }));\n\n  return json({`,
  "post-money-truth audit handling",
);

replaceOnce(
  '    audit_event_id: audit.event_id,\n    authority: "payments-worker",',
  '    audit_event_id: audit.event_id || null,\n    audit_write_failed: audit.ok === false,\n    manual_audit_required: audit.ok === false,\n    authority: "payments-worker",',
  "audit result response",
);

replaceOnce(
  `function safeQueueItem(record) {\n  const fields = record?.fields || {};\n  const note = parseNote(fields.note);`,
  `function safeQueueItem(record) {\n  const fields = record?.fields || {};\n  const proofId = safeText(fields.proof_id, 120);\n  if (!proofId) return null;\n  const note = parseNote(fields.note);`,
  "proof id queue guard",
);

replaceOnce(
  '    proof_id: safeText(fields.proof_id || record.id, 120),',
  '    proof_id: proofId,',
  "proof id queue value",
);

replaceOnce(
  '  const records = await airtableList(env, accessLogTable(env), { filterByFormula: formula, maxRecords: 2 }).catch(() => []);',
  '  const records = await airtableList(env, accessLogTable(env), { filterByFormula: formula, maxRecords: 2 });',
  "audit lookup fail closed",
);

replaceOnce(
  `function paymentsTable(env) {\n  return clean(env.AIRTABLE_TABLE_PAYMENTS || env.AT_PAYMENTS_TABLE || "Payments");\n}`,
  `function paymentsTable(env) {\n  return clean(\n    env.AIRTABLE_TABLE_PAYMENTS_ID ||\n    env.AIRTABLE_TABLE_PAYMENTS ||\n    env.AT_PAYMENTS_TABLE ||\n    CANONICAL_PAYMENTS_TABLE_ID\n  );\n}`,
  "canonical payments table resolver",
);

fs.writeFileSync(path, src);
