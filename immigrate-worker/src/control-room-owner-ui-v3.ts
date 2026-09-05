const HERO_IMAGE = "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a965447376525e3e562ba09_Boss%20and%20Kenji%20-%20Model%20Keyword%20Hero.webp";
const WALL_IMAGE = "https://cdn.prod.website-files.com/68f879d546d2f4e2ab186e90/6a56c6f3a5c0c136eb7cbd7b_Wall%20a%20Long.webp";

const CONTROL_ROOM_V3_CSS = `
:root{color-scheme:dark}
html{scroll-behavior:smooth}html,body{margin:0;min-height:100%;background:#050505}
body{overflow-x:hidden}
.cr4,.cr4 *{box-sizing:border-box}.cr4 a{color:inherit;text-decoration:none}.cr4 button{font:inherit}
.cr4{--bg:#050505;--panel:#0e0f11;--panel2:#15171a;--line:rgba(255,255,255,.105);--line2:rgba(224,190,112,.28);--gold:#dfbd72;--gold2:#ffe3a4;--text:#f8f5ef;--muted:#a9a9aa;--muted2:#76777b;--green:#87d9a6;--orange:#ebb475;--red:#ee918f;min-height:100vh;color:var(--text);font-family:"LINE Seed Sans TH","Noto Sans Thai","Noto Sans",system-ui,-apple-system,BlinkMacSystemFont,sans-serif;background:radial-gradient(circle at 84% 0,rgba(222,188,113,.09),transparent 27%),linear-gradient(180deg,#050505,#08090b 42%,#050505);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.cr4__rail{position:relative;z-index:30;padding:12px;border-bottom:1px solid var(--line);background:rgba(6,6,7,.94);backdrop-filter:blur(22px)}
.cr4__brandRow{display:flex;align-items:center;justify-content:space-between;gap:12px}.cr4__brand{display:flex;align-items:center;gap:10px;min-width:0}.cr4__brandMark{width:39px;height:39px;display:grid;place-items:center;flex:0 0 auto;border:1px solid rgba(223,189,114,.38);border-radius:13px;background:linear-gradient(145deg,rgba(223,189,114,.18),rgba(255,255,255,.02));color:var(--gold2);font-size:14px;font-weight:950}.cr4__brand b,.cr4__brand small{display:block}.cr4__brand b{font-size:11px;letter-spacing:.09em}.cr4__brand small{margin-top:3px;color:var(--muted2);font-size:8px;letter-spacing:.12em}.cr4__logout{min-height:37px;padding:0 12px;border:1px solid var(--line);border-radius:999px;background:rgba(255,255,255,.035);color:#ddd;cursor:pointer}
.cr4__nav{display:flex;gap:6px;margin-top:10px;overflow:auto;padding-bottom:2px;scrollbar-width:none}.cr4__nav::-webkit-scrollbar{display:none}.cr4__nav a{min-height:39px;padding:0 12px;display:inline-flex;align-items:center;gap:7px;flex:0 0 auto;border:1px solid transparent;border-radius:999px;color:#aaa;font-size:10px;font-weight:800;white-space:nowrap;transition:.2s ease}.cr4__nav a span{color:var(--gold);font-size:8px}.cr4__nav a:hover,.cr4__nav a.is-active{color:#fff;border-color:rgba(223,189,114,.22);background:rgba(223,189,114,.08)}
.cr4__owner{display:none}
.cr4__main{width:min(100%,1560px);margin:0 auto;padding:14px 11px 42px}
.cr4__top{padding:10px 3px 2px}.cr4__eyebrow{margin:0;color:var(--gold2);font-size:9px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}.cr4 h1{margin:8px 0 0;font-size:clamp(46px,13vw,78px);line-height:.92;letter-spacing:-.062em}.cr4__lead{max-width:880px;margin:14px 0 0;color:#c4c4c5;font-size:13px;line-height:1.7}.cr4__topActions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}.cr4__btn{min-height:43px;padding:0 15px;border:1px solid var(--line);border-radius:999px;background:rgba(255,255,255,.04);display:inline-flex;align-items:center;justify-content:center;color:#f4f1eb;font-size:10px;font-weight:900;cursor:pointer;transition:.2s ease}.cr4__btn:hover{transform:translateY(-1px);border-color:rgba(223,189,114,.34);background:rgba(223,189,114,.07)}.cr4__btn--gold{border-color:transparent;background:linear-gradient(92deg,#b9914e,#edcd80);color:#16120d}.cr4__btn--small{min-height:36px;padding:0 12px}
.cr4__statusbar{display:flex;gap:7px;margin:12px 0;overflow:auto;scrollbar-width:none}.cr4__statusbar::-webkit-scrollbar{display:none}.cr4__status{min-height:32px;padding:0 10px;display:inline-flex;align-items:center;gap:7px;flex:0 0 auto;border:1px solid var(--line);border-radius:999px;background:rgba(255,255,255,.026);color:#aeb0b3;font-size:9px;font-weight:800;white-space:nowrap}.cr4__status i{width:6px;height:6px;border-radius:50%;background:var(--orange)}.cr4__status.is-ok i{background:var(--green)}
.cr4__hero{position:relative;min-height:575px;overflow:hidden;border:1px solid rgba(223,189,114,.22);border-radius:24px;background:#080808;isolation:isolate}.cr4__heroMedia{position:absolute;inset:0;background-image:url('${HERO_IMAGE}');background-size:cover;background-position:64% center;transform:scale(1.01)}.cr4__heroShade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(4,4,4,.06),rgba(4,4,4,.20) 30%,rgba(4,4,4,.88) 72%,#050505),linear-gradient(90deg,rgba(4,4,4,.52),rgba(4,4,4,.08) 68%)}.cr4__heroCopy{position:absolute;z-index:2;left:18px;right:18px;bottom:20px}.cr4__live{display:inline-flex;align-items:center;gap:8px;min-height:31px;padding:0 10px;border:1px solid rgba(135,217,166,.3);border-radius:999px;background:rgba(5,5,5,.58);backdrop-filter:blur(14px);font-size:9px;font-weight:900}.cr4__live i{width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 14px rgba(135,217,166,.45)}.cr4__hero h2{max-width:900px;margin:15px 0 0;font-size:clamp(38px,10vw,69px);line-height:.96;letter-spacing:-.052em;text-shadow:0 16px 46px #000}.cr4__hero h2 em{font-style:normal;color:var(--gold2)}.cr4__hero p{max-width:760px;margin:12px 0 0;color:#d8d5ce;font-size:12px;line-height:1.7;text-shadow:0 8px 24px #000}.cr4__heroActions{display:flex;gap:8px;flex-wrap:wrap;margin-top:17px}
.cr4__quick{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.cr4__quick a{min-height:82px;padding:13px;border:1px solid var(--line);border-radius:17px;background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.02));transition:.2s ease}.cr4__quick a:hover{transform:translateY(-2px);border-color:rgba(223,189,114,.34)}.cr4__quick small,.cr4__quick b{display:block}.cr4__quick small{color:var(--muted2);font-size:8px;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.cr4__quick b{margin-top:8px;color:#fff;font-size:12px}.cr4__quick a.is-prime{border-color:rgba(223,189,114,.28);background:linear-gradient(145deg,rgba(223,189,114,.13),rgba(255,255,255,.025))}
.cr4__section{margin-top:10px;padding:18px 14px;border:1px solid var(--line);border-radius:22px;background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.018)),var(--panel);box-shadow:0 24px 60px rgba(0,0,0,.22)}.cr4__head{display:grid;gap:10px}.cr4__kicker{color:var(--gold2);font-size:8px;font-weight:900;letter-spacing:.15em;text-transform:uppercase}.cr4__head h3{margin:5px 0 0;font-size:28px;line-height:1.03;letter-spacing:-.04em}.cr4__head p{max-width:720px;margin:7px 0 0;color:var(--muted);font-size:11px;line-height:1.6}.cr4__headMeta{color:var(--muted2);font-size:9px}
.cr4__apps{display:grid;grid-template-columns:1fr;gap:8px;margin-top:14px}.cr4__app{position:relative;min-height:153px;padding:15px;border:1px solid var(--line);border-radius:17px;background:rgba(255,255,255,.026);display:flex;flex-direction:column;transition:.2s ease}.cr4__app:hover{transform:translateY(-2px);border-color:rgba(223,189,114,.4);background:rgba(223,189,114,.055)}.cr4__app.is-prime{border-color:rgba(223,189,114,.29);background:linear-gradient(145deg,rgba(223,189,114,.12),rgba(255,255,255,.025))}.cr4__app.is-legacy{border-style:dashed}.cr4__appTop{display:flex;align-items:center;justify-content:space-between;gap:10px}.cr4__app small{color:var(--gold2);font-size:8px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.cr4__routeState{min-height:22px;padding:0 7px;display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:999px;color:var(--muted2);font-size:7px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.cr4__routeState.is-ready{border-color:rgba(135,217,166,.25);color:#aceac1;background:rgba(135,217,166,.06)}.cr4__routeState.is-warn{border-color:rgba(238,145,143,.24);color:#ffc0bd;background:rgba(238,145,143,.06)}.cr4__app h4{margin:13px 0 0;font-size:18px;line-height:1.08;letter-spacing:-.025em}.cr4__app p{margin:8px 0 0;color:#aaa;font-size:10px;line-height:1.58}.cr4__app b{margin-top:auto;padding-top:14px;color:#f7d996;font-size:9px}.cr4__app code{display:block;margin-top:7px;color:#75777c;font-size:8px;word-break:break-all}
.cr4__wall{position:relative;min-height:440px;margin-top:10px;overflow:hidden;border:1px solid rgba(223,189,114,.2);border-radius:22px;background:#080808}.cr4__wallMedia{position:absolute;inset:0;background-image:url('${WALL_IMAGE}');background-size:cover;background-position:center;filter:saturate(.88) contrast(1.04)}.cr4__wallShade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,5,5,.18),rgba(5,5,5,.42) 42%,rgba(5,5,5,.95) 82%,#050505)}.cr4__wallCopy{position:absolute;z-index:2;left:17px;right:17px;bottom:18px}.cr4__wall h3{max-width:820px;margin:8px 0 0;font-size:clamp(31px,8vw,54px);line-height:1;letter-spacing:-.046em}.cr4__wall p{max-width:760px;margin:10px 0 0;color:#c8c7c3;font-size:11px;line-height:1.65}
.cr4__locks{display:grid;grid-template-columns:1fr;gap:8px;margin-top:10px}.cr4__lock{padding:14px;border:1px solid var(--line);border-radius:15px;background:rgba(255,255,255,.025)}.cr4__lock small,.cr4__lock b,.cr4__lock span{display:block}.cr4__lock small{color:var(--gold2);font-size:8px;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.cr4__lock b{margin-top:7px;font-size:12px}.cr4__lock span{margin-top:5px;color:var(--muted);font-size:9px;line-height:1.5}.cr4__lock.is-source{border-color:rgba(135,217,166,.23);background:rgba(135,217,166,.045)}
.cr4__details{margin-top:10px;border:1px solid var(--line);border-radius:18px;background:rgba(255,255,255,.02);overflow:hidden}.cr4__details summary{padding:15px 16px;cursor:pointer;list-style:none;font-size:11px;font-weight:850}.cr4__details summary::-webkit-details-marker{display:none}.cr4__details summary::after{content:'+';float:right;color:var(--gold2)}.cr4__details[open] summary::after{content:'−'}.cr4__detailsBody{padding:0 14px 14px;color:#9a9b9e;font-size:10px;line-height:1.65}
.cr4__audit{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:10px;padding:13px;border:1px solid var(--line);border-radius:17px;background:rgba(255,255,255,.027)}.cr4__audit b,.cr4__audit span{display:block}.cr4__audit b{font-size:11px}.cr4__audit span{margin-top:4px;color:var(--muted2);font-size:9px}.cr4__auditResult{color:var(--gold2);font-size:10px;font-weight:900}
.cr4__footer{display:grid;gap:4px;margin-top:18px;padding:0 4px;color:#67686b;font-size:8px}
.cr4__reveal{opacity:0;transform:translateY(14px);transition:opacity .65s cubic-bezier(.2,.8,.2,1),transform .65s cubic-bezier(.2,.8,.2,1)}.cr4__reveal.is-in{opacity:1;transform:none}
@media(min-width:580px){.cr4__quick{grid-template-columns:repeat(3,1fr)}.cr4__apps{grid-template-columns:repeat(2,minmax(0,1fr))}.cr4__locks{grid-template-columns:repeat(2,minmax(0,1fr))}.cr4__section{padding:20px}.cr4__head{grid-template-columns:minmax(0,1fr) auto;align-items:start}.cr4__headMeta{text-align:right}}
@media(min-width:900px){.cr4__main{padding:22px 24px 50px}.cr4__hero{min-height:560px}.cr4__heroMedia{background-position:72% center}.cr4__heroShade{background:linear-gradient(90deg,rgba(4,4,4,.9),rgba(4,4,4,.38) 52%,rgba(4,4,4,.12)),linear-gradient(180deg,rgba(4,4,4,.06),rgba(4,4,4,.22) 58%,rgba(4,4,4,.88))}.cr4__heroCopy{left:34px;right:34px;bottom:32px;max-width:880px}.cr4__quick{grid-template-columns:repeat(6,1fr)}.cr4__apps{grid-template-columns:repeat(3,minmax(0,1fr))}.cr4__locks{grid-template-columns:repeat(3,minmax(0,1fr))}.cr4__wall{min-height:500px}.cr4__wallCopy{left:32px;right:32px;bottom:30px}.cr4__top{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:end}.cr4__topActions{margin:0;justify-content:flex-end}}
@media(min-width:1200px){.cr4{padding-left:250px}.cr4__rail{position:fixed;inset:0 auto 0 0;width:250px;padding:19px 14px;border-right:1px solid var(--line);border-bottom:0;display:flex;flex-direction:column}.cr4__brandRow{display:block}.cr4__logout{width:100%;margin-top:12px}.cr4__nav{display:grid;gap:5px;margin-top:24px;overflow:visible}.cr4__nav a{width:100%;border-radius:12px;justify-content:flex-start}.cr4__owner{display:block;margin-top:auto;padding:13px;border:1px solid var(--line);border-radius:15px;background:rgba(255,255,255,.025)}.cr4__owner small,.cr4__owner b,.cr4__owner span{display:block}.cr4__owner small{color:var(--gold2);font-size:7px;letter-spacing:.13em}.cr4__owner b{margin-top:7px;font-size:11px}.cr4__owner span{margin-top:4px;color:var(--muted2);font-size:8px}.cr4__main{padding:28px 30px 54px}.cr4__apps{grid-template-columns:repeat(4,minmax(0,1fr))}.cr4__locks{grid-template-columns:repeat(6,minmax(0,1fr))}}
@media(min-width:1500px){.cr4__apps{grid-template-columns:repeat(5,minmax(0,1fr))}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.cr4__reveal,.cr4__app,.cr4__btn,.cr4__quick a{transition:none!important}.cr4__reveal{opacity:1;transform:none}}
`;

const app = (route: string, area: string, title: string, copy: string, label = "เปิด →", cls = "") => `
<a class="cr4__app ${cls}" href="${route}" data-cta-route="${route}">
  <div class="cr4__appTop"><small>${area}</small><span class="cr4__routeState" data-route-state>verified</span></div>
  <h4>${title}</h4><p>${copy}</p><code>${route}</code><b>${label}</b>
</a>`;

const CONTROL_ROOM_V3_BODY = `<section class="cr4" data-control-room-v3 data-login-route="/internal/admin/login">
  <aside class="cr4__rail">
    <div class="cr4__brandRow">
      <a class="cr4__brand" href="/internal/admin/control-room" data-cta-route="/internal/admin/control-room"><span class="cr4__brandMark">S</span><span><b>MMD SIGIL</b><small>OWNER CONTROL · V4</small></span></a>
      <button class="cr4__logout" type="button" data-logout>ออกจากระบบ</button>
    </div>
    <nav class="cr4__nav" aria-label="Internal admin navigation">
      <a class="is-active" href="/internal/admin/control-room" data-cta-route="/internal/admin/control-room"><span>01</span>Control Room</a>
      <a href="/internal/admin/jobs/create-session" data-cta-route="/internal/admin/jobs/create-session"><span>02</span>Session</a>
      <a href="/internal/admin/payments" data-cta-route="/internal/admin/payments"><span>03</span>Payments</a>
      <a href="/internal/admin/kenji" data-cta-route="/internal/admin/kenji"><span>04</span>Kenji</a>
      <a href="/internal/admin/membership-access" data-cta-route="/internal/admin/membership-access"><span>05</span>Access</a>
      <a href="/internal/admin/mms" data-cta-route="/internal/admin/mms"><span>06</span>MMS</a>
      <a href="/internal/admin/studio" data-cta-route="/internal/admin/studio"><span>07</span>Studio</a>
      <a href="/internal/ceo/dashboard" data-cta-route="/internal/ceo/dashboard"><span>08</span>CEO</a>
    </nav>
    <div class="cr4__owner"><small>SECURE OWNER SESSION</small><b data-admin-name>กำลังตรวจสิทธิ์</b><span data-admin-role>Worker auth protected</span></div>
  </aside>

  <main class="cr4__main">
    <header class="cr4__top cr4__reveal">
      <div><p class="cr4__eyebrow">MMD PRIVÉ · OWNER CONTROL ROOM · 05 SEP 2026</p><h1>Control Room</h1><p class="cr4__lead">เปิดหลังบ้านจากงานที่ต้องทำ ไม่ต้องจำว่าระบบไหนอยู่ที่ไหนครับ — หน้านี้เป็นแผนที่เข้าเครื่องมือเท่านั้น ส่วน payment, entitlement, access และ session truth ยังอยู่กับ backend owner ของแต่ละระบบเหมือนเดิม</p></div>
      <div class="cr4__topActions"><button class="cr4__btn" type="button" data-refresh>ตรวจระบบ</button><button class="cr4__btn" type="button" data-audit-cta>ตรวจ CTA ทั้งหน้า</button><a class="cr4__btn cr4__btn--gold" href="/internal/admin/jobs/create-session" data-cta-route="/internal/admin/jobs/create-session">สร้าง Session</a></div>
    </header>

    <div class="cr4__statusbar cr4__reveal" aria-label="Current architecture locks">
      <span class="cr4__status is-ok"><i></i>GitHub · Source</span><span class="cr4__status is-ok"><i></i>Workers · Runtime</span><span class="cr4__status"><i></i>Webflow · Presentation</span><span class="cr4__status is-ok"><i></i>payments-worker · Money Truth</span><span class="cr4__status is-ok"><i></i>Entitlement Resolver · Access Truth</span><span class="cr4__status"><i></i>Telegram / Drive · Observed only</span>
    </div>

    <section class="cr4__hero cr4__reveal">
      <div class="cr4__heroMedia" role="img" aria-label="Boss Per and Kenji in the MMD control environment"></div><div class="cr4__heroShade"></div>
      <div class="cr4__heroCopy"><span class="cr4__live"><i></i><span data-system-state>Checking owner session</span></span><h2>งานทั้งหมดอยู่ตรงนี้<br><em>เลือก lane แล้วไปต่อ</em></h2><p data-system-copy>Control Room จัด route ล่าสุดของ Admin, Payments, Kenji, Access, CEO, Studio, MMS, Model และ Shop ไว้เป็นแผนเดียวกันครับ</p><div class="cr4__heroActions"><a class="cr4__btn cr4__btn--gold" href="#daily">งานประจำวันนี้</a><a class="cr4__btn" href="/internal/admin/payments/historical-backfill" data-cta-route="/internal/admin/payments/historical-backfill">Slip Backfill</a><a class="cr4__btn" href="/internal/admin/mms" data-cta-route="/internal/admin/mms">MMS Admin</a></div></div>
    </section>

    <div class="cr4__quick cr4__reveal" aria-label="Quick access">
      <a class="is-prime" href="/internal/admin/jobs/create-session" data-cta-route="/internal/admin/jobs/create-session"><small>Daily Ops</small><b>Create Session</b></a>
      <a class="is-prime" href="/internal/admin/payments" data-cta-route="/internal/admin/payments"><small>Money</small><b>Payment Review</b></a>
      <a href="/internal/admin/kenji" data-cta-route="/internal/admin/kenji"><small>Concierge</small><b>Kenji Control</b></a>
      <a href="/internal/admin/membership-access" data-cta-route="/internal/admin/membership-access"><small>Entitlement</small><b>Access Reconcile</b></a>
      <a href="/internal/admin/mms" data-cta-route="/internal/admin/mms"><small>Male Massage</small><b>MMS Admin</b></a>
      <a href="/internal/admin/studio" data-cta-route="/internal/admin/studio"><small>Creative</small><b>Studio</b></a>
    </div>

    <section class="cr4__section cr4__reveal" id="daily">
      <div class="cr4__head"><div><span class="cr4__kicker">01 · DAILY OPERATIONS</span><h3>เริ่มจากงานที่ต้องทำวันนี้</h3><p>Client → Session → Job → Payment Proof → Review ถูกแยก authority ชัดเจน เพื่อไม่ให้ UI หนึ่งหน้ากลายเป็นคนตัดสินทุกอย่างแทน backend</p></div><div class="cr4__headMeta">core operator flow</div></div>
      <div class="cr4__apps">
        ${app("/internal/admin/kenji-client-intake","Client Canonical","Kenji Client Intake","สร้างหรือ link Airtable Client ให้เรียบร้อยก่อนเริ่ม session","เปิด Intake →","is-prime")}
        ${app("/internal/admin/jobs/create-session","Session Ops","Create Session","Public / Private lane, model, details และ review ก่อนสร้าง session","เปิด Session →","is-prime")}
        ${app("/internal/admin/jobs/create-job","Job Ops","Create Job","เปลี่ยน reviewed session เป็น actual job พร้อม confirmation handoff")}
        ${app("/internal/admin/payments","Payment Evidence","Payment Review","ตรวจ Payment Proof และ match context; frontend ไม่สร้าง Money Truth","เปิด Payments →","is-prime")}
        ${app("/internal/admin/payments/historical-backfill","Historical Evidence","Historical Slip Backfill","LINE Album / archive → SHA-256 → QR/OCR → pending → review → payments-worker","เปิด Backfill →","is-prime")}
        ${app("/internal/admin/membership-access","Entitlement","Access Reconciliation","Canonical Client → Evidence → Resolver → Expected → Observed → Add / Remove / Review")}
      </div>
    </section>

    <section class="cr4__section cr4__reveal" id="kenji">
      <div class="cr4__head"><div><span class="cr4__kicker">02 · KENJI / MEMBER INTELLIGENCE</span><h3>Kenji ช่วยพาไปต่อ ไม่เป็น final authority</h3><p>แยก Concierge behavior, knowledge, member signals และ access review ออกจากกัน เพื่อให้สิ่งที่ Kenji แนะนำไม่ถูกตีความเป็นสิทธิ์ที่อนุมัติแล้ว</p></div><div class="cr4__headMeta">concierge + knowledge</div></div>
      <div class="cr4__apps">
        ${app("/internal/admin/kenji","Kenji 2.0","Kenji Control Centre","Overview, Models, Knowledge Sets, QA Review, Publish, Audit และ Settings","เปิด Kenji →","is-prime")}
        ${app("/internal/admin/kenji-knowledge","Knowledge","Kenji Knowledge","route, flow, copy, visual memory และ decision สำคัญของ MMD")}
        ${app("/internal/admin/member-intelligence","Members","Member Intelligence","อ่าน member signal และ history โดยไม่สร้าง entitlement เอง")}
        ${app("/internal/admin/access/invite","Admin Access","Invite","owner/admin access lane แยกจาก member entitlement")}
        ${app("/internal/admin/dashboard","Reference","Admin Dashboard","legacy/reference surface ที่ยังเปิดใช้อ้างอิงได้","เปิด Dashboard →","is-legacy")}
      </div>
    </section>

    <section class="cr4__section cr4__reveal" id="ceo">
      <div class="cr4__head"><div><span class="cr4__kicker">03 · CEO CONTROL</span><h3>ภาพรวมก่อนลงรายละเอียด</h3><p>Executive surfaces สำหรับ audience, models, LINE notes, identity review และ Telegram operations — เก็บไว้ใน lane เดียวเพื่อไม่ปนกับ daily admin work</p></div><div class="cr4__headMeta">internal/ceo/*</div></div>
      <div class="cr4__apps">
        ${app("/internal/ceo/dashboard","CEO","CEO Dashboard","ภาพรวม owner / executive control ก่อนลงรายละเอียด","เปิด CEO →","is-prime")}
        ${app("/internal/ceo/audience","Audience","Audience Intelligence","LINE Official signals, Private Revenue Engine และ Public vs Private strategy","เปิด Audience →","is-prime")}
        ${app("/internal/ceo/models","Model Assets","Models","Public / Private model asset readiness และ model strategy")}
        ${app("/internal/ceo/line-notes-import","Reconcile","LINE Notes Import","อ่าน LINE Note เพื่อหา date, price และ net ก่อน lock truth")}
        ${app("/internal/ceo/payment-slip-inbox","Legacy Evidence","Payment Slip Inbox","inbox เดิมสำหรับอ้างอิงหลักฐาน; canonical review ใช้ Payments lane","เปิด Inbox →","is-legacy")}
        ${app("/internal/ceo/relink-review","Identity","Relink Review","changed-LINE evidence, Client matching, Per review และ audit")}
        ${app("/internal/ceo/kenji-control","Kenji Executive","Kenji CEO Control","private executive layer สำหรับ Kenji behavior")}
        ${app("/internal/ceo/telegram-preview","Telegram","Telegram Preview","preview และตรวจ downstream Telegram surface โดยไม่สร้าง entitlement")}
      </div>
    </section>

    <section class="cr4__section cr4__reveal" id="studio">
      <div class="cr4__head"><div><span class="cr4__kicker">04 · STUDIO</span><h3>Creative operations แบบมี handoff</h3><p>Source → Preview → Review → Final approval แยกจาก production truth; Care Back operator surface อยู่ใน Studio lane ด้วย</p></div><div class="cr4__headMeta">internal/admin/studio/*</div></div>
      <div class="cr4__apps">
        ${app("/internal/admin/studio","Studio","Studio Home","assistant tools, template selection และ review handoff","เปิด Studio →","is-prime")}
        ${app("/internal/admin/studio/upload","Studio Intake","Upload New Model","source photos, field, layer, RUN NUMBER และ intake")}
        ${app("/internal/admin/studio/model-preview","Studio Preview","Model Preview","card, RUN NUMBER, target และ backend-safe preview payload")}
        ${app("/internal/admin/studio/review","Studio Review","Review","source checks, layer, template และ final approval notes")}
        ${app("/internal/admin/studio/care-back","Campaign Ops","CARE BACK","operator surface สำหรับ 6 Years CARE BACK workflow")}
      </div>
    </section>

    <section class="cr4__section cr4__reveal" id="mms">
      <div class="cr4__head"><div><span class="cr4__kicker">05 · MMS / MALE MASSAGE</span><h3>Admin, Therapist และ customer flow แยกกัน</h3><p>หลังบ้าน MMS ใช้ canonical `/internal/admin/mms`; Therapist self-service, recruitment และ customer booking เป็นคนละ surface เพื่อไม่ให้ role ปนกัน</p></div><div class="cr4__headMeta">MMS · managed by Per</div></div>
      <div class="cr4__apps">
        ${app("/internal/admin/mms","MMS Admin","MMS Operations","applications, therapist records, jobs และ admin actions ผ่าน Worker-owned surface","เปิด MMS Admin →","is-prime")}
        ${app("/male-massage/therapists/me","Therapist","My Therapist","approved therapist dashboard สำหรับ profile, rates, rules และ availability")}
        ${app("/apply/mms-therapist","Recruitment","Therapist Application","สมัคร Freelance Therapist / Male Massage Delivery")}
        ${app("/apply/mms-therapist-rules","Rules","Therapist Rules","กติกาการรับงาน, brief, safety, travel, payment และ close job")}
        ${app("/male-massage/member/mms-booking","Booking","MMS Pre-booking","service, date, time, area และ therapist preference ก่อน MMS confirm")}
        ${app("/male-massage/how-to-use","Service Guide","How to use MMS","customer-facing service flow และ payment expectation")}
      </div>
    </section>

    <section class="cr4__section cr4__reveal" id="models">
      <div class="cr4__head"><div><span class="cr4__kicker">06 · MODEL OPERATIONS</span><h3>Model surface ที่ใช้งานจริงตอนนี้</h3><p>Operator view, Model Console และ Model Dashboard แยกจาก application / onboarding ให้เห็นชัดว่าอันไหนเป็นหลังบ้านและอันไหนเป็น self-service</p></div><div class="cr4__headMeta">SIGIL Model</div></div>
      <div class="cr4__apps">
        ${app("/internal/ceo/models","Operator Models","CEO Models","ภาพรวม model assets และ Public / Private readiness","เปิด Models →","is-prime")}
        ${app("/sigil/model/console","Model Console","SIGIL Model Console","operator-friendly console สำหรับ model workflow ปัจจุบัน","เปิด Console →","is-prime")}
        ${app("/sigil/model/dashboard","Model Self-service","Model Dashboard","model profile, work information และ dashboard handoff")}
        ${app("/apply/public-model","Recruitment","Public Model Apply","public model application entry")}
        ${app("/apply/public-model/onboarding","Onboarding","Public Model Onboarding","ขั้นตอน onboarding หลัง application")}
        ${app("/rules/model","Rules","Private Model Rules","privacy, conduct, payment clarity และ Boss Per review")}
      </div>
    </section>

    <section class="cr4__section cr4__reveal" id="shop">
      <div class="cr4__head"><div><span class="cr4__kicker">07 · SHOP OPERATIONS</span><h3>Stock → Order → Movement → Payout → Review</h3><p>Shop tools อยู่ lane เดียวกันเพื่อไม่ต้องกระโดดหาหน้าแยกตามงาน</p></div><div class="cr4__headMeta">shop/admin/*</div></div>
      <div class="cr4__apps">
        ${app("/shop/admin/stock","Inventory","Stock","stock summary และ refill signals","เปิด Stock →","is-prime")}
        ${app("/shop/admin/orders","Orders","Orders","order operations และ fulfillment reference")}
        ${app("/shop/admin/movements","Inventory","Movements","stock movement history และ operational adjustments")}
        ${app("/shop/admin/payouts","Money","Payouts","shop payout surface แยกจาก MMD service payments")}
        ${app("/shop/admin/shop-reviews","Reviews","Shop Reviews","review queue และ safe public summary workflow")}
      </div>
    </section>

    <section class="cr4__wall cr4__reveal" id="system-map">
      <div class="cr4__wallMedia" role="img" aria-label="MMD architecture wall"></div><div class="cr4__wallShade"></div><div class="cr4__wallCopy"><span class="cr4__kicker">08 · SYSTEM MAP</span><h3>หน้าเดียวเห็นทางเข้า<br>แต่ไม่รวม authority เข้าด้วยกัน</h3><p>Control Room ทำหน้าที่เหมือนแผนผังบนผนังครับ: ชี้ว่าไปทางไหน แต่ไม่เปลี่ยน payment, entitlement, membership หรือ session truth จากตรงนี้</p></div>
    </section>

    <section class="cr4__section cr4__reveal" id="system">
      <div class="cr4__head"><div><span class="cr4__kicker">09 · SYSTEM / GOVERNANCE</span><h3>เครื่องมืออ้างอิงและ authority locks</h3><p>สำหรับ route map, protocol และ admin reference ที่ไม่ควรปนอยู่กับ daily work</p></div><div class="cr4__headMeta">fail closed</div></div>
      <div class="cr4__apps">
        ${app("/internal/admin/control-room/protocol","Protocol","Protocol Center","ดู canonical protocol / route handoff ของ Control Room","เปิด Protocol →","is-prime")}
        ${app("/internal/admin/console","Admin","Admin Console","reference console สำหรับ internal admin")}
        ${app("/internal/admin/sitemap","Routes","Internal Sitemap","แผนที่หน้า internal ที่มีอยู่ใน Webflow")}
        ${app("/internal/admin/owner/setup","Owner","Owner Setup","owner setup surface; ไม่ใช้แทน canonical auth")}
        ${app("/internal/admin/dashboard","Reference","Admin Dashboard","legacy/reference dashboard ที่ยังเปิดได้","เปิด Dashboard →","is-legacy")}
      </div>
      <div class="cr4__locks">
        <article class="cr4__lock is-source"><small>Code Source</small><b>GitHub</b><span>behavior / contract source of truth</span></article>
        <article class="cr4__lock is-source"><small>Runtime</small><b>Cloudflare Workers</b><span>auth, route owner และ backend decisions</span></article>
        <article class="cr4__lock"><small>Presentation</small><b>Webflow</b><span>UI / content surface ไม่เป็น auth authority</span></article>
        <article class="cr4__lock is-source"><small>Money Truth</small><b>payments-worker</b><span>paid / verified / downstream money actions</span></article>
        <article class="cr4__lock is-source"><small>Entitlement Truth</small><b>my_mmd_entitlement_resolver_v1</b><span>expected grants และ fail-closed entitlement</span></article>
        <article class="cr4__lock"><small>Observed State</small><b>Telegram / Drive</b><span>เทียบ expected state เท่านั้น ไม่สร้างสิทธิ์</span></article>
      </div>
      <details class="cr4__details"><summary>Safety locks ที่ต้องจำ</summary><div class="cr4__detailsBody">Historical slip / QR / OCR เป็น evidence เท่านั้น · Webflow ไม่ mark paid · Access Reconciliation ไม่ grant entitlement จาก browser · Grace ไม่สร้าง protected grant ใหม่ · blocked / suspended / revoked fail closed · VIP / SVIP / Black Card ยังต้องผ่าน explicit allowlist / review เพิ่มเติม</div></details>
      <div class="cr4__audit"><div><b>CTA Route Audit</b><span>กดเพื่อตรวจทุก route CTA บนหน้านี้ด้วย HEAD request ภายใต้ admin session ปัจจุบัน</span></div><div><button class="cr4__btn cr4__btn--small" type="button" data-audit-cta>ตรวจ CTA ทั้งหน้า</button><div class="cr4__auditResult" data-audit-result>ยังไม่ได้ตรวจสด</div></div></div>
    </section>

    <footer class="cr4__footer"><span>MMD SIGIL · INTERNAL OWNER CONTROL · UI V4</span><span data-session-note>Secure session required · Worker-owned route</span></footer>
  </main>
</section>`;

const CONTROL_ROOM_V3_JS = `(function(){
'use strict';
const root=document.querySelector('[data-control-room-v3]');
if(!root)return;
const $=s=>root.querySelector(s);
const $$=s=>Array.from(root.querySelectorAll(s));
const login=root.dataset.loginRoute||'/internal/admin/login';
const paths={auth:'/v1/admin/auth/me'};
const healthPaths=['/v1/admin/auth/me','/internal/admin/jobs/create-session','/internal/admin/payments','/internal/admin/kenji','/internal/admin/membership-access','/internal/admin/mms','/internal/admin/studio','/internal/ceo/dashboard'];
const set=(s,v)=>{const n=$(s);if(n)n.textContent=v==null?'—':String(v)};
const next=()=>encodeURIComponent(location.pathname+location.search);
const goLogin=()=>location.replace(login+'?next='+next());
async function request(path){const response=await fetch(path,{credentials:'include',headers:{accept:'application/json'},cache:'no-store'});if(response.status===401||response.status===403){goLogin();throw new Error('auth');}let body={};try{body=await response.json()}catch(_e){}if(!response.ok)throw new Error(body.error||path);return body;}
function renderIdentity(auth){const user=auth&&((auth.user&&auth.user.email)||(auth.user&&auth.user.name)||auth.email||auth.identity||auth.operator)||'Admin';const role=auth&&((auth.user&&auth.user.role)||auth.role||auth.mode)||'Secure admin session';set('[data-admin-name]',user);set('[data-admin-role]',role);set('[data-session-note]','Secure session active · UI V4');}
function routeReady(response){return response.ok||response.status===301||response.status===302||response.status===303||response.status===307||response.status===308||response.status===405||response.type==='opaqueredirect';}
async function checkHealth(){let ready=0;for(const path of healthPaths){try{const response=await fetch(path,{method:'HEAD',credentials:'include',redirect:'manual',cache:'no-store'});if(routeReady(response))ready++;}catch(_e){}}set('[data-system-state]',ready===healthPaths.length?'Owner system ready':'System '+ready+'/'+healthPaths.length);}
function uniqueRoutes(){return Array.from(new Set($$('[data-cta-route]').map(a=>a.getAttribute('data-cta-route')).filter(Boolean)));}
function paintRoute(route,ok){$$('[data-cta-route="'+CSS.escape(route)+'"] [data-route-state]').forEach(n=>{n.textContent=ok?'ready':'check';n.classList.toggle('is-ready',ok);n.classList.toggle('is-warn',!ok);});}
async function auditCtas(){const buttons=$$('[data-audit-cta]');buttons.forEach(b=>{b.disabled=true;b.textContent='กำลังตรวจ…'});const routes=uniqueRoutes();let ready=0;for(const route of routes){let ok=false;try{const response=await fetch(route,{method:'HEAD',credentials:'include',redirect:'manual',cache:'no-store'});ok=routeReady(response);}catch(_e){}paintRoute(route,ok);if(ok)ready++;}set('[data-audit-result]',ready+'/'+routes.length+' routes ready');buttons.forEach(b=>{b.disabled=false;b.textContent='ตรวจ CTA ทั้งหน้า'});return {ready,total:routes.length};}
async function load(){try{const auth=await request(paths.auth);renderIdentity(auth);set('[data-system-copy]','Admin session พร้อมครับ เลือก lane ตามงานที่ต้องทำได้เลย — route สำคัญถูกย้ายไป canonical ล่าสุดแล้ว');}catch(e){if(e&&e.message==='auth')return;set('[data-system-state]','Needs attention');set('[data-system-copy]','Admin session ผ่าน แต่บาง endpoint ยังตอบไม่ครบ กดตรวจระบบอีกครั้งได้โดยไม่เปลี่ยนสิทธิ์หรือ secret');}await checkHealth();}
$$('[data-refresh]').forEach(b=>b.addEventListener('click',load));
$$('[data-audit-cta]').forEach(b=>b.addEventListener('click',auditCtas));
$('[data-logout]')?.addEventListener('click',async()=>{try{await fetch('/internal/admin/login/session',{method:'DELETE',credentials:'include'});}catch(_e){}goLogin();});
const reveals=$$('.cr4__reveal');if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-in');observer.unobserve(entry.target);}})},{threshold:.08});reveals.forEach(el=>observer.observe(el));}else{reveals.forEach(el=>el.classList.add('is-in'));}
load();
})();`;

export function renderOwnerControlRoomV3Page(): Response {
  return new Response(`<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="robots" content="noindex,nofollow" />
<meta name="theme-color" content="#050505" />
<title>MMD SIGIL · Owner Control Room V4</title>
<style>${CONTROL_ROOM_V3_CSS}</style>
</head>
<body>
${CONTROL_ROOM_V3_BODY}
<script>${CONTROL_ROOM_V3_JS}</script>
</body>
</html>`, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate",
      pragma: "no-cache",
      "x-robots-tag": "noindex, nofollow, noarchive",
      "x-mmd-control-room-ui": "owner-v4",
    },
  });
}
