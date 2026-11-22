import test from "node:test";
import assert from "node:assert/strict";
import { ensurePaymentNotificationCron } from "./ensure-payment-notification-cron.mjs";

test("cron synchronization preserves existing schedules and does not touch routes", async () => {
  let schedules = [{ cron: "0 * * * *" }];
  let writes = 0;
  const fetcher = async (url, init) => {
    assert.match(url, /\/workers\/scripts\/payments-worker\/schedules$/);
    if (init.method === "PUT") { schedules = JSON.parse(init.body); writes++; }
    return Response.json({ success: true, result: { schedules } });
  };
  const env = { CLOUDFLARE_API_TOKEN: "test", CLOUDFLARE_ACCOUNT_ID: "account" };
  await ensurePaymentNotificationCron("payments-worker", env, fetcher);
  await ensurePaymentNotificationCron("payments-worker", env, fetcher);
  assert.equal(writes, 1);
  assert.deepEqual(schedules, [{ cron: "0 * * * *" }, { cron: "*/5 * * * *" }]);
});

test("LINE notification Cron keeps hourly reconciliation and verifies five-minute retry installation", async () => {
  let schedules = [{ cron: "0 * * * *" }];
  const fetcher = async (url, init) => {
    assert.match(url, /member-dashboard-chat-worker\/schedules$/);
    if (init.method === "PUT") schedules = JSON.parse(init.body);
    return Response.json({ success: true, result: { schedules } });
  };
  await ensurePaymentNotificationCron("member-dashboard-chat-worker", { CLOUDFLARE_API_TOKEN: "test", CLOUDFLARE_ACCOUNT_ID: "account" }, fetcher);
  assert.deepEqual(schedules.map(s => s.cron), ["0 * * * *", "*/5 * * * *"]);
});
