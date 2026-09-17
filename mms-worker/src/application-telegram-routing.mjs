export const DEFAULT_APPLICATIONS_THREAD_ID = 155;

export function mmsApplicationThreadId(env = {}) {
  const candidates = [
    env.MMS_TELEGRAM_APPLICATIONS_THREAD_ID,
    env.TELEGRAM_APPLICATIONS_THREAD_ID,
    env.TELEGRAM_PUBLIC_MODEL_THREAD_ID,
    env.TG_THREAD_PUBLIC_MODEL,
    DEFAULT_APPLICATIONS_THREAD_ID,
  ];

  for (const candidate of candidates) {
    const threadId = Number(String(candidate ?? "").trim());
    if (Number.isInteger(threadId) && threadId > 0) return threadId;
  }

  return DEFAULT_APPLICATIONS_THREAD_ID;
}
