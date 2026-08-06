(function(){
  'use strict';
  const root=document.querySelector('[data-control-room]');
  if(!root)return;
  const $=s=>root.querySelector(s);
  const login=root.dataset.loginRoute||'/internal/admin/login';
  const paths={auth:'/v1/admin/auth/me',stats:'/v1/admin/stats',metrics:'/v1/admin/metrics'};
  const healthPaths={admin:'/v1/admin/auth/me',knowledge:'/internal/admin/kenji-knowledge',preview:'/member/kenji-ai-20?mode=admin-preview',studio:'/studio',payments:'/v1/payments/health'};
  const set=(s,v)=>{const n=$(s);if(n)n.textContent=v==null?'—':String(v)};
  const pick=(o,keys)=>{for(const k of keys){if(o&&o[k]!=null)return o[k]}return 0};
  const next=()=>encodeURIComponent(location.pathname+location.search);
  const goLogin=()=>location.replace(login+'?next='+next());
  async function request(path,options){
    const response=await fetch(path,Object.assign({credentials:'include',headers:{accept:'application/json'}},options||{}));
    if(response.status===401||response.status===403){goLogin();throw new Error('auth');}
    let body={};try{body=await response.json()}catch(_e){}
    if(!response.ok)throw new Error(body.error||path);
    return body;
  }
  function renderIdentity(data){
    const admin=data.admin||data.user||data.identity||data;
    set('[data-admin-name]',admin.display_name||admin.name||admin.username||admin.admin_id||'Admin');
    set('[data-admin-role]',admin.role||admin.scope||'internal_admin');
    set('[data-session-note]','Secure session active');
  }
  async function checkHealth(){
    for(const [name,path] of Object.entries(healthPaths)){
      const node=$('[data-health="'+name+'"] b');
      if(!node)continue;
      try{
        const response=await fetch(path,{method:'HEAD',credentials:'include',redirect:'manual'});
        const ready=response.ok||response.status===405||response.status===302||response.type==='opaqueredirect';
        node.textContent=ready?'Ready':'Check';
        node.style.color=ready?'var(--ok)':'var(--warn)';
      }catch(_e){node.textContent='Offline';node.style.color='var(--bad)';}
    }
  }
  async function load(){
    set('[data-system-state]','กำลังเช็กระบบ');
    set('[data-system-copy]','กำลังตรวจ admin session และจุดเชื่อมหลักของ Control Room');
    try{
      const auth=await request(paths.auth);
      renderIdentity(auth);
      const results=await Promise.allSettled([request(paths.stats),request(paths.metrics)]);
      const stats=results[0].status==='fulfilled'?results[0].value:{};
      const metrics=results[1].status==='fulfilled'?results[1].value:{};
      set('[data-metric="sessions"]',pick(metrics,['sessions_today','today_sessions','sessions'])||pick(stats,['sessions_today','sessions']));
      set('[data-metric="payments"]',pick(metrics,['pending_payments','payments_pending'])||pick(stats,['pending_payments']));
      set('[data-metric="members"]',pick(metrics,['members_pending','membership_pending'])||pick(stats,['members_pending']));
      set('[data-metric="alerts"]',pick(metrics,['alerts','urgent_count'])||pick(stats,['alerts']));
      set('[data-system-state]','พร้อมใช้งาน');
      set('[data-system-copy]','ข้อมูลหลักพร้อมแล้วครับ เลือกห้องที่ต้องการทำงานต่อได้เลย');
    }catch(error){
      if(error.message!=='auth'){
        set('[data-system-state]','ข้อมูลยังไม่ครบ');
        set('[data-system-copy]','บางจุดยังตอบกลับไม่ครบ แต่ยังเปิดพื้นที่ที่ต้องใช้ต่อได้ครับ');
      }
    }
    checkHealth();
  }
  $('[data-refresh]')?.addEventListener('click',load);
  $('[data-logout]')?.addEventListener('click',async()=>{
    try{await fetch('/internal/admin/login/session',{method:'DELETE',credentials:'include'});}catch(_e){}
    goLogin();
  });
  load();
})();