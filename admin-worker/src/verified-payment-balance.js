import {sessionBalanceView} from '../../shared/session-balance-view.mjs';

export async function readVerifiedPaymentBalance(env, sessionId) {
  try {
    if (!/^[-\w]{1,220}$/.test(sessionId || '') || !env.PAYMENTS_WORKER?.fetch || !env.AUTH_SERVICE_ADMIN_TO_PAYMENTS) throw Error();
    const response = await env.PAYMENTS_WORKER.fetch(new Request('https://payments.internal/v1/internal/payments/balance', {
      method: 'POST', headers: {'content-type': 'application/json', 'x-internal-token': env.AUTH_SERVICE_ADMIN_TO_PAYMENTS},
      body: JSON.stringify({session_id: sessionId}), signal: AbortSignal.timeout(12000),
    }));
    const data = await response.json();
    if (!response.ok || data?.ok !== true || data.authority !== 'payments-worker' || data.balance?.schema !== 'verified_session_balance_v1') throw Error();
    return sessionBalanceView(data.balance, sessionId);
  } catch {
    throw Object.assign(new Error('verified_balance_unavailable'), {status: 503});
  }
}
