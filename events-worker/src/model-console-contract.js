// Model Console Contract (Production)

export const FLOW = [
  "confirmed",
  "en_route",
  "arrived",
  "met",
  "final_payment_pending",
  "final_payment_confirmed",
  "work_started",
  "work_finished",
  "separated",
  "review",
  "payout"
];

export const SIDE_EVENTS = new Set([
  "live_location_update",
  "eta_sent",
  "delay_reported",
  "live_location_stopped"
]);

export function canTransition(current, next){
  if(SIDE_EVENTS.has(next)) return true;
  const idx = FLOW.indexOf(current);
  const nextIdx = FLOW.indexOf(next);
  if(nextIdx === -1) return false;
  return nextIdx === idx + 1;
}

export function buildClientView(job){
  return {
    status: job.status,
    eta: job.eta_text || null,
    map: job.live_map_url || null,
    last_update_at: job.last_update_at || null
  };
}
