const CONTROL_ROOM_V3_CSS = `
html,body{margin:0;min-height:100%;background:#040303}
.cr3,.cr3 *{box-sizing:border-box}.cr3 a{color:inherit;text-decoration:none}.cr3 button{font:inherit}
.cr3{--bg:#050405;--panel:#121016;--panel2:#1a1720;--line:rgba(255,248,235,.14);--line-gold:rgba(232,201,128,.34);--gold:#e2bf70;--gold2:#ffe2a1;--text:#fff8ee;--muted:rgba(255,248,238,.78);--muted2:rgba(255,248,238,.58);--ok:#8af2b5;--warn:#f1ce80;--bad:#ff9ca8;min-height:100vh;color:var(--text);font-family:"LINE Seed Sans TH","Noto Sans Thai","Outfit",system-ui,-apple-system,BlinkMacSystemFont,sans-serif;background:radial-gradient(circle at 74% -10%,rgba(232,201,128,.2),transparent 32%),radial-gradient(circle at 10% 18%,rgba(111,82,38,.18),transparent 30%),radial-gradient(circle at 78% 58%,rgba(232,201,128,.07),transparent 34%),linear-gradient(135deg,#040303 0%,#0b0808 34%,#050507 64%,#120d07 100%);-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
.cr3__rail{position:fixed;z-index:30;inset:0 auto 0 0;width:280px;padding:22px 17px 18px;border-right:1px solid var(--line);background:linear-gradient(180deg,rgba(10,8,10,.98),rgba(6,5,6,.96));backdrop-filter:blur(22px);display:flex;flex-direction:column;box-shadow:18px 0 50px rgba(0,0,0,.36)}
.cr3__brand{display:flex;gap:12px;align-items:center;padding:5px}.cr3__brandMark{width:46px;height:46px;border:1px solid rgba(232,201,128,.48);border-radius:15px;display:grid;place-items:center;background:linear-gradient(145deg,rgba(232,201,128,.22),rgba(255,248,235,.035));color:var(--gold2);font-weight:950;font-size:18px;box-shadow:0 0 28px rgba(232,201,128,.13)}.cr3__brand b,.cr3__brand small{display:block}.cr3__brand b{font-size:12px;letter-spacing:.1em;color:#fff6e8}.cr3__brand small{margin-top:4px;color:rgba(255,226,161,.7);font-size:8px;letter-spacing:.16em}
.cr3__nav{display:grid;gap:5px;margin-top:25px}.cr3__nav a{min-height:43px;padding:0 12px;border-radius:13px;display:flex;align-items:center;gap:11px;color:rgba(255,248,238,.7);font-size:11px;font-weight:850;transition:.18s ease}.cr3__nav a i{width:24px;color:var(--gold);font-size:8px;font-style:normal}.cr3__nav a:hover,.cr3__nav a.is-active{color:#fff8ee;background:rgba(255,248,235,.07);box-shadow:inset 3px 0 var(--gold),0 10px 28px rgba(0,0,0,.2)}
.cr3__owner{margin-top:auto;padding:14px;border:1px solid var(--line);border-radius:17px;background:rgba(255,248,235,.042)}.cr3__owner small,.cr3__owner b,.cr3__owner span{display:block}.cr3__owner small{color:var(--gold2);font-size:8px;letter-spacing:.14em}.cr3__owner b{margin-top:8px;font-size:12px;color:#fff8ee}.cr3__owner span{margin-top:5px;color:var(--muted2);font-size:9px}.cr3__logout{margin-top:9px;min-height:40px;border:1px solid var(--line);border-radius:12px;background:rgba(255,248,235,.02);color:rgba(255,248,238,.74);cursor:pointer}
.cr3__main{margin-left:280px;min-height:100vh;padding:32px 36px 44px}.cr3__top{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:end}.cr3__eyebrow{margin:0;color:var(--gold2);font-size:9px;font-weight:900;letter-spacing:.18em;text-transform:uppercase;text-shadow:0 0 24px rgba(232,201,128,.2)}.cr3 h1{margin:7px 0 0;font-size:clamp(58px,6vw,90px);line-height:.9;letter-spacing:-.058em;color:#fff9f0;text-shadow:0 18px 54px rgba(0,0,0,.72)}.cr3__lead{max-width:860px;margin:17px 0 0;color:rgba(255,248,238,.82);font-size:13px;line-height:1.78}.cr3__actions{display:flex;gap:9px;flex-wrap:wrap;justify-content:flex-end}.cr3__btn{min-height:43px;padding:0 15px;border:1px solid rgba(255,248,235,.16);border-radius:999px;background:rgba(255,248,235,.05);display:inline-flex;align-items:center;justify-content:center;color:#fff8ee;font-size:10px;font-weight:900;cursor:pointer}.cr3__btn--gold{border:0;background:linear-gradient(90deg,#b8904f,#f0cf7d);color:#17120d;box-shadow:0 13px 36px rgba(232,201,128,.18)}
.cr3__statusbar{display:flex;align-items:center;gap:8px;margin-top:20px;padding:9px 10px;border:1px solid var(--line);border-radius:14px;background:rgba(255,248,235,.035);overflow:auto}.cr3__statusbar span{white-space:nowrap;min-height:30px;padding:0 10px;border:1px solid rgba(255,248,235,.13);border-radius:999px;display:inline-flex;align-items:center;gap:7px;color:rgba(255,248,238,.75);font-size:9px;font-weight:850}.cr3__statusbar span i{width:7px;height:7px;border-radius:50%;background:var(--warn)}.cr3__statusbar span.is-ok i{background:var(--ok)}
.cr3__hero{position:relative;overflow:hidden;min-height:470px;margin-top:13px;border:1px solid rgba(232,201,128,.22);border-radius:28px;background:#090706;box-shadow:0 34px 90px rgba(0,0,0,.34)}.cr3__heroImage{position:absolute;inset:0;background:radial-gradient(circle at 72% 30%,rgba(232,201,128,.19),transparent 24%),radial-gradient(circle at 28% 70%,rgba(232,201,128,.08),transparent 26%),linear-gradient(135deg,rgba(5,4,4,.96),rgba(16,12,8,.84) 42%,rgba(5,5,8,.94)),repeating-linear-gradient(90deg,rgba(255,226,161,.075) 0 1px,transparent 1px 96px),repeating-linear-gradient(0deg,rgba(255,226,161,.055) 0 1px,transparent 1px 84px),url('https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/69e9d25e264799b7c277e309_MMD%20SIGIL%20Trans%20no%20SIGIL.png') 84% 44%/330px auto no-repeat;opacity:.96}.cr3__heroShade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(5,4,4,.97),rgba(5,4,4,.76) 50%,rgba(5,4,4,.36)),linear-gradient(180deg,rgba(5,4,4,.1),rgba(5,4,4,.82) 74%,#050405)}.cr3__heroCopy{position:absolute;z-index:2;left:36px;right:36px;bottom:35px;max-width:850px}.cr3__live{display:inline-flex;align-items:center;gap:9px;padding:9px 11px;border:1px solid rgba(138,242,181,.34);border-radius:999px;background:rgba(5,4,4,.62);backdrop-filter:blur(12px);font-size:9px;font-weight:900;color:#fff8ee}.cr3__live i{width:7px;height:7px;border-radius:50%;background:var(--ok);box-shadow:0 0 14px rgba(121,215,162,.55)}.cr3__hero h2{margin:17px 0 0;font-size:clamp(40px,4.4vw,70px);line-height:.97;letter-spacing:-.048em;color:#fff8ee;text-shadow:0 20px 52px rgba(0,0,0,.8)}.cr3__hero h2 em{font-style:normal;color:var(--gold2);text-shadow:0 0 26px rgba(232,201,128,.28)}.cr3__hero p{max-width:740px;margin:13px 0 0;color:rgba(255,248,238,.86);font-size:12px;line-height:1.72;text-shadow:0 10px 30px rgba(0,0,0,.74)}
.cr3__metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:12px}.cr3__metric{padding:17px;border:1px solid var(--line);border-radius:19px;background:linear-gradient(180deg,rgba(255,248,235,.06),rgba(255,248,235,.022)),var(--panel)}.cr3__metric span,.cr3__metric b,.cr3__metric small{display:block}.cr3__metric span{color:rgba(255,248,238,.72);font-size:9px}.cr3__metric b{margin-top:12px;font-size:34px;line-height:1;color:#fff8ee}.cr3__metric small{margin-top:7px;color:var(--muted2);font-size:8px}
.cr3__section{margin-top:12px;padding:21px;border:1px solid var(--line);border-radius:23px;background:linear-gradient(180deg,rgba(255,248,235,.045),rgba(255,248,235,.018)),var(--panel);box-shadow:0 24px 60px rgba(0,0,0,.25)}.cr3__head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.cr3__head span{color:var(--gold2);font-size:8px;font-weight:900;letter-spacing:.15em;text-transform:uppercase}.cr3__head h3{margin:6px 0 0;font-size:29px;line-height:1.08;color:#fff8ee}.cr3__head>small{color:var(--muted2);font-size:8px}
.cr3__apps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:15px}.cr3__app{min-height:190px;padding:16px;border:1px solid rgba(255,248,235,.14);border-radius:18px;background:rgba(255,248,235,.034);display:flex;flex-direction:column;transition:transform .18s ease,border-color .18s ease,background .18s ease}.cr3__app:hover{transform:translateY(-3px);border-color:rgba(232,201,128,.48);background:rgba(232,201,128,.07)}.cr3__app--prime{background:linear-gradient(145deg,rgba(232,201,128,.17),rgba(255,248,235,.03));border-color:rgba(232,201,128,.28)}.cr3__app small{color:var(--gold2);font-size:8px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.cr3__app h4{margin:16px 0 0;font-size:20px;line-height:1.05;color:#fff8ee}.cr3__app p{margin:10px 0 0;color:rgba(255,248,238,.76);font-size:10px;line-height:1.62}.cr3__app b{margin-top:auto;padding-top:16px;font-size:9px;color:#ffe2a1}
.cr3__authority{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:15px}.cr3__authority article{padding:14px;border:1px solid rgba(255,248,235,.14);border-radius:16px;background:rgba(255,248,235,.034)}.cr3__authority small{display:block;color:var(--gold2);font-size:8px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.cr3__authority b{display:block;margin-top:7px;font-size:13px;color:#fff8ee}.cr3__authority p{margin:6px 0 0;color:rgba(255,248,238,.74);font-size:9px;line-height:1.55}.cr3__authority article.is-source{border-color:rgba(138,242,181,.32);background:rgba(121,215,162,.055)}
.cr3__footer{display:flex;justify-content:space-between;gap:20px;margin-top:17px;color:var(--muted2);font-size:8px}
@media(max-width:1180px){.cr3__rail{position:relative;inset:auto;width:auto;display:grid;grid-template-columns:1fr;gap:12px;padding:14px 18px}.cr3__nav{grid-template-columns:repeat(4,minmax(0,1fr));margin-top:0}.cr3__owner,.cr3__logout{display:none}.cr3__main{margin-left:0;padding:24px}.cr3__apps,.cr3__authority{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:760px){.cr3__nav{display:flex;overflow:auto}.cr3__nav a{white-space:nowrap}.cr3__main{padding:15px 13px 30px}.cr3__top{grid-template-columns:1fr}.cr3__actions{justify-content:flex-start}.cr3 h1{font-size:52px}.cr3__hero{min-height:560px}.cr3__heroImage{background:radial-gradient(circle at 58% 18%,rgba(232,201,128,.18),transparent 28%),linear-gradient(180deg,rgba(5,4,4,.32),rgba(5,4,4,.9)),repeating-linear-gradient(90deg,rgba(255,226,161,.07) 0 1px,transparent 1px 64px),repeating-linear-gradient(0deg,rgba(255,226,161,.045) 0 1px,transparent 1px 64px),url('https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/69e9d25e264799b7c277e309_MMD%20SIGIL%20Trans%20no%20SIGIL.png') 50% 32%/240px auto no-repeat}.cr3__heroShade{background:linear-gradient(180deg,rgba(5,4,4,.16),rgba(5,4,4,.42) 40%,rgba(5,4,4,.96) 76%,#050405)}.cr3__heroCopy{left:18px;right:18px;bottom:20px}.cr3__hero h2{font-size:38px}.cr3__metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.cr3__apps,.cr3__authority{grid-template-columns:1fr}.cr3__app{min-height:170px}.cr3__footer{display:grid}}
`;

const CONTROL_ROOM_V3_BODY = `<section class="cr3" data-control-room-v3 data-login-route="/internal/admin/login">
  <aside class="cr3__rail">
    <a class="cr3__brand" href="/internal/admin/control-room">
      <span class="cr3__brandMark">S</span>
      <span><b>MMD SIGIL</b><small>SIGIL SYSTEM · V3.2</small></span>
    </a>
    <nav class="cr3__nav" aria-label="Internal admin navigation">
      <a class="is-active" href="/internal/admin/control-room"><i>01</i>Control Room</a>
      <a href="/internal/admin/jobs/create-session"><i>02</i>Create Session</a>
      <a href="/internal/admin/kenji-client-intake"><i>03</i>Kenji Intake</a>
      <a href="/internal/admin/membership-access"><i>04</i>Access</a>
      <a href="/internal/ceo/dashboard"><i>05</i>CEO</a>
      <a href="/internal/ceo/audience"><i>06</i>Audience</a>
      <a href="/internal/ceo/models"><i>07</i>Models</a>
      <a href="/male-massage/therapists/login"><i>08</i>MMS</a>
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
        <p class="cr3__eyebrow">MMD PRIVÉ · OWNER CONTROL ROOM V3 · SIGIL SYSTEM</p>
        <h1>Control Room</h1>
        <p class="cr3__lead">อัปเดตหลังบ้าน internal ทั้งชุดแล้วครับ: admin operations, CEO dashboards, Studio, Access, MMS และ Shop ถูกจัดเป็น SIGIL System map เดียวกัน หน้านี้เป็น route map ไม่ใช่ source of truth ของ payment, membership หรือ entitlement</p>
      </div>
      <div class="cr3__actions">
        <button class="cr3__btn" type="button" data-refresh>ตรวจระบบอีกครั้ง</button>
        <a class="cr3__btn cr3__btn--gold" href="/internal/admin/jobs/create-session">สร้าง Session</a>
      </div>
    </header>

    <div class="cr3__statusbar" aria-label="Current architecture locks">
      <span><i></i>Canonical Admin · mmdbkk.com</span>
      <span class="is-ok"><i></i>My MMD Entitlement Resolver · Source of Truth</span>
      <span><i></i>Telegram / Google Drive · Downstream only</span>
      <span><i></i>Public Model = Trust</span>
      <span><i></i>Private Model = Revenue Engine</span>
    </div>

    <section class="cr3__hero">
      <div class="cr3__heroImage" aria-hidden="true"></div>
      <div class="cr3__heroShade" aria-hidden="true"></div>
      <div class="cr3__heroCopy">
        <span class="cr3__live"><i></i><b data-system-state>Owner session ready</b></span>
        <h2>SIGIL System พร้อมแล้วครับ<br><em>เลือก lane ให้ถูกก่อนลงมือ</em></h2>
        <p data-system-copy>Control Room ตอนนี้รวม internal/admin และ internal/ceo เป็นแผนที่เดียว พร้อมแยก Studio, Access, MMS และ Shop services ให้เห็นชัดขึ้น</p>
      </div>
    </section>

    <section class="cr3__metrics" aria-label="Control room metrics">
      <article class="cr3__metric"><span>Admin Services</span><b>11</b><small>jobs, access, studio, knowledge</small></article>
      <article class="cr3__metric"><span>CEO Surfaces</span><b>10</b><small>dashboard, audience, models, telegram</small></article>
      <article class="cr3__metric"><span>MMS / Shop</span><b>7</b><small>therapist, booking, shop ops</small></article>
      <article class="cr3__metric"><span>System</span><b data-metric="health">—</b><small>internal route readiness</small></article>
    </section>

    <section class="cr3__section">
      <div class="cr3__head"><div><span>Internal Admin</span><h3>งานหลังบ้านหลัก</h3></div><small>internal/admin/*</small></div>
      <div class="cr3__apps">
        <a class="cr3__app cr3__app--prime" href="/internal/admin/jobs/create-session"><small>Session Operations</small><h4>Create Session</h4><p>client lineage, work lane, model, details และ create flow baseline ปัจจุบัน</p><b>เปิด Create Session →</b></a>
        <a class="cr3__app" href="/internal/admin/jobs/create-job"><small>Job Operations</small><h4>Create Job</h4><p>แปลง reviewed session เป็น actual job และออก confirmation links</p><b>เปิด Create Job →</b></a>
        <a class="cr3__app" href="/internal/admin/kenji-client-intake"><small>Client Canonical</small><h4>Kenji Client Intake</h4><p>สร้างหรือ link Airtable Client ก่อนเริ่ม Create Session</p><b>เปิด Intake →</b></a>
        <a class="cr3__app" href="/internal/admin/membership-access"><small>Access</small><h4>Access Reconciliation</h4><p>Canonical Client → Entitlement Evidence → Resolver → Expected Access → Observed State</p><b>เปิด Access →</b></a>
        <a class="cr3__app" href="/internal/admin/access/invite"><small>Admin Access</small><h4>Invite</h4><p>จัดการทางเข้า admin และ owner access โดยไม่ปนกับ member entitlement</p><b>เปิด Invite →</b></a>
        <a class="cr3__app" href="/internal/admin/kenji-knowledge"><small>Knowledge</small><h4>Kenji Knowledge</h4><p>route, flow, copy, visual memory และ decision สำคัญของ MMD</p><b>เปิด Knowledge →</b></a>
        <a class="cr3__app" href="/internal/admin/member-intelligence"><small>Members</small><h4>Member Intelligence</h4><p>พื้นที่อ่าน member signal แต่ไม่สร้าง entitlement เอง</p><b>เปิด Member Intel →</b></a>
        <a class="cr3__app" href="/internal/admin/dashboard"><small>Dashboard</small><h4>Admin Dashboard</h4><p>ภาพรวม admin legacy surface ที่ยังใช้อ้างอิงได้</p><b>เปิด Dashboard →</b></a>
      </div>
    </section>

    <section class="cr3__section">
      <div class="cr3__head"><div><span>CEO Control</span><h3>Executive surfaces ที่เพิ่มเข้ามา</h3></div><small>internal/ceo/*</small></div>
      <div class="cr3__apps">
        <a class="cr3__app cr3__app--prime" href="/internal/ceo/dashboard"><small>CEO</small><h4>CEO Dashboard</h4><p>ภาพรวม owner / executive control ก่อนลงรายละเอียด</p><b>เปิด CEO →</b></a>
        <a class="cr3__app cr3__app--prime" href="/internal/ceo/audience"><small>Audience</small><h4>Audience Intelligence</h4><p>LINE Official audience, Private Revenue Engine และ Public vs Private Model strategy</p><b>เปิด Audience →</b></a>
        <a class="cr3__app" href="/internal/ceo/models"><small>Model Assets</small><h4>Models</h4><p>แยก Public Models / Private Models และตรวจ model asset readiness</p><b>เปิด Models →</b></a>
        <a class="cr3__app" href="/internal/ceo/line-notes-import"><small>Reconcile</small><h4>Line Notes Import</h4><p>อ่าน LINE Note เพื่อหา date, price และ net ก่อน lock truth</p><b>เปิด Line Notes →</b></a>
        <a class="cr3__app" href="/internal/ceo/payment-slip-inbox"><small>Payments</small><h4>Payment Slip Inbox</h4><p>กล่องดูหลักฐานการจ่ายก่อน backend-owned verification</p><b>เปิด Inbox →</b></a>
        <a class="cr3__app" href="/internal/ceo/relink-review"><small>Identity</small><h4>Relink Review</h4><p>changed-LINE evidence review, client matching และ Per override</p><b>เปิด Relink →</b></a>
        <a class="cr3__app" href="/internal/ceo/kenji-control"><small>Kenji</small><h4>Kenji Control</h4><p>private control layer สำหรับ Kenji executive / concierge behavior</p><b>เปิด Kenji →</b></a>
        <a class="cr3__app" href="/internal/ceo/telegram-preview"><small>Telegram</small><h4>Telegram Tools</h4><p>preview, alias, migration และ HYPE briefing control</p><b>เปิด Preview →</b></a>
      </div>
    </section>

    <section class="cr3__section">
      <div class="cr3__head"><div><span>Studio / MMS / Shop</span><h3>บริการที่เพิ่มในหลังบ้าน</h3></div><small>expanded services</small></div>
      <div class="cr3__apps">
        <a class="cr3__app" href="/internal/admin/studio"><small>Studio</small><h4>Studio Home</h4><p>assistant tools, template selection และ review handoff</p><b>เปิด Studio →</b></a>
        <a class="cr3__app" href="/internal/admin/studio/upload"><small>Studio</small><h4>Upload New Model</h4><p>source photos, field, layer, RUN NUMBER และ Studio handoff</p><b>เปิด Upload →</b></a>
        <a class="cr3__app" href="/internal/admin/studio/model-preview"><small>Studio</small><h4>Model Preview</h4><p>card, RUN NUMBER, layer, target และ backend-safe preview payload</p><b>เปิด Preview →</b></a>
        <a class="cr3__app" href="/internal/admin/studio/review"><small>Studio</small><h4>Studio Review</h4><p>source checks, layer, template และ final approval notes</p><b>เปิด Review →</b></a>
        <a class="cr3__app cr3__app--prime" href="/male-massage/therapists/login"><small>MMS</small><h4>Therapist Login</h4><p>private access สำหรับ approved MMS Therapists</p><b>เปิด Login →</b></a>
        <a class="cr3__app" href="/male-massage/therapists/me"><small>MMS</small><h4>My Therapist</h4><p>จัดการ profile, rates, rules, availability และ work settings</p><b>เปิด Dashboard →</b></a>
        <a class="cr3__app" href="/apply/mms-therapist"><small>MMS</small><h4>MMS Apply</h4><p>ใบสมัคร Model Therapist / Male Massage Delivery</p><b>เปิด Apply →</b></a>
        <a class="cr3__app" href="/shop/admin/stock"><small>Shop</small><h4>Shop Ops</h4><p>stock, orders, movements, payouts และ shop reviews</p><b>เปิด Shop →</b></a>
      </div>
    </section>

    <section class="cr3__section">
      <div class="cr3__head"><div><span>Authority Map</span><h3>สิ่งที่หน้านี้ไม่ตัดสินแทน</h3></div><small>Fail closed</small></div>
      <div class="cr3__authority">
        <article class="is-source"><small>Canonical</small><b>My MMD Entitlement Resolver</b><p>เป็น source of truth ของ entitlement snapshot และ expected grants</p></article>
        <article><small>Observed state</small><b>Telegram / Google Drive</b><p>ใช้เทียบ expected grants เท่านั้น ห้ามสร้าง อนุมาน หรือขยาย entitlement</p></article>
        <article><small>Model Strategy</small><b>Public vs Private</b><p>Public Model = trust / preview / lead capture; Private Model = booking / premium revenue / recommendation</p></article>
        <article><small>Current lock</small><b>Pre-#498 worker-rendered baseline</b><p>Create Session baseline เดิมยังอยู่ ไม่ดึง adapter เก่ากลับเอง</p></article>
      </div>
    </section>

    <footer class="cr3__footer"><span>MMD SIGIL · INTERNAL OWNER CONTROL</span><span data-session-note>Secure session required · UI v3.2</span></footer>
  </main>
</section>`;

const CONTROL_ROOM_V3_JS = `(function(){
'use strict';
const root=document.querySelector('[data-control-room-v3]');
if(!root)return;
const $=s=>root.querySelector(s);
const login=root.dataset.loginRoute||'/internal/admin/login';
const paths={auth:'/v1/admin/auth/me'};
const healthPaths={admin:'/v1/admin/auth/me',create:'/internal/admin/jobs/create-session',ceo:'/internal/ceo/dashboard',audience:'/internal/ceo/audience',models:'/internal/ceo/models',access:'/internal/admin/membership-access'};
const set=(s,v)=>{const n=$(s);if(n)n.textContent=v==null?'—':String(v)};
const next=()=>encodeURIComponent(location.pathname+location.search);
const goLogin=()=>location.replace(login+'?next='+next());
async function request(path){const response=await fetch(path,{credentials:'include',headers:{accept:'application/json'},cache:'no-store'});if(response.status===401||response.status===403){goLogin();throw new Error('auth');}let body={};try{body=await response.json()}catch(_e){}if(!response.ok)throw new Error(body.error||path);return body;}
function renderIdentity(auth){const user=auth&&((auth.user&&auth.user.email)||(auth.user&&auth.user.name)||auth.email||auth.identity||auth.operator)||'Admin';const role=auth&&((auth.user&&auth.user.role)||auth.role||auth.mode)||'Secure admin session';set('[data-admin-name]',user);set('[data-admin-role]',role);set('[data-session-note]','Secure session active · UI v3.2');}
async function checkHealth(){let readyCount=0;const entries=Object.entries(healthPaths);for(const [name,path] of entries){try{const response=await fetch(path,{method:'HEAD',credentials:'include',redirect:'manual',cache:'no-store'});const ready=response.ok||response.status===405||response.status===302||response.status===303||response.type==='opaqueredirect';if(ready)readyCount++;}catch(_e){}}
set('[data-metric="health"]',readyCount+'/'+entries.length);}
async function load(){try{const auth=await request(paths.auth);renderIdentity(auth);set('[data-system-state]','Owner session ready');set('[data-system-copy]','หลังบ้าน internal/admin และ internal/ceo ถูกจัดเป็น SIGIL System map เดียวกันแล้วครับ เลือก lane ตามงานที่ต้องทำได้เลย');}catch(e){if(e&&e.message==='auth')return;set('[data-system-state]','Needs attention');set('[data-system-copy]','Admin session ผ่าน แต่บาง endpoint ยังตอบไม่ครบ กดตรวจระบบอีกครั้งได้โดยไม่เปลี่ยนสิทธิ์หรือ secret');}await checkHealth();}
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
<meta name="theme-color" content="#050405" />
<title>MMD SIGIL · Control Room V3.2</title>
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
