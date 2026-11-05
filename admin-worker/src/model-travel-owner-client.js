import { travelClock } from '../../shared/model-travel-eta.mjs';

export function mountOwnerTravel(host, clock = travelClock) {
  const node = (tag, value, parent) => {const e=document.createElement(tag);if(value)e.textContent=value;parent?.append(e);return e;};
  const heading=node('div','',host);heading.className='travel-heading';node('h2','การเดินทางและจุดนัด',heading);
  const refresh=node('button','↻',heading);refresh.type='button';refresh.setAttribute('aria-label','รีเฟรชสถานะเดินทาง');refresh.title='รีเฟรชสถานะเดินทาง';
  const status=node('p','',host);status.setAttribute('role','status');
  const rows=node('div','',host), more=node('button','ดูงานเพิ่มเติม',host);more.type='button';more.hidden=true;
  const selected=new URL(location.href).searchParams.get('session_id');
  const names={confirmed:'ยังไม่เริ่มเดินทาง',en_route:'กำลังเดินทาง',nearby:'ใกล้ถึง',arrived:'ถึงจุดนัดแล้ว',met_customer:'พบลูกค้าแล้ว'};
  let snapshot=[], timers=[], disposed=false, loading=false, fingerprint='', cursor=null, clockAt=0, receivedAt=0;
  const stamp=value => Number.isFinite(Date.parse(value))?new Date(value).toLocaleTimeString('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit'}):'—';
  function tick() {const now=clockAt+performance.now()-receivedAt;for(const [label,item] of timers)label.textContent=clock(item.eta,item.state,'th',now);}
  function render() {
    rows.replaceChildren();timers=[];
    if (!snapshot.length) node('p','ไม่มีงานที่กำลังเดินทางหรือรอเข้าพบ',rows);
    for(const item of snapshot) {
      const row=node('article','',rows);row.dataset.travelSession=item.session_id;
      node('h3',item.model_name||item.session_id,row);node('p',item.session_id+' · '+(names[item.state]||'ยังยืนยันสถานะไม่ได้'),row);
      if(item.appointment_location)node('p','สถานที่นัดเดิม: '+item.appointment_location,row);
      const eta=node('p','',row);eta.className='travel-eta';timers.push([eta,item]);
      if(item.eta.updated_at)node('p','อัปเดต ETA ล่าสุด '+stamp(item.eta.updated_at),row);
      if(item.location_alert) {
        const alert=node('div','',row);alert.className='travel-alert';alert.setAttribute('role','alert');
        node('strong','แจ้งไปผิดสถานที่',alert);node('p','อยู่ที่: '+item.location_alert.current_place,alert);
        node('p','กำลังไปสถานที่นัดเดิม: '+item.location_alert.agreed_location,alert);node('p','แจ้งเมื่อ '+stamp(item.location_alert.reported_at),alert);
      }
    }
    tick();more.hidden=!cursor;
  }
  async function load(append=false) {
    if(loading||disposed)return;loading=true;refresh.disabled=true;more.disabled=true;
    try {
      const query=new URLSearchParams();if(selected)query.set('session_id',selected);if(append&&cursor)query.set('cursor',cursor);
      const response=await fetch('/v1/admin/jobs/travel'+(query.size?'?'+query:''),{credentials:'same-origin',cache:'no-store'}), data=await response.json();
      if(!response.ok||!data.ok||!Array.isArray(data.items)||!Number.isFinite(Date.parse(data.server_now)))throw Error('unavailable');
      if(disposed)return;
      const next=append?[...snapshot,...data.items]:data.items;
      if(new Set(next.map(item=>item.session_id)).size!==next.length)throw Error('ambiguous');
      const nextFingerprint=JSON.stringify([next.map(item=>({...item,eta:{...item.eta,server_now:undefined}})),data.next_cursor]);snapshot=next;cursor=data.next_cursor;
      clockAt=Date.parse(data.server_now);receivedAt=performance.now();status.textContent='';
      if(fingerprint!==nextFingerprint){fingerprint=nextFingerprint;render();}else tick();
    } catch {
      if(!disposed){snapshot=[];fingerprint='';timers=[];cursor=null;rows.replaceChildren();more.hidden=true;status.textContent='ยังยืนยันสถานะเดินทางและ ETA ไม่ได้';}
    } finally {loading=false;if(!disposed){refresh.disabled=false;more.disabled=false;}}
  }
  refresh.onclick=()=>load();more.onclick=()=>load(true);
  const polling=setInterval(()=>{if(!document.hidden)load();},15000), ticking=setInterval(tick,1000);
  const visibility=()=>{if(!document.hidden)load();};document.addEventListener('visibilitychange',visibility);
  function destroy(){disposed=true;clearInterval(polling);clearInterval(ticking);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',destroy);}
  window.addEventListener('pagehide',destroy,{once:true});load();
  return {refresh:()=>load(),destroy};
}
