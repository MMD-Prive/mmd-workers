import {normalizeSessionState} from './modelSessionContractV1.js';

export function readReconfirmLifecycle(env,fields) {
  const keys=[env.AT_SESSIONS__CANONICAL_STATE||'model_session_state',env.AT_SESSIONS__STATE||'session_state',env.AT_SESSIONS__STATUS||'status','Session Status'];
  for(const key of new Set(keys.map(v=>String(v).trim()))) {
    const value=String(fields?.[key]??'').trim();
    if(value)return normalizeSessionState(value)||value.toLowerCase();
  }
  return '';
}
