// The Events Worker remains the only ETA writer. Both apps consume this contract.
export function travelEtaFromEvents(value, now = Date.now()) {
  const unavailable=()=>({status:'unavailable',server_now:new Date(now).toISOString(),arrival_at:null,updated_at:null});
  let events = value;
  if (typeof value === 'string') {
    if(value.length>64000)return unavailable();
    try { events = value.trim()?JSON.parse(value):[]; } catch { return unavailable(); }
  }
  if(events!=null&&!Array.isArray(events))return unavailable();
  let latest, invalidEta = false;
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.event !== 'eta_update') continue;
    if(typeof event.ts!=='string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(event.ts)) { invalidEta = true; continue; }
    const minutes = Number(event?.eta_minutes), at = Date.parse(event?.ts);
    if (!['number','string'].includes(typeof event.eta_minutes) || !Number.isInteger(minutes) || minutes < 1 || minutes > 240 || !Number.isFinite(at)) { invalidEta = true; continue; }
    if (!latest || at >= latest.at) latest = { at, minutes };
  }
  const server_now = new Date(now).toISOString();
  if (!latest) return { status: invalidEta ? 'unavailable' : 'missing', server_now, arrival_at: null, updated_at: null };
  // A future event is not a trustworthy clock reference.
  if (latest.at > now + 60000) return { status: 'unavailable', server_now, arrival_at: null, updated_at: null };
  const arrival = latest.at + latest.minutes * 60000;
  return { status: arrival > now ? 'active' : 'expired', server_now, arrival_at: new Date(arrival).toISOString(), updated_at: new Date(latest.at).toISOString() };
}

// Self-contained so exactly the same formatter can be embedded in both clients.
export function travelClock(eta, state, lang = 'th', now = Date.now()) {
  const messages = {
    th: { arrived: 'โมเดลถึงแล้ว', expired: 'เลยเวลาคาดการณ์ กำลังรออัปเดต', missing: 'รอโมเดลแจ้งเวลาถึง', unavailable: 'ยังอัปเดตเวลาถึงไม่ได้', prefix: 'คาดว่าจะถึงในอีก ', hour: ' ชม.', minute: ' นาที' },
    en: { arrived: 'Model has arrived', expired: 'Estimated time passed. Waiting for an update.', missing: 'Waiting for an arrival estimate', unavailable: 'Arrival estimate unavailable', prefix: 'Estimated arrival in ', hour: ' hr', minute: ' min' },
    zh: { arrived: '模特已到达', expired: '预计时间已过，等待更新', missing: '等待模特提供预计到达时间', unavailable: '暂时无法更新到达时间', prefix: '预计还有 ', hour: ' 小时', minute: ' 分钟' },
  };
  const text = messages[lang] || messages.th;
  if (state === 'arrived') return text.arrived;
  if (!['en_route', 'nearby'].includes(state)) return '';
  if (!eta || eta.status === 'missing') return text.missing;
  if (eta.status === 'unavailable' || !Number.isFinite(Date.parse(eta.arrival_at))) return text.unavailable;
  const ms = Date.parse(eta.arrival_at) - now;
  if (ms <= 0) return text.expired;
  const minutes = Math.ceil(ms / 60000), hours = Math.floor(minutes / 60), rest = minutes % 60;
  return text.prefix + (hours ? hours + text.hour + (rest ? ' ' : '') : '') + (rest || !hours ? rest + text.minute : '');
}
