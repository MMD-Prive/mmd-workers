export const PAYMENT_NOTIFICATION_CRON = "*/5 * * * *";

// Frequent ticks retry only persisted notifications. Keep rich-menu sync,
// evidence analysis and health scans on their existing hourly schedule.
export async function handlePaymentNotificationTick(event, env, drain) {
  if (event?.cron !== PAYMENT_NOTIFICATION_CRON) return false;
  await drain(env);
  return true;
}
