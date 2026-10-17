// Preserve browser JavaScript as source text: Worker bundlers must not inject helpers.
export const CLIENT_SOURCE = String.raw`(function client() {
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
})();`;
