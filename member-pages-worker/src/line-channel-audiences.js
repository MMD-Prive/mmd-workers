const CHANNEL_ID_PATTERN = /^[A-Za-z0-9_-]{6,160}$/;

export function approvedLineChannelIds(env = {}, { dashboardFirst = false } = {}) {
  const primary = dashboardFirst
    ? [env.LINE_DASHBOARD_CHANNEL_ID, env.LINE_LOGIN_CHANNEL_ID]
    : [env.LINE_LOGIN_CHANNEL_ID, env.LINE_DASHBOARD_CHANNEL_ID];
  const values = [...primary, env.LINE_BACKUP_CHANNEL_ID]
    .map((value) => String(value || "").trim())
    .filter((value) => CHANNEL_ID_PATTERN.test(value));
  return [...new Set(values)].slice(0, 3);
}
