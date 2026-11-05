// Telegram has no sendMessage idempotency key. Persist uncertainty before I/O;
// a lost response or interrupted invocation must never authorize another send.
export async function deliverTelegramOnce(journal, checkpoint, send) {
  if (journal.state?.telegram_send_started)
    return {ok:false,retryable:false,error:'telegram_delivery_unknown'};
  if (typeof checkpoint !== 'function')
    return {ok:false,retryable:false,error:'telegram_delivery_checkpoint_required'};
  const state={...journal.state,telegram_send_started:true};
  await checkpoint(state);
  try {
    const response=await send();
    const body=await response.json();
    if(response.ok && body?.telegram?.ok===true) return {ok:true};
    const rejection=body?.telegram;
    // Only a structured Telegram 4xx rejection proves non-delivery.
    if(rejection?.ok===false && rejection.error?.ok===false &&
       Number.isInteger(rejection.error.error_code) && rejection.error.error_code>=400 && rejection.error.error_code<500) {
      await checkpoint({...state,telegram_send_started:false});
      return {ok:false,error:'telegram_delivery_rejected'};
    }
  } catch { /* The provider may have accepted the message. */ }
  return {ok:false,retryable:false,error:'telegram_delivery_unknown'};
}
