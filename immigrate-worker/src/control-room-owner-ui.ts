const CONTROL_ROOM_CSS = `html,body{margin:0;background:#07070a}.crx,.crx *{box-sizing:border-box}.crx{--bg:#08080b;--panel:#121117;--panel2:#181620;--line:rgba(255,255,255,.09);--gold:#d6b76f;--gold2:#f0d89b;--text:#f6f0e8;--muted:rgba(246,240,232,.62);--ok:#76d4a0;--warn:#e2bf6c;--bad:#e9919b;min-height:100vh;color:var(--text);background:radial-gradient(circle at 80% 0,rgba(214,183,111,.09),transparent 28%),#08080b;font-family:"LINE Seed Sans TH","Line Seed Sans TH","Noto Sans Thai","Outfit",system-ui,-apple-system,BlinkMacSystemFont,sans-serif;-webkit-font-smoothing:antialiased}.crx a{color:inherit;text-decoration:none}.crx button{font:inherit}.crx__rail{position:fixed;inset:0 auto 0 0;width:248px;padding:24px 18px 18px;border-right:1px solid var(--line);background:rgba(9,8,12,.94);backdrop-filter:blur(20px);display:flex;flex-direction:column;z-index:20}.crx__brand{display:flex;align-items:center;gap:12px;padding:6px}.crx__brandMark{width:44px;height:44px;border:1px solid rgba(214,183,111,.4);border-radius:15px;display:grid;place-items:center;color:var(--gold);font-size:20px;font-weight:800}.crx__brand b,.crx__brand small{display:block}.crx__brand b{font-size:12px;letter-spacing:.08em}.crx__brand small{margin-top:4px;color:var(--muted);font-size:8px;letter-spacing:.16em}.crx__nav{display:grid;gap:6px;margin-top:28px}.crx__nav a{min-height:48px;padding:0 13px;border-radius:13px;display:flex;align-items:center;gap:12px;color:var(--muted);font-size:12px;font-weight:800}.crx__nav a span{width:22px;color:var(--gold);font-size:8px}.crx__nav a:hover,.crx__nav a.is-active{color:var(--text);background:rgba(255,255,255,.05);box-shadow:inset 3px 0 var(--gold)}.crx__identity{margin-top:auto;padding:14px;border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.025)}.crx__identity small,.crx__identity b,.crx__identity span{display:block}.crx__identity small{color:var(--gold);font-size:8px;letter-spacing:.14em}.crx__identity b{margin-top:8px;font-size:12px}.crx__identity span{margin-top:5px;color:var(--muted);font-size:9px}.crx__logout{margin-top:10px;min-height:42px;border:1px solid var(--line);border-radius:12px;background:transparent;color:var(--muted);cursor:pointer}.crx__main{min-height:100vh;margin-left:248px;padding:34px 38px 44px}.crx__topbar{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:end}.crx__eyebrow{margin:0;color:var(--gold);font-size:9px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}.crx h1{margin:8px 0 0;font-size:clamp(56px,6vw,86px);line-height:.92;letter-spacing:-.055em}.crx__lead{max-width:760px;margin:18px 0 0;color:var(--muted);font-size:14px;line-height:1.75}.crx__topActions{display:flex;gap:9px;justify-content:flex-end}.crx__topActions button,.crx__topActions a{min-height:44px;padding:0 15px;border:1px solid var(--line);border-radius:999px;background:rgba(255,255,255,.025);display:inline-flex;align-items:center;justify-content:center;color:var(--text);font-size:10px;font-weight:900;cursor:pointer}.crx__topActions a{border:0;background:linear-gradient(90deg,#a98346,#e4c77f);color:#17120c}.crx__hero{position:relative;overflow:hidden;min-height:560px;margin-top:24px;border:1px solid var(--line);border-radius:28px;background:#111}.crx__heroImage{position:absolute;inset:0;background-image:url('https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a6b3319bb8449fd39aa5e75_Kenji%20Control%20Room%2001.webp');background-size:cover;background-position:66% center}.crx__heroShade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(7,7,10,.92),rgba(7,7,10,.5) 44%,rgba(7,7,10,.08)),linear-gradient(180deg,transparent 55%,rgba(7,7,10,.58))}.crx__heroCopy{position:absolute;z-index:2;left:36px;bottom:36px;max-width:680px}.crx__live{display:inline-flex;align-items:center;gap:9px;padding:9px 11px;border:1px solid rgba(255,255,255,.16);border-radius:999px;background:rgba(7,7,10,.45);backdrop-filter:blur(12px);font-size:9px;font-weight:900}.crx__live i{width:7px;height:7px;border-radius:50%;background:var(--warn);box-shadow:0 0 15px rgba(226,191,108,.65)}.crx__hero h2{margin:18px 0 0;font-size:clamp(42px,4.6vw,72px);line-height:.98;letter-spacing:-.045em}.crx__hero h2 em{font-style:normal;color:var(--gold2)}.crx__hero p{margin:14px 0 0;color:rgba(246,240,232,.74);font-size:13px;line-height:1.7}.crx__metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px;margin-top:14px}.crx__metrics article{padding:18px;border:1px solid var(--line);border-radius:19px;background:linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,.012)),var(--panel)}.crx__metrics span,.crx__metrics b,.crx__metrics small{display:block}.crx__metrics span{color:var(--muted);font-size:9px}.crx__metrics b{margin-top:14px;font-size:38px;line-height:1}.crx__metrics small{margin-top:8px;color:var(--muted);font-size:8px}.crx__workspace{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(310px,.55fr);gap:12px;margin-top:12px;align-items:start}.crx__panel{padding:21px;border:1px solid var(--line);border-radius:23px;background:linear-gradient(180deg,rgba(255,255,255,.028),rgba(255,255,255,.012)),var(--panel);box-shadow:0 24px 60px rgba(0,0,0,.22)}.crx__panelHead{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.crx__panelHead h3{margin:6px 0 0;font-size:30px;line-height:1.1}.crx__panelHead>span{color:var(--muted);font-size:9px}.crx__apps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:16px}.crx__app{min-height:230px;padding:18px;border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.022);display:flex;flex-direction:column;transition:.2s ease}.crx__app:hover{transform:translateY(-3px);border-color:rgba(214,183,111,.34)}.crx__app--gold{background:linear-gradient(145deg,rgba(214,183,111,.14),rgba(255,255,255,.02))}.crx__app small{color:var(--gold);font-size:8px;font-weight:900;letter-spacing:.15em}.crx__app h4{margin:18px 0 0;font-size:24px;line-height:1.05}.crx__app p{margin:12px 0 0;color:var(--muted);font-size:11px;line-height:1.65}.crx__app b{margin-top:auto;padding-top:18px;font-size:10px}.crx__health{display:grid;margin-top:15px}.crx__health div{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)}.crx__health div:last-child{border-bottom:0}.crx__health span{font-size:11px}.crx__health b{color:var(--warn);font-size:9px}.crx__note{margin:16px 0 0;padding:13px;border:1px solid rgba(214,183,111,.18);border-radius:14px;background:rgba(214,183,111,.05);color:var(--muted);font-size:10px;line-height:1.6}.crx__flow{margin-top:12px;padding:22px;border:1px solid var(--line);border-radius:23px;background:var(--panel)}.crx__steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:16px}.crx__steps article{padding:17px;border:1px solid var(--line);border-radius:17px;background:rgba(255,255,255,.02)}.crx__steps b{color:var(--gold);font-size:10px}.crx__steps h4{margin:22px 0 0;font-size:17px}.crx__steps p{margin:9px 0 0;color:var(--muted);font-size:10px;line-height:1.6}.crx__footer{display:flex;justify-content:space-between;gap:20px;margin-top:18px;color:var(--muted);font-size:8px}.crx [hidden]{display:none!important}@media(max-width:1100px){.crx__rail{position:relative;width:auto;height:auto;inset:auto;display:grid;grid-template-columns:1fr auto;gap:14px;padding:14px 18px}.crx__nav{grid-column:1/-1;grid-template-columns:repeat(3,minmax(0,1fr));margin-top:0}.crx__identity,.crx__logout{display:none}.crx__main{margin-left:0;padding:24px}.crx__workspace{grid-template-columns:1fr}.crx__apps{grid-template-columns:repeat(3,1fr)}.crx__steps{grid-template-columns:repeat(2,1fr)}}@media(max-width:767px){.crx__rail{grid-template-columns:1fr}.crx__nav{display:flex;overflow:auto}.crx__nav a{white-space:nowrap}.crx__main{padding:16px 14px 32px}.crx__topbar{grid-template-columns:1fr}.crx__topActions{justify-content:flex-start;flex-wrap:wrap}.crx h1{font-size:52px}.crx__hero{min-height:570px}.crx__heroImage{background-image:url('https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a6b331905f2c7eb1b58bada_Kenji%20Control%20Room%20Mob.webp');background-position:60% center}.crx__heroShade{background:linear-gradient(180deg,rgba(7,7,10,.02),rgba(7,7,10,.12) 40%,rgba(7,7,10,.94) 76%,#08080b)}.crx__heroCopy{left:18px;right:18px;bottom:20px}.crx__hero h2{font-size:38px}.crx__metrics{grid-template-columns:repeat(2,1fr)}.crx__apps{grid-template-columns:1fr}.crx__app{min-height:190px}.crx__steps{grid-template-columns:1fr}.crx__footer{display:grid}}`;

const CONTROL_ROOM_BODY = `<section class="crx" data-control-room data-login-route="/internal/admin/login">
  <aside class="crx__rail">
    <a class="crx__brand" href="/internal/admin/control-room">
      <span class="crx__brandMark">M</span>
      <span><b>MMD PRIVÉ</b><small>INTERNAL CONTROL</small></span>
    </a>
    <nav class="crx__nav" aria-label="Internal admin navigation">
      <a class="is-active" href="/internal/admin/control-room"><span>01</span>Control Room</a>
      <a href="/internal/admin/jobs/create-session"><span>02</span>Create Session</a>
      <a href="/internal/admin/kenji"><span>03</span>Kenji</a>
      <a href="/member/kenji-ai-20?mode=admin-preview"><span>04</span>Kenji AI 20</a>
      <a href="/internal/admin/studio"><span>05</span>Studio</a>
      <a href="/internal/admin/membership-access"><span>06</span>Membership</a>
    </nav>
    <div class="crx__identity">
      <small>SIGNED IN AS</small>
      <b data-admin-name>กำลังตรวจสิทธิ์</b>
      <span data-admin-role>Secure admin session</span>
    </div>
    <button class="crx__logout" type="button" data-logout>ออกจากระบบ</button>
  </aside>
  <main class="crx__main">
    <header class="crx__topbar">
      <div>
        <p class="crx__eyebrow">MMD PRIVÉ · OPERATOR HOME</p>
        <h1>Control Room</h1>
        <p class="crx__lead">ผมรวมของที่ต้องใช้ไว้หน้าเดียวแล้วครับ ดูงานก่อน แล้วค่อยไปแก้ความรู้ ทดลองคำตอบ หรือเปิด Studio ต่อได้เลย</p>
      </div>
      <div class="crx__topActions">
        <button type="button" data-refresh>เช็กข้อมูลอีกครั้ง</button>
        <a href="/internal/admin/jobs/create-session">สร้าง Session ใหม่</a>
      </div>
    </header>
    <section class="crx__hero">
      <div class="crx__heroImage" aria-hidden="true"></div>
      <div class="crx__heroShade" aria-hidden="true"></div>
      <div class="crx__heroCopy">
        <span class="crx__live"><i></i><b data-system-state>กำลังเช็กระบบ</b></span>
        <h2>เห็นภาพรวมก่อนครับ<br><em>แล้วค่อยเลือกว่าจะไปทำอะไรต่อ</em></h2>
        <p data-system-copy>กำลังตรวจ admin session และจุดเชื่อมหลักของ Control Room</p>
      </div>
    </section>
    <section class="crx__metrics" aria-label="Control room metrics">
      <article><span>งานวันนี้</span><b data-metric="sessions">—</b><small>Session ที่กำลังเดิน</small></article>
      <article><span>รอตรวจยอด</span><b data-metric="payments">—</b><small>Payment ที่ต้องเปิดดู</small></article>
      <article><span>สมาชิกที่รอดู</span><b data-metric="members">—</b><small>Access หรือ renewal</small></article>
      <article><span>เรื่องที่ควรระวัง</span><b data-metric="alerts">—</b><small>รายการที่ควรจัดการก่อน</small></article>
    </section>
    <section class="crx__workspace">
      <article class="crx__panel crx__panel--wide">
        <div class="crx__panelHead">
          <div><p class="crx__eyebrow">WORKSPACE</p><h3>เลือกพื้นที่ที่ต้องใช้</h3></div>
          <span>ใช้ session เดียวกันทั้งหมด</span>
        </div>
        <div class="crx__apps">
          <a class="crx__app crx__app--gold" href="/internal/admin/kenji">
            <small>KNOWLEDGE SOURCE</small><h4>Kenji</h4>
            <p>เปิดพื้นที่จัดการความรู้ Review → QA → Publish และ Audit บน route canonical ปัจจุบัน</p>
            <b>เปิด Kenji →</b>
          </a>
          <a class="crx__app" href="/member/kenji-ai-20?mode=admin-preview">
            <small>ADMIN PREVIEW</small><h4>Kenji AI 20</h4>
            <p>ทดลองมุมมองฝั่งสมาชิก เช็กคำตอบ และดูว่าควรพา user ไปหน้าไหน</p>
            <b>เปิด Preview →</b>
          </a>
          <a class="crx__app" href="/internal/admin/studio">
            <small>CREATE & REVIEW</small><h4>Studio</h4>
            <p>ค้น source, เลือก template, เตรียมงาน และส่งต่อเข้า review โดยไม่แตะ backend truth</p>
            <b>เปิด Studio →</b>
          </a>
        </div>
      </article>
      <aside class="crx__panel">
        <div class="crx__panelHead"><div><p class="crx__eyebrow">SYSTEM CHECK</p><h3>ระบบพร้อมไหม</h3></div></div>
        <div class="crx__health">
          <div data-health="admin"><span>Admin session</span><b>Checking</b></div>
          <div data-health="kenji"><span>Kenji Admin</span><b>Checking</b></div>
          <div data-health="preview"><span>Kenji AI preview</span><b>Checking</b></div>
          <div data-health="studio"><span>Studio</span><b>Checking</b></div>
          <div data-health="create"><span>Create Session</span><b>Checking</b></div>
        </div>
        <p class="crx__note">หน้าตาเป็น Control Room ที่เปอร์สร้างไว้ครับ แต่ authentication, session truth และ canonical routes ยังใช้ Worker รุ่นปัจจุบันทั้งหมด</p>
      </aside>
    </section>
    <section class="crx__flow">
      <div class="crx__panelHead"><div><p class="crx__eyebrow">SIMPLE FLOW</p><h3>ใช้สามห้องนี้ยังไง</h3></div></div>
      <div class="crx__steps">
        <article><b>01</b><h4>แก้ข้อมูล</h4><p>เข้า Kenji เมื่อความจำ route, copy หรือกติกาต้องอัปเดต</p></article>
        <article><b>02</b><h4>ทดลองคำตอบ</h4><p>เปิด Kenji AI 20 ใน admin preview เพื่อดูว่าลูกค้าจะเห็นและเข้าใจอย่างไร</p></article>
        <article><b>03</b><h4>เตรียมงาน</h4><p>ใช้ Studio สำหรับ source, template และ review handoff ก่อนนำไปใช้จริง</p></article>
        <article><b>04</b><h4>กลับมาดูผล</h4><p>กลับ Control Room เพื่อเช็กสถานะรวม ไม่ต้องเปิดหลายหน้าค้างไว้</p></article>
      </div>
    </section>
    <footer class="crx__footer">
      <span>MMD Privé Internal · Desktop-first operator surface</span>
      <span data-session-note>Secure session required</span>
    </footer>
  </main>
</section>`;

const CONTROL_ROOM_JS = `(function(){
  'use strict';
  const root=document.querySelector('[data-control-room]');
  if(!root)return;
  const $=s=>root.querySelector(s);
  const login=root.dataset.loginRoute||'/internal/admin/login';
  const paths={auth:'/v1/admin/auth/me',stats:'/v1/admin/stats',metrics:'/v1/admin/metrics'};
  const healthPaths={admin:'/v1/admin/auth/me',kenji:'/internal/admin/kenji',preview:'/member/kenji-ai-20?mode=admin-preview',studio:'/internal/admin/studio',create:'/internal/admin/jobs/create-session'};
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
        const response=await fetch(path,{method:'HEAD',credentials:'include',redirect:'manual',cache:'no-store'});
        const ready=response.ok||response.status===405||response.status===302||response.status===303||response.type==='opaqueredirect';
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
      set('[data-metric="sessions"]',pick(metrics,['sessions_today','today_sessions','sessions'])||pick(stats,['sessions_today','sessions'])||'—');
      set('[data-metric="payments"]',pick(metrics,['pending_payments','payments_pending'])||pick(stats,['pending_payments'])||'—');
      set('[data-metric="members"]',pick(metrics,['members_pending','membership_pending'])||pick(stats,['members_pending'])||'—');
      set('[data-metric="alerts"]',pick(metrics,['alerts','urgent_count'])||pick(stats,['alerts'])||'—');
      set('[data-system-state]','พร้อมใช้งาน');
      set('[data-system-copy]','ข้อมูลหลักพร้อมแล้วครับ เลือกห้องที่ต้องการทำงานต่อได้เลย');
    }catch(error){
      if(error.message!=='auth'){
        set('[data-system-state]','พร้อมใช้งาน');
        set('[data-system-copy]','Admin session พร้อมแล้วครับ ส่วน metric บางรายการจะขึ้นเมื่อ endpoint มีข้อมูล');
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
})();`;

export function renderOwnerControlRoomPage(): Response {
  return new Response(`<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="robots" content="noindex,nofollow" />
<meta name="theme-color" content="#08080b" />
<title>MMD Privé · Control Room</title>
<style>${CONTROL_ROOM_CSS}</style>
</head>
<body>
${CONTROL_ROOM_BODY}
<script>${CONTROL_ROOM_JS}</script>
</body>
</html>`, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, private, max-age=0",
      "x-mmd-control-room-ui": "owner-desktop-v2-restored",
    },
  });
}
