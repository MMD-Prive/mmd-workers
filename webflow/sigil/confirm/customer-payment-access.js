/* Customer Confirmation: explicit bank reveal without a booking-ack prerequisite.
 * Presentation/read-only. No account, amount or payment state is browser-owned.
 */
(function (scope, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else api.boot(scope);
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const ID = 'mmd-customer-payment-access';
  const PAY = 'https://sigil.mmdbkk.com/sigil/pay';
  const LINE = 'https://miniapp.line.me/2010830159-0n1O3ANK';
  const INSTRUCTIONS = 'https://sigil.mmdbkk.com/v1/confirm/payment-instructions';
  const clean = value => typeof value === 'string' ? value.trim() : '';
  function tokenFromUrl(href) {
    try {
      const url = new URL(href);
      if (url.pathname.replace(/\/+$/, '') !== '/sigil/confirm/job-confirmation') return '';
      const tokens = url.searchParams.getAll('t');
      return tokens.length === 1 && /^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/i.test(tokens[0]) ? tokens[0] : '';
    } catch { return ''; }
  }
  function destination(base, token) {
    const url = new URL(base);
    url.searchParams.set('t', token);
    return url.toString();
  }
  function bankView(data) {
    if (!data || data.ok !== true || data.authority !== 'payments-worker' || data.schema !== 'mmd_payment_instructions_v1') throw new Error('invalid_instructions');
    if (data.available !== true) {
      const messages = {
        payment_verified: 'ยอดในลิงก์นี้ได้รับการยืนยันแล้ว ไม่ต้องโอนซ้ำสำหรับยอดนี้ครับ',
        proof_received_waiting_verification: 'ได้รับสลิปของยอดนี้แล้วครับ กำลังตรวจยอด ไม่ต้องโอนหรือส่งสลิปซ้ำ',
        no_amount_due: 'ยอดในลิงก์นี้ไม่มียอดค้างชำระครับ',
        payment_not_accepting: 'รายการนี้ยังไม่เปิดรับชำระครับ กรุณาทัก MMD ก่อนโอน'
      };
      return { message: messages[data.reason] || 'ช่องทางชำระยังไม่พร้อมครับ กรุณาทัก MMD ก่อนโอน', bank: null };
    }
    const bank = data.instructions && data.instructions.bank_transfer;
    if (!bank || bank.enabled !== true) return { bank: null, message: 'รายการนี้ยังไม่เปิดให้โอนธนาคารครับ กด Payment เพื่อดูช่องทางที่พร้อม' };
    const number = clean(bank.account_number);
    const name = clean(bank.account_name_th) || clean(bank.account_name_en);
    const provider = clean(bank.bank_name_th) || clean(bank.bank_name_en) || clean(bank.provider);
    if (!/^[0-9 -]{6,32}$/.test(number) || number.replace(/\D/g, '').length < 6 || !name || !provider) throw new Error('incomplete_bank');
    return { message: 'ตรวจชื่อบัญชีให้ตรงก่อนโอน แล้วส่งสลิปเพียงช่องทางเดียวครับ', bank: { number, name, provider } };
  }
  async function read(env, token) {
    const controller = new env.AbortController();
    let timer;
    try {
      return await Promise.race([
        (async () => {
          const response = await env.fetch(INSTRUCTIONS, {
            method: 'POST', credentials: 'omit', cache: 'no-store',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ t: token }), signal: controller.signal
          });
          const data = await response.json();
          if (!response.ok) throw new Error('instructions_unavailable');
          return bankView(data);
        })(),
        new Promise((_, reject) => {
          timer = env.setTimeout(() => {
            reject(new Error('instructions_timeout'));
            controller.abort();
          }, 15000);
        })
      ]);
    } finally { env.clearTimeout(timer); }
  }
  function mount(env) {
    const doc = env.document;
    const token = tokenFromUrl(env.location.href);
    if (!token) return true;
    const root = doc.getElementById('mmd-job-confirm-v16');
    if (!root) return false;
    if (doc.getElementById(ID)) return true;
    function el(tag, text) { const node = doc.createElement(tag); if (text) node.textContent = text; return node; }
    const card = el('section'); card.id = ID; card.setAttribute('aria-label', 'ชำระเงินและส่งสลิป');
    const title = el('h2', 'ชำระเงินและส่งสลิป');
    const intro = el('p', 'กดดูเลขบัญชีสำหรับยอดในลิงก์นี้ได้เลย หรือเลือก QR / บัตรผ่าน Payment');
    const reveal = el('button', 'ดูเลขบัญชีสำหรับโอน'); reveal.type = 'button';
    const status = el('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const output = el('div'); output.hidden = true;
    const provider = el('p'), name = el('p'), number = el('strong');
    const copy = el('button', 'คัดลอกเลขบัญชี'); copy.type = 'button';
    output.append(provider, name, number, copy);
    const web = el('a', 'QR / บัตร / อัปโหลดสลิป'); web.href = destination(PAY, token);
    const line = root.querySelector('[data-mmd-payment-liff]') || el('a');
    line.textContent = 'เปิด Payment ใน LINE'; line.href = destination(LINE, token);
    line.removeAttribute('hidden'); line.removeAttribute('class');
    line.setAttribute('data-mmd-payment-liff', '1');
    line.setAttribute('data-mmd-canonical-target', 'sigil-payment-line-miniapp');
    const help = el('a', 'ส่งสลิปหรือขอความช่วยเหลือทาง LINE OFC');
    help.href = 'https://lin.ee/xRqsALs'; help.target = '_blank'; help.rel = 'noopener noreferrer';
    card.append(title, intro, reveal, status, output, web, line, help);
    root.prepend(card); // Outside hidden success/payment containers, including on cold load.
    let busy = false, account = '';
    reveal.addEventListener('click', async () => {
      if (busy) return;
      busy = true; reveal.disabled = true; output.hidden = true; account = '';
      provider.textContent = name.textContent = number.textContent = '';
      status.textContent = 'กำลังตรวจยอดและโหลดเลขบัญชี…';
      try {
        const view = await read(env, token);
        status.textContent = view.message;
        if (view.bank) {
          provider.textContent = view.bank.provider;
          name.textContent = view.bank.name;
          number.textContent = view.bank.number;
          account = view.bank.number.replace(/[ -]/g, '');
          output.hidden = false;
          reveal.textContent = 'ตรวจเลขบัญชีล่าสุดอีกครั้ง';
        } else reveal.textContent = 'ตรวจสถานะอีกครั้ง';
      } catch {
        status.textContent = 'ยังโหลดเลขบัญชีไม่สำเร็จครับ กดลองอีกครั้ง หรือทัก MMD ก่อนโอน';
        reveal.textContent = 'ลองโหลดเลขบัญชีอีกครั้ง';
      } finally { busy = false; reveal.disabled = false; }
    });
    copy.addEventListener('click', async () => {
      if (!account || output.hidden) return;
      try {
        await env.navigator.clipboard.writeText(account);
        status.textContent = 'คัดลอกเลขบัญชีแล้วครับ';
      } catch {
        status.textContent = 'คัดลอกอัตโนมัติไม่ได้ครับ แตะค้างที่เลขบัญชีเพื่อคัดลอกได้เลย';
      }
    });
    const style = el('style');
    style.textContent = '#'+ID+'{margin:16px;padding:20px;border:1px solid #766446;border-radius:16px;background:#171513;color:#fff8ee;font-family:"LINE Seed Sans TH","Noto Sans Thai",sans-serif}#'+ID+' [hidden]{display:none!important}#'+ID+' h2{margin:0 0 8px;font-size:20px;color:#fff8ee!important}#'+ID+' p{font-size:14px;line-height:1.7;color:#eee2d4!important}#'+ID+' strong{display:block;font-size:26px;color:#fff8ee!important;user-select:text;overflow-wrap:anywhere}#'+ID+' button,#'+ID+' a{display:block;width:100%;box-sizing:border-box;min-height:48px;padding:12px;margin:10px 0 0;border:1px solid #766446;border-radius:10px;background:#24201a;color:#fff8ee!important;text-align:center;font:inherit;line-height:1.5;text-decoration:none;cursor:pointer}#'+ID+'>button{background:#e3bd7c;color:#171513!important;font-weight:700}#'+ID+' button:disabled{opacity:.65;cursor:wait}#'+ID+' *{-webkit-text-fill-color:currentColor!important}';
    doc.head.appendChild(style);
    return true;
  }
  function boot(env) {
    if (!env.document) return;
    function start() {
      if (mount(env)) return;
      const observer = new env.MutationObserver(() => { if (mount(env)) observer.disconnect(); });
      observer.observe(env.document.documentElement, { childList: true, subtree: true });
      env.setTimeout(() => observer.disconnect(), 10000);
    }
    if (env.document.readyState === 'loading') env.document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
  return { tokenFromUrl, bankView, read, mount, boot };
});
