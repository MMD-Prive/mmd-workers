/**
 * MMD Redirect Worker — HARD DISABLED
 *
 * Owner directive: 2026-08-21 (Asia/Bangkok)
 *
 * This worker must not redirect, rewrite, proxy, render recovery shells,
 * classify routes, attach route ownership, or make routing decisions.
 * It is frozen until a new explicit owner directive is issued.
 *
 * Runtime behavior is transparent pass-through only.
 */

export const FRONT_GATE = "mmd-redirect-worker";
export const FRONT_VERSION = "20260821-hard-disabled";
export const REDIRECT_WORKER_DISABLED = true;

export default {
  async fetch(request) {
    return fetch(request);
  },
};
