import { GROUPS, ROUTES } from "./catalog.mjs";

const CSS = [
  ":root{color-scheme:dark;--bg:#110c0a;--panel:#1d1511;--panel2:#291c15;--gold:#d7af67;--soft:#f3deb7;--text:#fff9f0;--copy:#e4d7ca;--muted:#b7a695;--line:rgba(215,175,103,.33)}",
  "*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;min-height:100dvh;background:radial-gradient(ellipse at 95% 0%,#38231a 0%,transparent 40%),linear-gradient(150deg,#110c0a,#1b110f 65%,#100b09);font:400 15px/1.7 system-ui,Tahoma,sans-serif;color:var(--copy);-webkit-font-smoothing:antialiased}",
  "h1,h2,h3,p{margin:0}h1,h2,h3{font-weight:600;color:var(--text);line-height:1.4}h1{font-size:clamp(27px,7vw,43px)}h2{font-size:clamp(20px,5vw,29px)}h3{font-size:16px}",
  "a{color:var(--soft)}a:focus-visible,button:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid var(--soft);outline-offset:3px}button,input{font:inherit}button{cursor:pointer}button:disabled{cursor:not-allowed;opacity:.55}",
  ".shell{width:min(1160px,calc(100% - 32px));margin:auto}.nav{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:22px 0;border-bottom:1px solid var(--line)}.brand{display:flex;flex-wrap:wrap;align-items:center;gap:8px;text-decoration:none;min-height:46px;color:var(--soft);font-weight:700;letter-spacing:.08em}",
  ".kicker{color:var(--gold);font-size:11px;letter-spacing:.16em;text-transform:uppercase;font-weight:600}.muted{color:var(--muted)}.lead{font-size:16px;line-height:1.9;max-width:68ch;margin-top:15px}",
  ".hero{padding:36px 0 32px;display:grid;gap:17px}.flag{display:inline-flex;gap:8px;align-items:center;padding:5px 12px;border:1px solid var(--line);border-radius:99px;font-size:11px;color:var(--soft);width:max-content;max-width:100%}",
  ".panel{border:1px solid var(--line);border-radius:20px;background:linear-gradient(145deg,rgba(215,175,103,.05),transparent 60%),var(--panel);padding:clamp(16px,3.5vw,30px)}.grid{display:grid;gap:12px}.cols2{grid-template-columns:repeat(2,minmax(0,1fr))}.cols3{grid-template-columns:repeat(3,minmax(0,1fr))}",
  ".cta{min-height:46px;border:1px solid var(--gold);background:var(--gold);color:#1d1208;border-radius:999px;padding:11px 20px;font-weight:700;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:8px;max-width:100%}.secondary{background:transparent;color:var(--soft)}",
  ".btnline{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:20px}.small{font-size:12px}.note{border-left:2px solid var(--gold);padding-left:14px;color:var(--copy);font-size:13px;line-height:1.8}",
  ".login{min-height:100dvh;display:grid;place-items:center;padding:30px 0}.login>.panel{width:min(460px,calc(100% - 32px))}.login form{display:grid;gap:12px;margin:25px 0 12px}.login label{font-weight:500;color:var(--text)}.login input{width:100%;min-height:51px;padding:12px 14px;background:#100b0a;border:1px solid var(--line);border-radius:12px;color:var(--text);font-size:16px}",
  ".group{margin:0 0 13px}.group>summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:12px;padding:17px;border:1px solid var(--line);border-radius:14px;background:var(--panel2);font-weight:600;color:var(--text);min-height:54px}.group>summary::-webkit-details-marker{display:none}.group[open]>summary{border-radius:14px 14px 0 0}.group-body{padding:14px;border:1px solid var(--line);border-top:0;border-radius:0 0 14px 14px;background:var(--panel)}",
  ".route{display:flex;justify-content:space-between;align-items:center;gap:16px;min-height:68px;padding:13px 4px;border-bottom:1px solid rgba(215,175,103,.15);text-decoration:none}.route:last-child{border-bottom:0}.route strong{color:var(--text);display:block}.route code{font-size:11px;overflow-wrap:anywhere;color:var(--muted)}.route b{font-size:20px;color:var(--gold)}",
  ".preview-layout{display:grid;gap:18px;grid-template-columns:minmax(0,1fr)}.preview-sidebar{align-self:start}.screen{overflow:hidden;border:1px solid var(--line);border-radius:20px;min-height:420px;background:#171210}",
  ".screen[data-family=member]{--gold:#a93450;--soft:#ffdbdc;--line:rgba(206,96,116,.32);background:#251318}.screen[data-family=mms]{--gold:#58977e;--soft:#e3eee6;--line:rgba(88,151,126,.34);background:#11221b}",
  ".screen-top{display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;align-items:center;padding:20px 22px;border-bottom:1px solid var(--line);background:rgba(15,11,10,.5)}.screen-top strong{letter-spacing:.1em;font-size:13px;color:var(--soft)}.screen-body{display:grid;gap:18px;padding:25px 20px 36px}.screen-body .big{font-size:clamp(28px,6vw,46px);line-height:1.23;color:var(--text);font-weight:600;max-width:19ch}.status-pill{padding:5px 10px;border:1px solid var(--line);border-radius:99px;color:var(--soft);font-size:11px}",
  ".samplecard{padding:19px;border:1px solid var(--line);border-radius:14px;background:rgba(255,255,255,.025)}.samplecard strong{display:block;color:var(--text);font-size:16px}.samplecard p{margin-top:8px;font-size:13px}.samplecard .dash{color:var(--gold);font-size:25px;font-weight:700}",
  ".states{display:flex;flex-wrap:wrap;gap:7px;margin:12px 0 22px}.states a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;border:1px solid var(--line);padding:9px 13px;border-radius:99px;text-decoration:none;font-size:12px}.states a[aria-current=page]{background:var(--gold);color:#211409}",
  ".footer{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;padding:24px 0;margin-top:34px;border-top:1px solid var(--line);font-size:12px;color:var(--muted)}.spacer{height:20px}.nowrap{white-space:nowrap}",
  "@media(min-width:900px){.preview-layout{grid-template-columns:260px minmax(0,1fr)}.preview-sidebar{position:sticky;top:14px}.screen-body{padding:40px}.grid.responsive3{grid-template-columns:repeat(3,minmax(0,1fr))}}",
  "@media(max-width:550px){.cols2,.cols3{grid-template-columns:1fr}.shell{width:calc(100% - 28px)}.route{align-items:flex-start}.btnline>*{flex:1 1 auto}.screen-top{padding:16px}.screen-body{padding:20px 15px}}",
  "@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important;animation:none!important}}"
].join("");

const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

function shell(title, body) {
  return '<!doctype html><html lang="th"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<meta name="referrer" content="no-referrer">' +
    '<meta name="robots" content="noindex,nofollow,noarchive">' +
    '<title>' + escape(title) + ' · MMD Owner Review</title><style>' + CSS +
    '</style></head><body>' + body + '</body></html>';
}
function brand() {
  return '<a class="brand" href="/" aria-label="Owner Review Gallery · หน้าแรก">MMD <span style="color:var(--gold)">/</span> OWNER REVIEW</a>';
}
function footer() {
  return '<footer class="footer"><span>OWNER REVIEW · VISUAL FIXTURES ONLY</span>' +
    '<span>ไม่มีการอ่านข้อมูลจริง · ไม่มีสิทธิ์ดำเนินการแทนผู้ใช้</span></footer>';
}
function stateLinks(route, state) {
  const labels = [["ready", "ตัวอย่างปกติ"], ["empty", "ข้อมูลว่าง"], ["loading", "กำลังโหลด"], ["error", "เกิดข้อผิดพลาด"], ["locked", "ยังไม่ผ่านสิทธิ์"]];
  return '<nav class="states" aria-label="ตัวอย่างสถานะ">' + labels.map(([id, label]) =>
    '<a href="/view/' + escape(route.id) + '?state=' + id + '"' +
    (id === state ? ' aria-current="page"' : '') + '>' + label + '</a>'
  ).join("") + '</nav>';
}
function sampleCards(route) {
  const templates = {
    admin: [
      ["สิ่งที่ต้องตรวจวันนี้", "เลือกดูเฉพาะสถานะที่ระบบยืนยัน"],
      ["งานและการชำระเงิน", "รายการทดลอง · ไม่มีการทำธุรกรรม"],
      ["Customer / Model", "ข้อมูลตัวอย่างเท่านั้น"]
    ],
    member: [
      ["สถานะสมาชิก", "ข้อมูลสมาชิกตัวอย่าง · รอยืนยัน"],
      ["Points และสิทธิ์", "ระบบจริงตรวจข้อมูลสมาชิกผ่าน LIFF"],
      ["รายการของฉัน", "ตัวอย่างการแสดงสถานะ"]
    ],
    model: [
      ["งานปัจจุบัน", "รายการตัวอย่าง · ไม่มีคำสั่งงานจริง"],
      ["รับทราบและเดินทาง", "ปุ่มจริงต้องได้สิทธิ์จาก Server"],
      ["หลังจบงาน", "ตัวอย่างขั้นตอน · ไม่ใช่หลักฐานจ่ายเงิน"]
    ],
    partner: [
      ["01 · นายแบบที่คุณดูแล", "ดูข้อมูลที่เชื่อมกับ Partner"],
      ["02 · งานและการตอบรับ", "ยืนยันงานได้เฉพาะหลัง Official Verify"],
      ["03 · ข้อตกลงและรายได้", "รายได้ที่พักการจ่ายไม่ใช่ยอดพร้อมรับ"]
    ],
    confirmation: [
      ["รายละเอียดงาน", "ต้องมีลิงก์เฉพาะงานที่ระบบออกให้"],
      ["การยืนยัน", "ตัวอย่างหน้าคอนเฟิร์ม · ยังไม่ได้ยืนยันจริง"],
      ["ขั้นตอนถัดไป", "ตรวจสอบการชำระเงินกับระบบจริง"]
    ],
    mms: [
      ["บริการของฉัน", "รายการตัวอย่างที่ไม่เชื่อมผู้ใช้"],
      ["ตารางนัดหมาย", "ดูการจัดวางมือถือโดยไม่มีการจองจริง"],
      ["การติดตามงาน", "ปุ่มจริงอยู่ภายใต้สิทธิ์ของระบบ"]
    ]
  };
  const list = templates[route.group] || templates.admin;
  return '<div class="grid responsive3">' + list.map(([title, copy]) =>
    '<section class="samplecard"><strong>' + escape(title) + '</strong>' +
    '<p>' + escape(copy) + '</p></section>'
  ).join("") + '</div>';
}
function sampleScreen(route, state) {
  const title = escape(route.title);
  const descriptions = {
    ready: "แสดงตัวอย่างรูปแบบของหน้าจอโดยใช้ข้อความและสถานะจำลอง",
    empty: "ยังไม่มีรายการในตัวอย่างนี้ ระบบจริงจะต้องอ่านข้อมูลจากแหล่งที่ได้รับอนุญาต",
    loading: "กำลังตรวจสอบข้อมูลตัวอย่าง · ไม่มีคำขอไปยัง API จริง",
    error: "ไม่สามารถโหลดข้อมูลตัวอย่างในสถานการณ์จำลองนี้ได้",
    locked: "ยังไม่มีสิทธิ์เปิดเนื้อหาระบบจริง · ต้องผ่านการเข้าสู่ระบบของแต่ละแอป"
  };
  const label = state === "ready" ? "ตัวอย่าง" : state === "empty" ? "EMPTY" : state.toUpperCase();
  const content = state === "ready"
    ? sampleCards(route)
    : '<section class="samplecard" role="status"><strong>' + escape(descriptions[state]) +
      '</strong><p>Mock state only · กดเปลี่ยนสถานะจากปุ่มด้านบนได้</p></section>';
  return '<section class="screen" data-family="' + escape(route.group) +
    '" data-preview-only="true" aria-label="หน้าจอจำลอง">' +
    '<header class="screen-top"><strong>' + escape(route.groupTitle) +
    '</strong><span class="status-pill">MOCK · ' + escape(label) + '</span></header>' +
    '<div class="screen-body"><p class="kicker">EXAMPLE UI · NO REAL AUTHORITY</p>' +
    '<h2 class="big">' + title + '</h2><p class="lead">' +
    escape(descriptions[state]) + '</p>' + content +
    '<div class="btnline"><button class="cta" disabled aria-label="ตัวอย่างปุ่ม ไม่ทำงานจริง">ทำรายการ · ปิดไว้ใน Preview</button>' +
    '<span class="small muted">ปุ่มจำลอง · ไม่มีการส่งข้อมูล</span></div></div></section>';
}
export function loginPage() {
  const html = '<main class="login"><section class="panel" aria-labelledby="login-heading">' +
    '<p class="kicker">MMD · OWNER REVIEW</p><h1 id="login-heading" style="margin-top:12px">ตรวจหน้าแอป<br>ในพื้นที่ส่วนตัว</h1>' +
    '<p class="lead">กรอกรหัสสำหรับพื้นที่ Preview เพื่อเปิดรายการหน้าที่ต้องตรวจ โดยไม่มีการปลดล็อกระบบจริงหรือข้อมูลของลูกค้า</p>' +
    '<p class="flag" style="margin-top:16px">READ ONLY · MOCK DATA</p>' +
    '<form method="post" action="/unlock" autocomplete="off">' +
    '<label for="code">Access Code สำหรับ Preview</label>' +
    '<input id="code" name="code" type="password" minlength="24" maxlength="256" required autocomplete="off" spellcheck="false" autocapitalize="none" placeholder="รหัสจากเจ้าของระบบ">' +
    '<button class="cta" type="submit">เปิดพื้นที่ตรวจงาน</button></form>' +
    '<p class="muted small">รหัสนี้ใช้เฉพาะตัวอย่างจำลอง ไม่สามารถล็อกอินแทนสมาชิก นายแบบ Partner หรือผู้ดูแลระบบจริง</p>' +
    '</section></main>';
  return shell("Access Code", html);
}
export function catalogPage() {
  const count = ROUTES.length;
  const groups = GROUPS.map((group, index) => {
    const routes = group.routes.map(([id, path, title]) =>
      '<a class="route" href="/view/' + escape(id) + '"><span><strong>' +
      escape(title) + '</strong><code>' + escape(path) +
      '</code></span><b aria-hidden="true">↗</b></a>'
    ).join("");
    return '<details class="group"' + (index === 0 ? ' open' : '') +
      '><summary><span>' + escape(group.title) + '</span><span class="muted small">' +
      group.routes.length + ' หน้า · เปิด/ปิด</span></summary><div class="group-body">' +
      routes + '</div></details>';
  }).join("");
  const body = '<div class="shell"><header class="nav">' + brand() +
    '<form action="/logout" method="post"><button class="cta secondary" type="submit">ออกจาก Preview</button></form></header>' +
    '<main><div class="hero"><span class="flag">ACCESS CODE VERIFIED · MOCK ONLY</span>' +
    '<p class="kicker">OWNER SCREEN REVIEW</p><h1>เลือกหน้าที่อยากตรวจครับ</h1>' +
    '<p class="lead">มีเส้นทางที่รวบรวมไว้ ' + count +
    ' รายการ แบ่งตามแอป ตรวจตัวอย่างการจัดวางและข้อความบนมือถือก่อน แล้วค่อยเปิดระบบจริงด้วยบัญชีที่ได้รับอนุญาต</p>' +
    '<p class="note">รายการนี้เป็น Candidate Inventory: บางเส้นทางอาจไม่ได้ล็อกอินเสมอ และตัวอย่างเป็นโครงภาพ ไม่ใช่ Screenshot/Runtime จริงของทุกเพจ</p></div>' +
    groups + '</main>' + footer() + '</div>';
  return shell("Protected Page Gallery", body);
}
export function reviewPage(route, state) {
  const liveUrl = "https://www.mmdbkk.com" + route.path;
  const body = '<div class="shell"><header class="nav">' + brand() +
    '<a class="cta secondary" href="/">รายการทุกหน้า</a></header>' +
    '<main class="hero"><p class="kicker">' + escape(route.groupTitle) + '</p>' +
    '<h1>' + escape(route.title) + '</h1>' +
    '<p class="small muted">' + escape(route.path) + '</p>' +
    '<p class="note">นี่เป็นภาพตัวอย่างเชิงโครงสร้างเท่านั้น ยังไม่เชื่อม Preview Adapter ของหน้าจริง และรหัส Preview นี้ใช้เข้าสู่ระบบจริงไม่ได้</p></main>' +
    '<div class="preview-layout"><aside class="preview-sidebar panel">' +
    '<p class="kicker">VIEW ONLY</p><h3 style="margin-top:10px">ตรวจข้อความและลำดับขั้นตอน</h3>' +
    '<p class="small muted" style="margin-top:8px">เลือกสถานะเพื่อเทียบ Empty, Loading, Error และสิทธิ์ไม่ผ่าน</p>' +
    '<div class="btnline"><a class="cta secondary" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" href="' +
    escape(liveUrl) + '">เปิดหน้าจริง · ต้อง Login ↗</a></div>' +
    '<p class="small muted" style="margin-top:12px">ระบบจริง: ' + escape(route.access) + '</p></aside>' +
    '<div>' + stateLinks(route, state) + sampleScreen(route, state) +
    '</div></div>' + footer() + '</div>';
  return shell(route.title, body);
}
export function errorPage(title, message) {
  return shell(title, '<main class="login"><section class="panel"><p class="kicker">OWNER REVIEW</p>' +
    '<h1 style="margin:12px 0">' + escape(title) + '</h1><p class="lead">' +
    escape(message) + '</p><a class="cta secondary" href="/" style="margin-top:24px">กลับหน้าแรก</a></section></main>');
}
