const CONTROL_ROOM_V3_CSS = `
html,body{margin:0;min-height:100%;background:#07070a}
.cr3,.cr3 *{box-sizing:border-box}
.cr3{--bg:#08080b;--panel:#111016;--panel2:#17151d;--line:rgba(255,255,255,.09);--line-gold:rgba(214,183,111,.24);--gold:#d6b76f;--gold2:#f1db9f;--text:#f7f2ea;--muted:rgba(247,242,234,.61);--muted2:rgba(247,242,234,.42);--ok:#79d7a2;--warn:#e6c371;--bad:#ea919c;min-height:100vh;color:var(--text);font-family:"LINE Seed Sans TH","Noto Sans Thai","Outfit",system-ui,-apple-system,BlinkMacSystemFont,sans-serif;background:radial-gradient(circle at 76% -8%,rgba(214,183,111,.11),transparent 32%),radial-gradient(circle at 15% 30%,rgba(107,86,48,.08),transparent 30%),var(--bg);-webkit-font-smoothing:antialiased}
.cr3 a{color:inherit;text-decoration:none}.cr3 button{font:inherit}.cr3 [hidden]{display:none!important}
.cr3__rail{position:fixed;z-index:30;inset:0 auto 0 0;width:256px;padding:22px 17px 18px;border-right:1px solid var(--line);background:rgba(8,7,11,.94);backdrop-filter:blur(22px);display:flex;flex-direction:column}
.cr3__brand{display:flex;gap:12px;align-items:center;padding:5px}.cr3__brandMark{width:46px;height:46px;border:1px solid rgba(214,183,111,.38);border-radius:15px;display:grid;place-items:center;background:linear-gradient(145deg,rgba(214,183,111,.12),rgba(255,255,255,.015));color:var(--gold2);font-weight:950;font-size:18px}.cr3__brand b,.cr3__brand small{display:block}.cr3__brand b{font-size:12px;letter-spacing:.1em}.cr3__brand small{margin-top:4px;color:var(--muted2);font-size:8px;letter-spacing:.16em}
.cr3__nav{display:grid;gap:5px;margin-top:25px}.cr3__nav a{min-height:46px;padding:0 12px;border-radius:13px;display:flex;align-items:center;gap:11px;color:var(--muted);font-size:11px;font-weight:850;transition:.18s ease}.cr3__nav a i{width:22px;color:var(--gold);font-size:8px;font-style:normal}.cr3__nav a:hover,.cr3__nav a.is-active{color:var(--text);background:rgba(255,255,255,.045);box-shadow:inset 3px 0 var(--gold)}
.cr3__owner{margin-top:auto;padding:14px;border:1px solid var(--line);border-radius:17px;background:rgba(255,255,255,.024)}.cr3__owner small,.cr3__owner b,.cr3__owner span{display:block}.cr3__owner small{color:var(--gold);font-size:8px;letter-spacing:.14em}.cr3__owner b{margin-top:8px;font-size:12px}.cr3__owner span{margin-top:5px;color:var(--muted2);font-size:9px}.cr3__logout{margin-top:9px;min-height:40px;border:1px solid var(--line);border-radius:12px;background:transparent;color:var(--muted);cursor:pointer}
.cr3__main{margin-left:256px;min-height:100vh;padding:32px 36px 44px}.cr3__top{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:end}.cr3__eyebrow{margin:0;color:var(--gold);font-size:9px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}.cr3 h1{margin:7px 0 0;font-size:clamp(58px,6vw,88px);line-height:.9;letter-spacing:-.058em}.cr3__lead{max-width:760px;margin:17px 0 0;color:var(--muted);font-size:13px;line-height:1.75}.cr3__actions{display:flex;gap:9px;flex-wrap:wrap;justify-content:flex-end}.cr3__btn{min-height:43px;padding:0 15px;border:1px solid var(--line);border-radius:999px;background:rgba(255,255,255,.025);display:inline-flex;align-items:center;justify-content:center;color:var(--text);font-size:10px;font-weight:900;cursor:pointer}.cr3__btn--gold{border:0;background:linear-gradient(90deg,#a98346,#e2c57c);color:#17120d}
.cr3__statusbar{display:flex;align-items:center;gap:8px;margin-top:20px;padding:9px 10px;border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.018);overflow:auto}.cr3__statusbar span{white-space:nowrap;min-height:30px;padding:0 10px;border:1px solid var(--line);border-radius:999px;display:inline-flex;align-items:center;gap:7px;color:var(--muted);font-size:9px;font-weight:850}.cr3__statusbar span i{width:7px;height:7px;border-radius:50%;background:var(--warn)}.cr3__statusbar span.is-ok i{background:var(--ok)}.cr3__statusbar span.is-bad i{background:var(--bad)}
.cr3__hero{position:relative;overflow:hidden;min-height:520px;margin-top:13px;border:1px solid var(--line);border-radius:28px;background:#111}.cr3__heroImage{position:absolute;inset:0;background:url('https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a6b3319bb8449fd39aa5e75_Kenji%20Control%20Room%2001.webp') 67% center/cover no-repeat}.cr3__heroShade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(7,7,10,.94),rgba(7,7,10,.56) 43%,rgba(7,7,10,.08)),linear-gradient(180deg,transparent 56%,rgba(7,7,10,.62))}.cr3__heroCopy{position:absolute;z-index:2;left:36px;bottom:35px;max-width:720px}.cr3__live{display:inline-flex;align-items:center;gap:9px;padding:9px 11px;border:1px solid rgba(255,255,255,.15);border-radius:999px;background:rgba(7,7,10,.44);backdrop-filter:blur(12px);font-size:9px;font-weight:900}.cr3__live i{width:7px;height:7px;border-radius:50%;background:var(--warn);box-shadow:0 0 14px rgba(230,195,113,.55)}.cr3__hero h2{margin:17px 0 0;font-size:clamp(42px,4.7vw,73px);line-height:.97;letter-spacing:-.048em}.cr3__hero h2 em{font-style:normal;color:var(--gold2)}.cr3__hero p{max-width:650px;margin:13px 0 0;color:rgba(247,242,234,.74);font-size:12px;line-height:1.72}
.cr3__metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:12px}.cr3__metric{padding:17px;border:1px solid var(--line);border-radius:19px;background:linear-gradient(180deg,rgba(255,255,255,.03),rgba(255,255,255,.012)),var(--panel)}.cr3__metric span,.cr3__metric b,.cr3__metric small{display:block}.cr3__metric span{color:var(--muted);font-size:9px}.cr3__metric b{margin-top:12px;font-size:36px;line-height:1}.cr3__metric small{margin-top:7px;color:var(--muted2);font-size:8px}
.cr3__grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(310px,.5fr);gap:12px;margin-top:12px;align-items:start}.cr3__panel{padding:21px;border:1px solid var(--line);border-radius:23px;background:linear-gradient(180deg,rgba(255,255,255,.027),rgba(255,255,255,.011)),var(--panel);box-shadow:0 24px 60px rgba(0,0,0,.2)}.cr3__head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.cr3__head span{color:var(--gold);font-size:8px;font-weight:900;letter-spacing:.15em;text-transform:uppercase}.cr3__head h3{margin:6px 0 0;font-size:29px;line-height:1.08}.cr3__head>small{color:var(--muted2);font-size:8px}
.cr3__apps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:15px}.cr3__app{min-height:208px;padding:17px;border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.021);display:flex;flex-direction:column;transition:transform .18s ease,border-color .18s ease,background .18s ease}.cr3__app:hover{transform:translateY(-3px);border-color:rgba(214,183,111,.36);background:rgba(214,183,111,.04)}.cr3__app--prime{background:linear-gradient(145deg,rgba(214,183,111,.13),rgba(255,255,255,.018))}.cr3__app small{color:var(--gold);font-size:8px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.cr3__app h4{margin:16px 0 0;font-size:22px;line-height:1.05}.cr3__app p{margin:10px 0 0;color:var(--muted);font-size:10px;line-height:1.62}.cr3__app b{margin-top:auto;padding-top:16px;font-size:9px}
.cr3__authority{display:grid;gap:9px;margin-top:15px}.cr3__authority article{padding:14px;border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.021)}.cr3__authority small{display:block;color:var(--gold);font-size:8px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.cr3__authority b{display:block;margin-top:7px;font-size:13px}.cr3__authority p{margin:6px 0 0;color:var(--muted);font-size:9px;line-height:1.55}.cr3__authority article.is-source{border-color:rgba(121,215,162,.24);background:rgba(121,215,162,.035)}
.cr3__health{display:grid;margin-top:14px}.cr3__health div{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid var(--line)}.cr3__health div:last-child{border-bottom:0}.cr3__health span{font-size:10px}.cr3__health b{color:var(--warn);font-size:9px}.cr3__note{margin:14px 0 0;padding:12px;border:1px solid var(--line-gold);border-radius:14px;background:rgba(214,183,111,.045);color:var(--muted);font-size:9px;line-height:1.6}
.cr3__lanes{margin-top:12px;padding:21px;border:1px solid var(--line);border-radius:23px;background:var(--panel)}.cr3__laneGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:15px}.cr3__laneGrid article{padding:16px;border:1px solid var(--line);border-radius:17px;background:rgba(255,255,255,.018)}.cr3__laneGrid b{display:block;color:var(--gold);font-size:9px}.cr3__laneGrid h4{margin:18px 0 0;font-size:16px}.cr3__laneGrid p{margin:8px 0 0;color:var(--muted);font-size:9px;line-height:1.55}.cr3__laneGrid a{display:inline-flex;margin-top:14px;color:var(--gold2);font-size:9px;font-weight:900}
.cr3__footer{display:flex;justify-content:space-between;gap:20px;margin-top:17px;color:var(--muted2);font-size:8px}
@media(max-width:1180px){.cr3__rail{position:relative;inset:auto;width:auto;display:grid;grid-template-columns:1fr auto;gap:12px;padding:14px 18px}.cr3__nav{grid-column:1/-1;grid-template-columns:repeat(4,minmax(0,1fr));margin-top:0}.cr3__owner,.cr3__logout{display:none}.cr3__main{margin-left:0;padding:24px}.cr3__grid{grid-template-columns:1fr}.cr3__apps{grid-template-columns:repeat(3,minmax(0,1fr))}.cr3__laneGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:760px){.cr3__rail{grid-template-columns:1fr}.cr3__nav{display:flex;overflow:auto}.cr3__nav a{white-space:nowrap}.cr3__main{padding:15px 13px 30px}.cr3__top{grid-template-columns:1fr}.cr3__actions{justify-content:flex-start}.cr3 h1{font-size:52px}.cr3__hero{min-height:560px}.cr3__heroImage{background-image:url('https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a6b331905f2c7eb1b58bada_Kenji%20Control%20Room%20Mob.webp');background-position:60% center}.cr3__heroShade{background:linear-gradient(180deg,rgba(7,7,10,.02),rgba(7,7,10,.12) 40%,rgba(7,7,10,.95) 76%,#08080b)}.cr3__heroCopy{left:18px;right:18px;bottom:20px}.cr3__hero h2{font-size:38px}.cr3__metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.cr3__apps,.cr3__laneGrid{grid-template-columns:1fr}.cr3__app{min-height:180px}.cr3__footer{display:grid}}
`;

const CONTROL_ROOM_V3_BODY = `<section class="cr3" data-control-room-v3 data-login-route="/internal/admin/login">
  <aside class="cr3__rail">
    <a class="cr3__brand" href="/internal/admin/control-room">
      <span class="cr3__brandMark">M</span>
      <span><b>MMD PRIVÉ</b><small>OWNER CONTROL · V3</small></span>
    </a>
    <nav class="cr3__nav" aria-label="Internal admin navigation">
      <a class="is-active" href="/internal/admin/control-room"><i>01</i>Control Room</a>
      <a href="/internal/admin/jobs/create-session"><i>02</i>Create Session</a>
      <a href="/internal/admin/kenji"><i>03</i>Kenji</a>
      <a href="/internal/admin/mms"><i>04</i>MMS</a>
      <a href="/internal/admin/studio"><i>05</i>Studio</a>
      <a href="/internal/admin/membership-access"><i>06</i>Membership</a>
      <a href="/member/kenji-ai-20?mode=admin-preview"><i>07</i>Kenji Preview</a>
    </nav>
    <div class="cr3__owner">
      <small>SECURE OWNER SESSION</small>
      <b data-admin-name>กำลังตรวจสิทธิ์</b>
      <span data-admin-role>Admin gate protected</span>
    </div>
    <button class="cr3__logout" type="button" data-logout>ออกจากระบบ</button>
  </aside>

  <main class="cr3__main">
    <header class="cr3__top">
      <div>
        <p class="cr3__eyebrow">MMD PRIVÉ · OWNER CONTROL ROOM V3</p>
        <h1>Control Room</h1>
        <p class="cr3__lead">ศูนย์กลางสำหรับดูสถานะก่อนตัดสินใจครับ งานหลักอยู่หน้าเดียว ส่วนหน้ารายละเอียดแยกไปตามหน้าที่ชัดเจน เพื่อไม่ให้ระบบสิทธิ์ งานสมาชิก และช่องทาง downstream ปะปนกัน</p>
      </div>
      <div class="cr3__actions">
        <button class="cr3__btn" type="button" data-refresh>ตรวจระบบอีกครั้ง</button>
        <a class="cr3__btn cr3__btn--gold" href="/internal/admin/jobs/create-session">สร้าง Session</a>
      </div>
    </header>

    <div class="cr3__statusbar" aria-label="Current architecture locks">
      <span><i></i>Canonical Admin · mmdbkk.com</span>
      <span class="is-ok"><i></i>Entitlement Resolver · Source of Truth</span>
      <span><i></i>Telegram / Drive · Downstream only</span>
      <span><i></i>Create Session · Current baseline</span>
    </div>

    <section class="cr3__hero">
      <div class="cr3__heroImage" aria-hidden="true"></div>
      <div class="cr3__heroShade" aria-hidden="true"></div>
      <div class="cr3__heroCopy">
        <span class="cr3__live"><i></i><b data-system-state>กำลังตรวจระบบ</b></span>
        <h2>ดูสถานะให้ชัดก่อนครับ<br><em>แล้วค่อยลงมือใน lane ที่ถูกต้อง</em></h2>
        <p data-system-copy>กำลังตรวจ admin session, operational metrics และ internal surfaces ที่ Control Room ใช้งานจริง</p>
      </div>
    </section>

    <section class="cr3__metrics" aria-label="Control room metrics">
      <article class="cr3__metric"><span>Sessions</span><b data-metric="sessions">—</b><small>งานวันนี้ / active sessions</small></article>
      <article class="cr3__metric"><span>Payments</span><b data-metric="payments">—</b><small>รายการที่ยังต้องตรวจ</small></article>
      <article class="cr3__metric"><span>Members</span><b data-metric="members">—</b><small>membership attention</small></article>
      <article class="cr3__metric"><span>System</span><b data-metric="health">—</b><small>internal surfaces ready</small></article>
    </section>

    <section class="cr3__grid">
      <div class="cr3__panel">
        <div class="cr3__head"><div><span>Primary workspace</span><h3>ไปทำงานต่อจากตรงนี้</h3></div><small>Latest routes</small></div>
        <div class="cr3__apps">
          <a class="cr3__app cr3__app--prime" href="/internal/admin/jobs/create-session"><small>Session Operations</small><h4>Create Session</h4><p>ใช้ baseline ปัจจุบันสำหรับ client lineage, work lane, model และ create flow โดยไม่ย้อน UI/runtime เก่า</p><b>เปิด Create Session →</b></a>
          <a class="cr3__app" href="/internal/admin/kenji"><small>Knowledge & QA</small><h4>Kenji Admin</h4><p>Review → QA → Publish → Audit Log ผ่าน contract และ authority ที่แยกจากหน้า public</p><b>เปิด Kenji →</b></a>
          <a class="cr3__app" href="/internal/admin/mms"><small>MMS Operations</small><h4>MMS Admin</h4><p>จัดการ therapist application และ approval lane ของ Male Massage จาก internal admin surface</p><b>เปิด MMS →</b></a>
          <a class="cr3__app" href="/internal/admin/studio"><small>Assistant Studio</small><h4>Studio</h4><p>พื้นที่ internal สำหรับ assistant tools และ workflow ที่ต้องใช้ admin session</p><b>เปิด Studio →</b></a>
          <a class="cr3__app" href="/internal/admin/membership-access"><small>Member Authority</small><h4>Membership</h4><p>ตรวจสถานะสมาชิกและ access โดยยึด canonical entitlement ไม่อนุมานสิทธิ์จาก downstream state</p><b>เปิด Membership →</b></a>
          <a class="cr3__app" href="/member/kenji-ai-20?mode=admin-preview"><small>Preview</small><h4>Kenji AI 2.0</h4><p>ดู member-facing concierge ในโหมด admin preview โดยไม่ทำให้ preview กลายเป็น source of truth</p><b>เปิด Preview →</b></a>
        </div>
      </div>

      <aside class="cr3__panel">
        <div class="cr3__head"><div><span>Authority map</span><h3>อะไรเป็นตัวตัดสิน</h3></div><small>Fail closed</small></div>
        <div class="cr3__authority">
          <article class="is-source"><small>Canonical</small><b>My MMD Entitlement Resolver</b><p>เป็น source of truth ของ entitlement snapshot และ expected grants</p></article>
          <article><small>Observed state</small><b>Telegram / Google Drive</b><p>ใช้เทียบ expected grants เท่านั้น ห้ามสร้าง อนุมาน หรือขยาย entitlement</p></article>
          <article><small>Safety</small><b>Grace / blocked / revoked</b><p>Grace ไม่สร้าง grant ใหม่ และ blocked / suspended / revoked ต้อง fail closed</p></article>
          <article><small>Curated access</small><b>VIP / SVIP / Black Card</b><p>ยังต้องผ่าน explicit allowlist หรือ review เพิ่มเติม ไม่ให้ signal กลายเป็น auto grant</p></article>
        </div>
      </aside>
    </section>

    <section class="cr3__grid">
      <div class="cr3__panel">
        <div class="cr3__head"><div><span>System health</span><h3>จุดเชื่อมที่ควรพร้อม</h3></div><small data-health-count>0 / 6 ready</small></div>
        <div class="cr3__health">
          <div data-health="admin"><span>Admin session / auth bridge</span><b>Checking</b></div>
          <div data-health="create"><span>Create Session</span><b>Checking</b></div>
          <div data-health="kenji"><span>Kenji Admin</span><b>Checking</b></div>
          <div data-health="mms"><span>MMS Admin</span><b>Checking</b></div>
          <div data-health="studio"><span>Studio</span><b>Checking</b></div>
          <div data-health="membership"><span>Membership Access</span><b>Checking</b></div>
        </div>
        <p class="cr3__note">Health check เป็นเพียงความพร้อมของ route / session surface ไม่ใช้แทน business-state verification เช่น payment, entitlement หรือ Telegram/Drive reconciliation</p>
      </div>

      <aside class="cr3__panel">
        <div class="cr3__head"><div><span>Current lock</span><h3>Baseline ตอนนี้</h3></div><small>2026.09</small></div>
        <div class="cr3__authority">
          <article><small>Control Room</small><b>Owner Desktop Identity Hub v3</b><p>หน้านี้เป็น latest owner shell หลัง admin gate</p></article>
          <article><small>Create Session</small><b>Pre-#498 worker-rendered baseline</b><p>คง baseline ปัจจุบันไว้ ไม่ดึง owner-v14 adapter กลับมาเอง</p></article>
          <article><small>Admin origin</small><b>https://mmdbkk.com</b><p>ใช้ apex เป็น canonical browser admin origin</p></article>
        </div>
      </aside>
    </section>

    <section class="cr3__lanes">
      <div class="cr3__head"><div><span>Operating lanes</span><h3>แยกหน้าที่ให้ชัด</h3></div><small>Progressive authority</small></div>
      <div class="cr3__laneGrid">
        <article><b>01 · SESSION</b><h4>Client → Model → Job</h4><p>ทำงาน session และ job โดยใช้ข้อมูล lineage / payment / model ที่ backend อนุมัติ</p><a href="/internal/admin/jobs/create-session">ไป Create Session →</a></article>
        <article><b>02 · KNOWLEDGE</b><h4>Review → QA → Publish</h4><p>Kenji content ต้องผ่าน review contract และมี audit readback ก่อน production publish</p><a href="/internal/admin/kenji">ไป Kenji Admin →</a></article>
        <article><b>03 · ENTITLEMENT</b><h4>Resolver → Expected Grants</h4><p>entitlement ตัดสินก่อน แล้วค่อย reconcile กับ Telegram / Drive observed state</p><a href="/internal/admin/membership-access">ไป Membership →</a></article>
        <article><b>04 · MMS</b><h4>Application → Approval</h4><p>Male Massage ใช้ admin lane ของตัวเอง ไม่เอา logic MMS มาปนกับ member entitlement</p><a href="/internal/admin/mms">ไป MMS Admin →</a></article>
      </div>
    </section>

    <footer class="cr3__footer"><span>MMD PRIVÉ · INTERNAL OWNER CONTROL</span><span data-session-note>Secure session required · UI v3</span></footer>
  </main>
</section>`;

const CONTROL_ROOM_V3_JS = `(function(){
'use strict';
const root=document.querySelector('[data-control-room-v3]');
if(!root)return;
const $=s=>root.querySelector(s);
const login=root.dataset.loginRoute||'/internal/admin/login';
const paths={auth:'/v1/admin/auth/me',stats:'/v1/admin/stats',metrics:'/v1/admin/metrics'};
const healthPaths={admin:'/v1/admin/auth/me',create:'/internal/admin/jobs/create-session',kenji:'/internal/admin/kenji',mms:'/internal/admin/mms',studio:'/internal/admin/studio',membership:'/internal/admin/membership-access'};
const set=(s,v)=>{const n=$(s);if(n)n.textContent=v==null?'—':String(v)};
const pick=(o,keys)=>{for(const k of keys){if(o&&o[k]!=null)return o[k]}return 0};
const next=()=>encodeURIComponent(location.pathname+location.search);
const goLogin=()=>location.replace(login+'?next='+next());
async function request(path,options){
  const response=await fetch(path,Object.assign({credentials:'include',headers:{accept:'application/json'},cache:'no-store'},options||{}));
  if(response.status===401||response.status===403){goLogin();throw new Error('auth');}
  let body={};try{body=await response.json()}catch(_e){}
  if(!response.ok)throw new Error(body.error||path);
  return body;
}
function renderIdentity(auth){
  const user=auth&&((auth.user&&auth.user.email)||(auth.user&&auth.user.name)||auth.email||auth.identity||auth.operator)||'Admin';
  const role=auth&&((auth.user&&auth.user.role)||auth.role||auth.mode)||'Secure admin session';
  set('[data-admin-name]',user);set('[data-admin-role]',role);set('[data-session-note]','Secure session active · UI v3');
}
async function checkHealth(){
  let readyCount=0;
  const entries=Object.entries(healthPaths);
  for(const [name,path] of entries){
    const row=$('[data-health="'+name+'"]');
    const node=row&&row.querySelector('b');
    if(!node)continue;
    try{
      const response=await fetch(path,{method:'HEAD',credentials:'include',redirect:'manual',cache:'no-store'});
      const ready=response.ok||response.status===405||response.status===302||response.status===303||response.type==='opaqueredirect';
      node.textContent=ready?'Ready':'Check';node.style.color=ready?'var(--ok)':'var(--warn)';
      if(ready)readyCount++;
    }catch(_e){node.textContent='Offline';node.style.color='var(--bad)';}
  }
  set('[data-health-count]',readyCount+' / '+entries.length+' ready');
  set('[data-metric="health"]',readyCount+'/'+entries.length);
}
async function load(){
  set('[data-system-state]','กำลังเช็กระบบ');
  set('[data-system-copy]','กำลังตรวจ admin session, operational metrics และ internal surfaces ที่ Control Room ใช้งานจริง');
  try{
    const auth=await request(paths.auth);renderIdentity(auth);
    const results=await Promise.allSettled([request(paths.stats),request(paths.metrics)]);
    const stats=results[0].status==='fulfilled'?results[0].value:{};
    const metrics=results[1].status==='fulfilled'?results[1].value:{};
    set('[data-metric="sessions"]',pick(metrics,['sessions_today','today_sessions','sessions'])||pick(stats,['sessions_today','sessions'])||'—');
    set('[data-metric="payments"]',pick(metrics,['pending_payments','payments_pending'])||pick(stats,['pending_payments'])||'—');
    set('[data-metric="members"]',pick(metrics,['members_pending','membership_pending'])||pick(stats,['members_pending'])||'—');
    set('[data-system-state]','Owner session ready');
    set('[data-system-copy]','Admin gate ผ่านแล้วครับ เลือก lane ด้านล่างตามงานที่ต้องทำ ระบบสิทธิ์ยังยึด canonical backend authority');
    const live=$('.cr3__live');if(live){live.style.borderColor='rgba(121,215,162,.28)';const dot=live.querySelector('i');if(dot){dot.style.background='var(--ok)';dot.style.boxShadow='0 0 14px rgba(121,215,162,.55)';}}
  }catch(e){
    if(e&&e.message==='auth')return;
    set('[data-system-state]','Needs attention');
    set('[data-system-copy]','Admin session ผ่าน แต่ metrics บางส่วนยังตอบไม่ครบ กดตรวจระบบอีกครั้งได้โดยไม่เปลี่ยนสิทธิ์หรือ secret');
  }
  await checkHealth();
}
$('[data-refresh]')?.addEventListener('click',load);
$('[data-logout]')?.addEventListener('click',async()=>{try{await fetch('/internal/admin/login/session',{method:'DELETE',credentials:'include'});}catch(_e){}goLogin();});
load();
})();`;

export function renderOwnerControlRoomV3Page(): Response {
  return new Response(`<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="robots" content="noindex,nofollow" />
<meta name="theme-color" content="#08080b" />
<title>MMD Privé · Control Room V3</title>
<style>${CONTROL_ROOM_V3_CSS}</style>
</head>
<body>
${CONTROL_ROOM_V3_BODY}
<script>${CONTROL_ROOM_V3_JS}</script>
</body>
</html>`,{
    status:200,
    headers:{
      "content-type":"text/html; charset=utf-8",
      "cache-control":"no-store, private, max-age=0",
      "x-mmd-control-room-ui":"owner-desktop-v3-latest",
      "x-mmd-control-room-authority":"canonical-backend",
    },
  });
}
