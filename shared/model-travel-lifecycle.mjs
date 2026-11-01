// Shared read normalizer from the customer Session contract (#2509).
// No ordering evidence means conflicting canonical fields stay unknown.
const displayable = new Set(['pending_confirmation','confirmed','preparing','en_route','nearby','arrived','met_customer','final_payment_pending','final_payment_confirmed','work_started','in_progress','work_finished','separated','completed','cancelled']);
export function customerSessionLifecycle(fields = {}) {
  const aliases = {pending:'pending_confirmation',pending_confirm:'pending_confirmation',ready:'confirmed',confirm:'confirmed',prep:'preparing',on_the_way:'en_route',enroute:'en_route',meeting:'met_customer',started:'in_progress',complete:'completed',done:'completed',canceled:'cancelled'};
  const normalize = value => { const raw=typeof value==='string'?value.trim().toLowerCase().replace(/[\s-]+/g,'_'):'';return aliases[raw]||raw; };
  const model=normalize(fields.model_session_state),session=normalize(fields.session_state);
  if(model&&session&&model!==session)return 'checking';
  const state=model||session||normalize(fields['Session Status']);
  return displayable.has(state)?state:'checking';
}
