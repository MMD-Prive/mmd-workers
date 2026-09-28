import { pathToFileURL } from "node:url";

export async function ensurePaymentNotificationCron(worker, env = process.env, fetcher = fetch) {
  if (!["admin-worker", "payments-worker"].includes(worker)) throw new Error("unsupported_payment_notification_worker");
  const token = String(env.CLOUDFLARE_API_TOKEN || "").trim();
  const account = String(env.CLOUDFLARE_ACCOUNT_ID || "").trim();
  if (!token || !account) throw new Error("cloudflare_schedule_configuration_missing");
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/workers/scripts/${worker}/schedules`;
  const request = async (method, body) => {
    const response = await fetcher(url, {
      method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
    });
    const payload = await response.json();
    if (!response.ok || payload.success !== true) throw new Error(`payment_notification_schedule_${method}_${response.status}`);
    if (!Array.isArray(payload.result?.schedules)) throw new Error("payment_notification_schedule_response_invalid");
    return payload.result.schedules;
  };
  const desired = "*/5 * * * *";
  const current = await request("GET");
  const crons = [...new Set(current.map((item) => item.cron).filter(Boolean))];
  if (!crons.includes(desired)) await request("PUT", [...crons, desired].map((cron) => ({ cron })));
  const verified = await request("GET");
  if (![...crons, desired].every((cron) => verified.some((item) => item.cron === cron))) throw new Error("payment_notification_schedule_not_verified");
  return { worker, cron: desired };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await ensurePaymentNotificationCron(process.argv[2]);
  console.log(`Verified ${result.worker} payment notification retry schedule: ${result.cron}`);
}
