const STYLE = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700&display=swap');
:root{font-family:'Noto Sans Thai',system-ui,sans-serif;color:#203d32;background:#f4f6f2;font-synthesis:none}*{box-sizing:border-box}body{margin:0}button,input,select{font:inherit}a{color:#295f49;text-underline-offset:4px}button,a,input,select{-webkit-tap-highlight-color:transparent}button{cursor:pointer}button:disabled{cursor:wait;opacity:.65}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #8fcfaa;outline-offset:3px}[hidden]{display:none!important}.wrap{max-width:480px;margin:auto;padding:24px 22px calc(28px + env(safe-area-inset-bottom))}header{display:flex;align-items:center;justify-content:space-between;margin:10px 0 38px}.logo{font-weight:700;font-size:23px;letter-spacing:-1px}.logo small{display:block;letter-spacing:2.4px;font-size:9px;font-weight:600}.toplink{font-size:12px;text-decoration:none}.eyebrow{font-size:10px;font-weight:700;letter-spacing:2.2px;color:#526e5c}.title{font-size:34px;line-height:1.2;letter-spacing:-1px;font-weight:600;margin:12px 0}.lead{font-size:14px;line-height:1.8;color:#53665c;margin:12px 0 24px}.card{border-radius:25px;background:#fff;padding:24px;border:1px solid #dce4db;margin:20px 0}.membercard{background:#214d3b;color:#fff;min-height:215px;position:relative;overflow:hidden;border:0}.membercard:after{content:'';position:absolute;border:1px solid #60846c;border-radius:50%;width:230px;height:230px;right:-110px;top:-75px;pointer-events:none}.membercard .eyebrow{color:#bbd9c2}.cardname{font-size:25px;line-height:1.4;margin:28px 0 3px;overflow-wrap:anywhere}.memberid{font-size:10px;letter-spacing:.3px;overflow-wrap:anywhere;color:#d6e7da}.badge{display:inline-flex;border:1px solid #71917b;border-radius:20px;padding:4px 11px;font-size:11px;color:#e9f4e8;margin-top:17px}.btn{border:0;border-radius:15px;min-height:52px;padding:14px 18px;font-size:14px;font-weight:600;background:#24543e;color:white;width:100%;display:flex;align-items:center;justify-content:center;text-decoration:none;gap:8px}.btn.line{background:#067c3d}.btn.secondary{background:#e8eee6;color:#284b37}.linkbtn{border:0;background:none;color:#52695a;text-decoration:underline;font-size:12px;margin:22px auto;display:block}.sectiontitle{font-size:16px;margin:0 0 14px;font-weight:600}.row{display:flex;justify-content:space-between;gap:18px;padding:11px 0;border-bottom:1px solid #ecf0e9;font-size:13px}.row span:first-child{color:#647267}.row span:last-child{text-align:right;overflow-wrap:anywhere}.row:last-child{border:0}label.field{display:block;margin:15px 0;color:#415748;font-size:12px}input[type=text],input[type=tel],input[type=email],select{width:100%;margin-top:7px;border:1px solid #ccd8cc;border-radius:12px;padding:12px;background:#fbfcfa;color:#203d32;min-height:48px}label.check{display:flex;align-items:flex-start;gap:10px;margin:18px 0;font-size:12px;line-height:1.8;color:#485f50}input[type=checkbox]{accent-color:#24543e;width:18px;height:18px;flex-shrink:0;margin-top:3px}.fine{font-size:11px;color:#68776c;line-height:1.8}.detail{font-size:13px;line-height:1.9;color:#52685a}.icon{height:44px;width:44px;display:grid;place-items:center;border-radius:14px;background:#e7efe3;font-size:20px}.introitem{display:flex;gap:14px;align-items:center;margin:20px 0}.introitem b{display:block;font-size:13px}.introitem p{font-size:12px;color:#5d7161;margin:4px 0;line-height:1.7}.stage{font-size:11px;color:#6a5224;background:#f1ead5;border-radius:10px;padding:9px 12px;margin-bottom:20px}.status{font-size:12px;color:#516e59;line-height:1.8;min-height:22px}.progress{height:4px;background:#dee6db;border-radius:5px;overflow:hidden;margin:18px 0}.progress div{height:100%;background:#2c6548;width:0;transition:width .25s}.error{color:#8c352e;background:#fff3ee;padding:15px;border-radius:12px;font-size:13px;line-height:1.8;margin:16px 0}.actions{display:grid;gap:10px;margin-top:24px}footer{text-align:center;font-size:10px;color:#788276;margin-top:32px;line-height:2}.privacy h2{font-size:16px;margin-top:26px}.privacy p{font-size:13px;line-height:1.9;color:#4a6151}@media(min-width:700px){.wrap{padding-top:36px}.title{font-size:40px}}`;

function shell(content, script = '') {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#214d3b"><title>MY MMS · สมาชิก Male Massage</title><style>${STYLE}</style></head><body><main class="wrap"><header><div class="logo">MY MMS<small>MALE MASSAGE</small></div><a class="toplink" href="/male-massage/home">กลับหน้าหลัก ↗</a></header>${content}<footer>MY MMS · Male Massage<br><a href="/male-massage/member/privacy">การใช้ข้อมูลบัญชี</a> · <a href="https://lin.ee/NkfXMu7">ติดต่อทีมงาน</a></footer></main>${script}</body></html>`;
}

export function memberPage() {
  return shell(`
<div id="stage" class="stage" hidden></div>
<div id="notice" class="status" role="status" aria-live="polite"></div>
<div id="loading" class="progress" role="progressbar" aria-label="กำลังเปิดบัญชี" aria-valuemin="0" aria-valuemax="100"><div id="bar"></div></div>
<div id="error" class="error" role="alert" hidden></div>
<section id="welcome"><div class="eyebrow">YOUR PERSONAL SPACE</div><h1 class="title">การดูแลที่ดี<br>เริ่มจากรู้จักคุณ</h1><p class="lead">บัญชีส่วนตัวสำหรับลูกค้า Male Massage<br>เปิดผ่าน LINE ได้เลย ไม่ต้องตั้งรหัสผ่าน</p>
<div class="card"><div class="introitem"><div class="icon">↗</div><div><b>เข้าถึงบัญชีได้ง่าย</b><p>ใช้ LINE ของคุณเพื่อสมัครและกลับเข้ามาครั้งต่อไป</p></div></div><div class="introitem"><div class="icon">✓</div><div><b>ข้อมูลของคุณ ในที่เดียว</b><p>บัตรสมาชิกและข้อมูลติดต่อที่แก้ไขได้ด้วยตัวเอง</p></div></div></div>
<button id="login" class="btn line" disabled>เข้าสู่ระบบด้วย LINE</button><p class="fine">เมื่อเข้าสู่ระบบ คุณสามารถตรวจข้อมูลและเลือกสมัครบัญชีได้ในขั้นตอนถัดไป</p></section>
<section id="account" hidden><div class="eyebrow">YOUR MEMBERSHIP</div><h1 class="title">ยินดีต้อนรับ</h1><div class="card membercard"><div class="eyebrow">MY MMS · MEMBER</div><div id="cardname" class="cardname"></div><div id="memberid" class="memberid"></div><div class="badge">บัญชี Male Massage</div></div><div class="card"><h2 class="sectiontitle">ข้อมูลส่วนตัว</h2><div class="row"><span>ชื่อที่ใช้ใน LINE</span><span id="linename"></span></div><div class="row"><span>เบอร์โทรศัพท์</span><span id="phoneview"></span></div><div class="row"><span>อีเมล</span><span id="emailview"></span></div><div class="row"><span>สมัครเมื่อ</span><span id="since"></span></div></div><div class="actions"><button id="edit" class="btn secondary">แก้ไขข้อมูล</button><a class="btn" href="https://lin.ee/NkfXMu7">จองบริการกับทีม Male Massage</a></div><button id="logout" class="linkbtn">ออกจากระบบ</button></section>
<section id="editor" hidden><div class="eyebrow">MY MMS ACCOUNT</div><h1 id="formtitle" class="title">สมัครบัญชีของคุณ</h1><p class="lead">ใช้ชื่อที่อยากให้เราเรียกได้เลย<br>เบอร์โทรศัพท์และอีเมลกรอกเพิ่มภายหลังได้</p><form id="form" class="card"><label class="field">ชื่อที่ต้องการให้เรียก<input id="name" type="text" maxlength="100" autocomplete="nickname" required></label><label class="field">เบอร์โทรศัพท์ (ไม่บังคับ)<input id="phone" type="tel" maxlength="30" autocomplete="tel"></label><label class="field">อีเมล (ไม่บังคับ)<input id="email" type="email" maxlength="254" autocomplete="email"></label><label class="field">ภาษาที่สะดวก<select id="language"><option value="th">ไทย</option><option value="en">English</option></select></label><label id="consentlabel" class="check"><input id="consent" type="checkbox"><span>ฉันต้องการสมัครบัญชี Male Massage และรับทราบ<a href="/male-massage/member/privacy" target="_blank" rel="noopener">การใช้ข้อมูลบัญชี</a></span></label><label class="check"><input id="marketing" type="checkbox"><span>สนใจรับข่าวสารและโปรโมชั่น Male Massage (เลือกได้)</span></label><button id="save" class="btn" type="submit">สมัครบัญชี</button><button id="cancel" class="linkbtn" type="button">ย้อนกลับ</button></form></section>
<button id="retry" class="btn secondary" hidden>ลองอีกครั้ง</button><noscript><p class="error">กรุณาเปิด JavaScript เพื่อใช้งาน MY MMS ผ่าน LINE</p></noscript>`,
    `<script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script><script>(${client.toString()})();</script>`);
}

export function privacyPage() {
  return shell(`<article class="privacy"><div class="eyebrow">MY MMS ACCOUNT</div><h1 class="title">การใช้ข้อมูลบัญชี</h1><p>สำหรับบัญชีลูกค้า Male Massage · ฉบับ 17 ตุลาคม 2569</p><h2>ข้อมูลที่ใช้</h2><p>ระบบตรวจสอบตัวตนกับ LINE และใช้รหัสอ้างอิงที่แปลงแล้วเพื่อค้นหาบัญชีของคุณ เก็บชื่อที่ใช้ใน LINE ชื่อที่ต้องการให้เรียก ภาษา วันที่สมัคร และตัวเลือกการรับข่าวสาร หากคุณกรอกเบอร์โทรศัพท์หรืออีเมล ระบบจะเก็บไว้ในโปรไฟล์ของคุณด้วย</p><h2>ใช้เพื่ออะไร</h2><p>เพื่อเข้าสู่ระบบ แสดงบัตรสมาชิก และจัดการข้อมูลบัญชี Male Massage การเลือกไม่รับข่าวสารไม่มีผลต่อการสมัครบัญชี คุณแก้ไขตัวเลือกนี้ในหน้าโปรไฟล์ได้</p><h2>การจัดเก็บ</h2><p>ข้อมูลบัญชีอยู่ในระบบของ Male Massage บน Cloudflare แยกจากบัญชีสมาชิก MMD ระบบไม่เก็บรหัสผ่าน LINE หรือโทเคน LINE ระยะยาว ส่วนเบอร์โทรศัพท์และอีเมลที่กรอกเองยังไม่ถือว่าได้รับการยืนยัน</p><h2>แก้ไขหรือขอลบข้อมูล</h2><p>แก้ไขชื่อและข้อมูลติดต่อได้ในแอป หากต้องการขอลบบัญชีหรือสอบถามการใช้ข้อมูล โปรด<a href="https://lin.ee/NkfXMu7">ติดต่อทีมงาน Male Massage</a>ผ่าน LINE</p><a class="btn secondary" href="/male-massage/member">กลับไป MY MMS</a></article>`);
}

function client() {
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const stage = params.get('stage') || 'published';
  const base = '/api/mms/app/membership/';
  let config, account, initialized = false, editing = false, busy = false;
  const messages = {
    MMS_SESSION_REQUIRED: 'การเข้าสู่ระบบหมดอายุแล้ว กรุณาเข้าสู่ระบบด้วย LINE อีกครั้ง',
    MMS_LINE_TOKEN_INVALID: 'ยืนยัน LINE ไม่สำเร็จ กรุณาปิดแล้วเปิด MY MMS ผ่าน LINE อีกครั้ง',
    MMS_LINE_UNAVAILABLE: 'ขณะนี้เชื่อมต่อ LINE ไม่สำเร็จ กรุณาลองอีกครั้ง',
    MMS_NAME_INVALID: 'กรุณากรอกชื่อไม่เกิน 100 ตัวอักษร',
    MMS_PHONE_INVALID: 'กรุณาตรวจรูปแบบเบอร์โทรศัพท์',
    MMS_EMAIL_INVALID: 'กรุณาตรวจรูปแบบอีเมล',
    MMS_ACCOUNT_CONSENT_REQUIRED: 'กรุณารับทราบการใช้ข้อมูลก่อนสมัครบัญชี',
  };
  async function api(action, method = 'GET', body) {
    const response = await fetch(base + action + '?stage=' + encodeURIComponent(stage), {
      method, credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw Object.assign(new Error(result.error?.code), { code: result.error?.code, status: response.status });
    return result.data;
  }
  function progress(value, label) { $('bar').style.width = value + '%'; $('loading').setAttribute('aria-valuenow', value); $('notice').textContent = label; $('loading').hidden = value === 100; }
  function show(section) { for (const id of ['welcome', 'account', 'editor']) $(id).hidden = id !== section; }
  function clearError() { $('error').hidden = true; $('retry').hidden = true; }
  function error(e) {
    $('loading').hidden = true;
    $('notice').textContent = '';
    $('error').textContent = messages[e.code] || 'เปิด MY MMS ไม่สำเร็จ กรุณาลองอีกครั้ง หรือติดต่อทีมงาน Male Massage';
    $('error').hidden = false;
    $('retry').hidden = false;
    if (e.status === 401) { account = null; show('welcome'); }
  }
  function render(data) {
    account = data;
    progress(100, '');
    if (!data.registered) { editing = false; fillForm(); show('editor'); return; }
    const p = data.profile;
    $('cardname').textContent = p.display_name;
    $('memberid').textContent = p.member_id;
    $('linename').textContent = data.line_display_name || '—';
    $('phoneview').textContent = p.phone || 'ยังไม่ระบุ';
    $('emailview').textContent = p.email || 'ยังไม่ระบุ';
    $('since').textContent = new Date(p.created_at).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' });
    show('account');
  }
  function fillForm() {
    const p = account?.profile || {};
    $('name').value = p.display_name || account?.line_display_name || '';
    $('phone').value = p.phone || '';
    $('email').value = p.email || '';
    $('language').value = p.language || 'th';
    $('marketing').checked = p.marketing_consent === true;
    $('consent').checked = false;
    $('consent').required = !editing;
    $('consentlabel').hidden = editing;
    $('formtitle').textContent = editing ? 'ข้อมูลของคุณ' : 'สมัครบัญชีของคุณ';
    $('save').textContent = editing ? 'บันทึกข้อมูล' : 'สมัครบัญชี';
  }
  async function login() {
    if (busy) return;
    busy = true; $('login').disabled = true; clearError();
    try {
      progress(25, 'กำลังเชื่อมต่อ LINE');
      if (!initialized) { await liff.init({ liffId: config.liff_id }); initialized = true; }
      if (!liff.isLoggedIn()) {
        const returnUrl = new URL(location.origin + '/male-massage/member');
        if (stage !== 'published') returnUrl.searchParams.set('stage', stage);
        liff.login({ redirectUri: returnUrl.toString() }); return;
      }
      progress(65, 'กำลังยืนยันบัญชีของคุณ');
      const idToken = liff.getIDToken();
      const tokenBody = idToken ? { id_token: idToken } : { access_token: liff.getAccessToken() };
      const data = await api('line', 'POST', tokenBody);
      render(data);
    } catch (e) { error(e); }
    finally { busy = false; $('login').disabled = false; }
  }
  async function start() {
    clearError(); progress(10, 'กำลังเปิด MY MMS'); $('login').disabled = true;
    try {
      config = await api('config');
      if (stage !== 'published') { $('stage').textContent = 'MY MMS · ' + (stage === 'developing' ? 'ระบบทดสอบ' : 'สำหรับตรวจแอป'); $('stage').hidden = false; }
      try { render(await api('me')); return; } catch (e) { if (e.status !== 401) throw e; }
      if (typeof liff === 'undefined') throw new Error('SDK unavailable');
      if (!initialized) { await liff.init({ liffId: config.liff_id }); initialized = true; }
      progress(100, '');
      show('welcome');
      if (liff.isLoggedIn()) await login();
    } catch (e) { error(e); }
    finally { $('login').disabled = !config; }
  }
  $('login').onclick = login;
  $('retry').onclick = start;
  $('edit').onclick = () => { clearError(); editing = true; fillForm(); show('editor'); };
  $('cancel').onclick = () => { clearError(); if (account?.registered) render(account); else show('welcome'); };
  $('logout').onclick = async () => {
    if (busy) return;
    busy = true; clearError(); $('logout').disabled = true;
    try { await api('logout', 'POST', {}); account = null; if (initialized && liff.isLoggedIn()) liff.logout(); show('welcome'); $('notice').textContent = 'ออกจากระบบแล้ว'; }
    catch (e) { error(e); } finally { busy = false; $('logout').disabled = false; }
  };
  $('form').onsubmit = async event => {
    event.preventDefault(); if (busy) return;
    busy = true; $('save').disabled = true; clearError();
    try {
      const body = { display_name: $('name').value, phone: $('phone').value, email: $('email').value, language: $('language').value, marketing_consent: $('marketing').checked };
      if (!editing) { body.account_consent = $('consent').checked; body.notice_version = config.notice_version; }
      render(await api(editing ? 'profile' : 'register', editing ? 'PUT' : 'POST', body));
      $('notice').textContent = editing ? 'บันทึกข้อมูลแล้ว' : 'สมัครบัญชีเรียบร้อยแล้ว';
    } catch (e) { error(e); } finally { busy = false; $('save').disabled = false; }
  };
  start();
}
