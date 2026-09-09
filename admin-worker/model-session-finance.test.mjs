import assert from "node:assert/strict";
import { test } from "node:test";

import financeWorker, {
  projectModelFinancePayload,
  sanitizeModelFinancePayload,
} from "./src/studio-finance-worker.js";

const unsafeSession = {
  ok: true,
  session: {
    session_id: "sess_finance_659",
    normalized_state: "confirmed",
    allowed_actions: ["start_travel"],
    amount_due_thb: 17850,
    balance_due_calc: 17850,
    remaining_balance: 17850,
    amount_thb: 25500,
    customer_total: 25500,
    quoted_price: 25500,
    deposit_verified_amount: 7650,
    pay_model_thb: 17000,
    model_payout_amount_thb: 17000,
    expected_payout_thb: 99999,
    payment_ref: "pay_private_659",
    bank_account: "private-bank",
    provider_transaction_id: "provider-private",
    margin_thb: 8500,
    commission_thb: 1000,
  },
};

test("MMD MODEL current session keeps only canonical expected payout", () => {
  const projected = projectModelFinancePayload(unsafeSession, {
    status: "resolved",
    expected_payout_thb: 17000,
    payout_status: "pending",
  });

  assert.equal(projected.session.session_id, "sess_finance_659");
  assert.equal(projected.session.expected_payout_thb, 17000);
  assert.equal(projected.session.payout_status, "pending");
  assert.deepEqual(projected.session.allowed_actions, ["start_travel"]);

  const json = JSON.stringify(projected);
  assert.doesNotMatch(json, /amount_due_thb|balance_due_calc|remaining_balance|amount_thb|customer_total|quoted_price|deposit_verified_amount|pay_model_thb|model_payout_amount_thb|payment_ref|bank_account|provider_transaction_id|margin_thb|commission_thb/i);
  assert.doesNotMatch(json, /17850|25500|7650|99999|8500/);
});

test("model finance sanitizer recursively strips customer/payment internals", () => {
  const sanitized = sanitizeModelFinancePayload({
    ok: true,
    data: {
      session: unsafeSession.session,
      nested: { slip_url: "private-slip", customer_spend_thb: 9999 },
    },
  });
  const json = JSON.stringify(sanitized);
  assert.doesNotMatch(json, /slip_url|customer_spend|private-slip|9999|payment_ref|bank/i);
});

test("missing or invalid model auth fails closed before finance is added", async () => {
  const response = await financeWorker.fetch(
    new Request("https://mmdbkk.com/v1/model/session/current"),
    {},
    {},
  );
  assert.ok([401, 403, 503].includes(response.status));
  const body = await response.json().catch(() => ({}));
  assert.equal(Object.hasOwn(body?.session || {}, "expected_payout_thb"), false);
});
