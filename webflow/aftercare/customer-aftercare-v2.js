/* MMD Prive - Customer Aftercare v2
 * Page: /aftercare
 * Truth: signed POST /v1/confirm/details + POST events-worker /v1/customer/session/aftercare
 * Privacy: private feedback only; no public review/quote permission.
 */
(() => {
  'use strict';

  if (window.__mmdCustomerAftercareV2) return;
  window.__mmdCustomerAftercareV2 = true;

  const ROOT_ID = 'sigil-aftercare-room';
  const DETAILS_URL = 'https://sigil.mmdbkk.com/v1/confirm/details';
  const SUBMIT_URL = 'https://events-worker.malemodel-bkk.workers.dev/v1/customer/session/aftercare';
  const CONFIRM_PATH = '/sigil/confirm/job-confirmation';
  const RECOVERY_PATH = '/sigil/recovery';
  const QUICK_TAGS = [
    ['on_time', 'ตรงเวลา'],
    ['polite', 'สุภาพ'],
    ['good_care', 'ดูแลดี'],
    ['matched_brief', 'ตรงตามบรีฟ'],
    ['want_again', 'อยากเจออีก'],
  ];
  const ISSUE_TAGS = [
    ['privacy', 'Privacy'],
    ['safety', 'Safety'],
    ['payment', 'Payment'],
    ['brief_mismatch', 'ไม่ตรงบรีฟ'],
  ];

  const qs = new URLSearchParams(location.search);
  const token = clean(qs.get('t') || qs.get('token'));
  let details = null;
  let rating = 0;
  const quickTags = new Set();
  const issueTags = new Set();
  let submitting = false;

  installV2Styles();
  document.body.classList.add('sac-lock');
  const root = buildRoot();
  document.body.prepend(root);
  wireUi();
  verifySignedSession();

  function buildRoot() {
    const el = document.createElement('section');
    el.id = ROOT_ID;
    el.className = 'sac';
    el.setAttribute('aria-label', 'MMD Prive Aftercare');
    el.style.setProperty('--sac-bg-img', 'url("https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/6a6e3739c104ee503db4ddc5_Kenji%20Care.webp")');
    el.style.setProperty('--sac-card-img', 'url("https://s3.amazonaws.com/webflow-prod-assets/68f879d546d2f4e2ab186e90/6a6f21c3717f26d20bc4bc1b_HYPE-6-Care-CTA-Hero-16x9.png")');
    el.innerHTML = `
      <div class="sac-bg" aria-hidden="true"></div>
      <div class="sac-glow" aria-hidden="true"></div>
      <div class="sac-gridline" aria-hidden="true"></div>

      <header class="sac-wrap sac-hero sac2-hero">
        <nav class="sac-top" aria-label="Aftercare navigation">
          <a class="sac-brand" data-confirm-link href="${CONFIRM_PATH}${token ? `?t=${encodeURIComponent(token)}` : ''}"><i class="sac-dot"></i><span>SIGIL</span></a>
          <div class="sac-nav"><span class="sac-pill">PRIVATE AFTERCARE</span></div>
        </nav>

        <div class="sac-hero-grid">
          <div>
            <p class="sac-kicker">MMD PRIVE / AFTERCARE</p>
            <h1 class="sac2-title">After<br>Care</h1>
            <p class="sac-lead">หลัง Session แยกจากกันเรียบร้อย คุณสามารถให้คะแนนสั้น ๆ และส่งข้อความส่วนตัวถึง Model หรือ MMD ได้ตรงนี้ครับ</p>
            <div class="sac-actions">
              <a class="sac-btn sac-primary" href="#aftercareForm">เริ่ม Aftercare</a>
              <a class="sac-btn sac-ghost" data-recovery-link href="${signedPath(RECOVERY_PATH)}">Private Care</a>
            </div>
          </div>

          <aside class="sac-card sac2-card" aria-live="polite">
            <div class="sac-card-img" aria-hidden="true"></div>
            <div class="sac-label">SIGNED SESSION</div>
            <h2 data-session-title>กำลังตรวจลิงก์ของคุณ</h2>
            <p data-session-copy>Aftercare จะเปิดเมื่อระบบยืนยัน signed session และสถานะ separated แล้วเท่านั้น</p>
            <div class="sac-mini">
              <span>Model</span><strong data-model-name>—</strong>
              <span>Date</span><strong data-job-date>—</strong>
              <span>Status</span><strong data-session-state>Checking</strong>
            </div>
          </aside>
        </div>
      </header>

      <main class="sac-wrap sac-main">
        <section class="sac-panel sac2-status-panel" aria-label="Aftercare availability">
          <div class="sac2-status" data-gate-state="checking">
            <div>
              <p class="sac-kicker">SESSION GATE</p>
              <h2 data-gate-title>กำลังยืนยัน Session</h2>
              <p data-gate-copy>ใช้ข้อมูลจาก signed confirmation เท่านั้น Browser จะไม่อ่าน Jobs หรือ event log ดิบโดยตรง</p>
            </div>
            <span class="sac2-badge" data-gate-badge>CHECKING</span>
          </div>
        </section>

        <section class="sac-panel" id="aftercareForm" aria-label="Private aftercare form">
          <div class="sac-head">
            <p class="sac-kicker">PRIVATE FEEDBACK</p>
            <h2>วันนี้เป็นยังไงบ้างครับ</h2>
            <p>คะแนนและข้อความในหน้านี้เป็นข้อมูลภายใน MMD ไม่ใช่ public review และจะไม่ถูกนำไปใช้เป็น quote จากหน้านี้</p>
          </div>

          <form data-form="aftercare" novalidate>
            <fieldset data-form-fields disabled>
              <div class="sac-form-grid">
                <div class="sac-form-card is-wide">
                  <label>ให้คะแนน Session นี้</label>
                  <div class="sac2-stars" data-rating role="radiogroup" aria-label="คะแนน 1 ถึง 5 ดาว">
                    ${[1,2,3,4,5].map((n) => `<button type="button" data-rating-value="${n}" aria-label="${n} ดาว" aria-pressed="false"><span aria-hidden="true">★</span><b>${n}</b></button>`).join('')}
                  </div>
                  <p class="sac2-hint" data-rating-hint>เลือก 1–5 ดาว</p>
                </div>

                <div class="sac-form-card is-wide">
                  <label>สิ่งที่ตรงกับวันนี้</label>
                  <div class="sac2-tags" data-quick-tags>
                    ${QUICK_TAGS.map(([code, label]) => `<button type="button" data-quick-tag="${code}" aria-pressed="false">${label}</button>`).join('')}
                  </div>
                </div>

                <div class="sac-form-card">
                  <label for="private_model_message">ข้อความส่วนตัวถึง Model <span class="sac2-optional">ไม่บังคับ</span></label>
                  <textarea id="private_model_message" name="private_model_message" maxlength="2000" placeholder="เช่น ขอบคุณที่ดูแลดีมาก วันนี้สบายใจครับ"></textarea>
                  <p class="sac2-hint">ส่งแบบ private โดยค่าเริ่มต้น ไม่ใช่ public review</p>
                </div>

                <div class="sac-form-card">
                  <label for="private_mmd_message">ข้อความส่วนตัวถึง MMD <span class="sac2-optional">ไม่บังคับ</span></label>
                  <textarea id="private_mmd_message" name="private_mmd_message" maxlength="4000" placeholder="มีอะไรที่อยากให้ MMD จำไว้สำหรับครั้งต่อไป บอกตรงนี้ได้ครับ"></textarea>
                  <p class="sac2-hint">ข้อความนี้แยกจากข้อความถึง Model</p>
                </div>

                <div class="sac-form-card is-wide sac2-care-box">
                  <details data-care-details>
                    <summary>มีบางอย่างไม่โอเค / อยากให้ MMD ช่วยดู <span>+</span></summary>
                    <div class="sac2-care-body">
                      <p>เลือกได้ถ้าเกี่ยวกับ Privacy, Safety, Payment หรือไม่ตรงบรีฟ ระบบจะเสนอ Private Care หลังส่ง และคุณสามารถเปิด Recovery ได้ทันที</p>
                      <div class="sac2-tags sac2-issue-tags" data-issue-tags>
                        ${ISSUE_TAGS.map(([code, label]) => `<button type="button" data-issue-tag="${code}" aria-pressed="false">${label}</button>`).join('')}
                      </div>
                      <a class="sac-btn sac-ghost sac2-inline-btn" data-recovery-link href="${signedPath(RECOVERY_PATH)}">เปิด Private Care / Recovery</a>
                    </div>
                  </details>
                </div>
              </div>

              <div class="sac-actions sac2-submit-row">
                <button class="sac-btn sac-primary" type="submit" data-submit>ส่ง Aftercare ให้ MMD</button>
                <span class="sac2-submit-note">ต้องเลือกคะแนนก่อนส่ง</span>
              </div>
            </fieldset>
          </form>

          <div class="sac2-result" data-result hidden></div>
        </section>

        <section class="sac-panel" aria-label="Aftercare privacy note">
          <div class="sac-head">
            <p class="sac-kicker">PRIVACY BY DESIGN</p>
            <h2>จบ Session ก่อน แล้วค่อยเปิด Aftercare</h2>
            <p>Aftercare unlock ที่ <strong>separated</strong> ไม่ใช่ work_finished เพื่อให้ทั้งสองฝ่ายมีพื้นที่ส่วนตัวก่อน ระบบใช้ signed confirmation token เป็น context และไม่ให้ลูกค้ากรอก Job/Model/วันที่ซ้ำเอง</p>
          </div>
        </section>
      </main>

      <div class="sac-toast" role="status" aria-live="polite" data-toast></div>

      <footer class="mmd-signature-footer" aria-label="SIGIL System signature">
        <div class="mmd-signature-inner">
          <p class="mmd-signature-brand">SIGIL SYSTEM</p>
          <p class="mmd-signature-line">Bangkok • Kept Secrets</p>
          <p class="mmd-signature-tagline">Discreet by your desire, Elegant by choice.</p>
          <p class="mmd-signature-credit">Private system architecture, visual language, access flow and operations by <strong>Per</strong> × <strong>AI System Workers</strong>.</p>
          <p class="mmd-signature-year">2020 - 2026</p>
        </div>
      </footer>`;
    return el;
  }

  function wireUi() {
    root.querySelectorAll('[data-rating-value]').forEach((button) => {
      button.addEventListener('click', () => setRating(Number(button.dataset.ratingValue)));
    });
    root.querySelectorAll('[data-quick-tag]').forEach((button) => {
      button.addEventListener('click', () => toggleTag(button, quickTags, button.dataset.quickTag));
    });
    root.querySelectorAll('[data-issue-tag]').forEach((button) => {
      button.addEventListener('click', () => toggleTag(button, issueTags, button.dataset.issueTag));
    });
    root.querySelector('[data-form="aftercare"]')?.addEventListener('submit', submitAftercare);
  }

  async function verifySignedSession() {
    if (!token) {
      setGate('locked', 'ต้องเปิดจากลิงก์ Confirmation ของ MMD', 'ลิงก์นี้ไม่มี signed confirmation token จึงไม่สามารถเปิดหรือส่ง Aftercare ได้', 'LOCKED');
      setSessionCard('Signed link required', 'กลับไปเปิดลิงก์ Job Confirmation ที่ MMD ส่งให้คุณ', 'Locked');
      return;
    }

    setGate('checking', 'กำลังยืนยัน Session', 'กำลังตรวจ signed token และสถานะล่าสุดจาก Customer Session v2', 'CHECKING');
    try {
      const response = await fetch(DETAILS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ t: token, expected_role: 'customer' }),
        credentials: 'omit',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok || data?.role !== 'customer') {
        throw new Error(clean(data?.error) || 'confirmation_verification_failed');
      }
      details = data;
      renderVerifiedDetails(data);
    } catch (error) {
      const code = clean(error?.message);
      setGate('locked', 'ยืนยันลิงก์นี้ไม่ได้', humanVerificationError(code), 'LOCKED');
      setSessionCard('Session not verified', 'MMD ไม่แสดงรายละเอียดหรือรับ feedback เมื่อ signed context ยืนยันไม่ได้', 'Locked');
    }
  }

  function renderVerifiedDetails(data) {
    const session = data?.customer_session;
    const lifecycle = clean(session?.lifecycle_state) || clean(data?.session_status) || 'unknown';
    text('[data-model-name]', clean(data?.model_name) || 'MMD Model');
    text('[data-job-date]', formatDate(data?.job_date));
    text('[data-session-state]', lifecycle);

    if (!session || session?.schema !== 'customer_session_v2' || session?.source_available === false) {
      setGate('locked', 'ยังตรวจ Aftercare state ไม่ได้', 'Customer Session source ยังไม่พร้อม จึงปิดการส่ง feedback แบบ fail-closed ไว้ก่อน', 'WAITING');
      setSessionCard('รอข้อมูล Session', 'MMD ยืนยันตัวตนได้แล้ว แต่ยังยืนยันสถานะงานสำหรับ Aftercare ไม่ได้', lifecycle);
      return;
    }

    if (!session?.aftercare?.available) {
      const finished = lifecycle === 'work_finished';
      setGate('waiting', finished ? 'บริการจบแล้ว · รอแยกจากกัน' : 'Aftercare ยังไม่เปิด', finished ? 'Aftercare จะเปิดเมื่อ Model ยืนยัน separated แล้ว เพื่อให้ทั้งสองฝ่ายมีพื้นที่ส่วนตัวก่อน' : 'หน้านี้จะเปิดอัตโนมัติเมื่อ Session เข้าสู่สถานะ separated หรือหลังจากนั้น', 'WAITING');
      setSessionCard(finished ? 'Almost ready' : 'Session in progress', finished ? 'งานจบแล้ว แต่ระบบยังรอ separated ก่อนเปิด Aftercare' : 'ยังไม่ถึงช่วง Aftercare', lifecycle);
      return;
    }

    setGate('ready', 'Aftercare พร้อมแล้ว', 'Signed session ยืนยันแล้ว คุณสามารถให้คะแนนและส่งข้อความส่วนตัวได้', 'READY');
    setSessionCard('Aftercare ready', `Session กับ ${clean(data?.model_name) || 'MMD Model'} พร้อมรับ feedback แล้ว`, lifecycle);
    const fields = root.querySelector('[data-form-fields]');
    if (fields) fields.disabled = false;
  }

  function setRating(value) {
    rating = Number(value) || 0;
    root.querySelectorAll('[data-rating-value]').forEach((button) => {
      const on = Number(button.dataset.ratingValue) === rating;
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    text('[data-rating-hint]', rating ? `${rating} / 5 ดาว` : 'เลือก 1–5 ดาว');
  }

  function toggleTag(button, set, code) {
    if (!code) return;
    if (set.has(code)) set.delete(code); else set.add(code);
    const on = set.has(code);
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  async function submitAftercare(event) {
    event.preventDefault();
    if (submitting) return;
    if (!details?.customer_session?.aftercare?.available) {
      showToast('Aftercare ยังไม่พร้อมสำหรับ Session นี้ครับ');
      return;
    }
    if (!rating) {
      showToast('กรุณาเลือกคะแนน 1–5 ดาวก่อนส่งครับ');
      root.querySelector('[data-rating-value]')?.focus();
      return;
    }

    const form = event.currentTarget;
    const fd = new FormData(form);
    const sessionId = clean(details?.session_id);
    const payload = {
      t: token,
      rating,
      idempotency_key: idempotencyKey(sessionId),
      quick_tags: [...quickTags],
      issue_tags: [...issueTags],
      private_model_message: clean(fd.get('private_model_message')),
      private_mmd_message: clean(fd.get('private_mmd_message')),
    };

    submitting = true;
    setSubmitState(true);
    showToast('กำลังส่ง Aftercare ให้ MMD...');
    try {
      const response = await fetch(SUBMIT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'omit',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) {
        throw new Error(clean(data?.error) || `aftercare_submit_${response.status}`);
      }
      renderSuccess(data);
    } catch (error) {
      const code = clean(error?.message);
      if (code === 'aftercare_wait_for_separated' || code === 'aftercare_not_available') {
        setGate('waiting', 'Aftercare ยังไม่เปิด', 'สถานะ Session เปลี่ยนก่อนส่ง กรุณากลับไปหน้า Confirmation และรอ separated ก่อน', 'WAITING');
      }
      showToast(humanSubmitError(code));
    } finally {
      submitting = false;
      setSubmitState(false);
    }
  }

  function renderSuccess(data) {
    const fieldset = root.querySelector('[data-form-fields]');
    if (fieldset) fieldset.disabled = true;
    const result = root.querySelector('[data-result]');
    if (!result) return;
    const privateCare = Boolean(data?.private_care?.recommended);
    const recoveryUrl = privateCare ? normalizeRelativeUrl(data?.private_care?.url) : '';
    result.hidden = false;
    result.innerHTML = `
      <div class="sac2-success">
        <span>${data?.idempotent ? 'ALREADY RECEIVED' : 'RECEIVED'}</span>
        <h3>ขอบคุณครับ MMD รับ Aftercare แล้ว</h3>
        <p>คะแนนและข้อความถูกบันทึกเป็นข้อมูลส่วนตัวของ Session นี้แล้ว${privateCare ? ' และมีสัญญาณที่เหมาะกับ Private Care' : ''}</p>
        <div class="sac-actions">
          ${privateCare ? `<a class="sac-btn sac-primary" href="${escapeAttr(recoveryUrl || signedPath(RECOVERY_PATH))}">ไป Private Care</a>` : ''}
          <a class="sac-btn sac-ghost" href="${escapeAttr(signedPath(CONFIRM_PATH))}">กลับ Session</a>
        </div>
      </div>`;
    result.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
    setGate('done', 'รับ Aftercare แล้ว', 'MMD บันทึก feedback ของ Session นี้เรียบร้อย', 'RECEIVED');
    showToast('ส่งแล้วครับ ขอบคุณที่ให้ MMD ดูแลวันนี้');
  }

  function setGate(mode, title, copy, badge) {
    const gate = root.querySelector('.sac2-status');
    if (gate) gate.dataset.gateState = mode;
    text('[data-gate-title]', title);
    text('[data-gate-copy]', copy);
    text('[data-gate-badge]', badge);
  }

  function setSessionCard(title, copy, state) {
    text('[data-session-title]', title);
    text('[data-session-copy]', copy);
    text('[data-session-state]', state);
  }

  function setSubmitState(isBusy) {
    const button = root.querySelector('[data-submit]');
    if (!button) return;
    button.disabled = isBusy;
    button.textContent = isBusy ? 'กำลังส่ง...' : 'ส่ง Aftercare ให้ MMD';
  }

  function idempotencyKey(sessionId) {
    const key = `mmd_aftercare_v2:${clean(sessionId) || 'session'}`;
    try {
      const existing = localStorage.getItem(key);
      if (existing && /^[A-Za-z0-9._:-]{8,120}$/.test(existing)) return existing;
      const suffix = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const created = `ac-${clean(sessionId).replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 42)}-${suffix}`.slice(0, 120);
      localStorage.setItem(key, created);
      return created;
    } catch {
      return `ac-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    }
  }

  function signedPath(path) {
    return path + (token ? `?t=${encodeURIComponent(token)}` : '');
  }

  function normalizeRelativeUrl(value) {
    const raw = clean(value);
    if (!raw) return '';
    try {
      const url = new URL(raw, location.origin);
      if (url.origin !== location.origin) return '';
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return '';
    }
  }

  function formatDate(value) {
    const raw = clean(value);
    if (!raw) return '—';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function humanVerificationError(code) {
    if (/expired|410/.test(code)) return 'ลิงก์นี้หมดอายุแล้ว กรุณาใช้ลิงก์ Confirmation ล่าสุดจาก MMD';
    if (/role|403/.test(code)) return 'ลิงก์นี้ไม่ใช่ Customer Confirmation จึงเปิด Aftercare ไม่ได้';
    return 'MMD ยืนยัน signed session จากลิงก์นี้ไม่ได้ จึงปิดข้อมูลและการส่ง feedback ไว้';
  }

  function humanSubmitError(code) {
    if (code === 'aftercare_wait_for_separated') return 'งานจบแล้ว แต่ยังต้องรอ separated ก่อนเปิด Aftercare ครับ';
    if (code === 'aftercare_not_available') return 'Aftercare ยังไม่พร้อมสำหรับ Session นี้ครับ';
    if (/confirmation|token|401|403|410/.test(code)) return 'signed confirmation ใช้งานไม่ได้ กรุณาเปิดลิงก์ล่าสุดจาก MMD';
    return 'ตอนนี้ส่ง Aftercare ไม่สำเร็จ ข้อมูลที่พิมพ์ยังอยู่ในหน้า ลองส่งอีกครั้งได้ครับ';
  }

  function showToast(message) {
    const toast = root.querySelector('[data-toast]');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-show');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => toast.classList.remove('is-show'), 4500);
  }

  function text(selector, value) {
    const el = root.querySelector(selector);
    if (el) el.textContent = value;
  }

  function clean(value) {
    return String(value == null ? '' : value).trim();
  }

  function escapeAttr(value) {
    return clean(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  }

  function prefersReducedMotion() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  }

  function installV2Styles() {
    if (document.getElementById('mmd-aftercare-v2-styles')) return;
    const style = document.createElement('style');
    style.id = 'mmd-aftercare-v2-styles';
    style.textContent = `
#${ROOT_ID} .sac2-hero{min-height:78svh}
#${ROOT_ID} .sac2-title{font-size:clamp(58px,18vw,128px)}
#${ROOT_ID} .sac2-card p{min-height:44px}
#${ROOT_ID} .sac2-status{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:4px 0}
#${ROOT_ID} .sac2-status h2{margin-top:2px}
#${ROOT_ID} .sac2-status p:not(.sac-kicker){margin:10px 0 0;color:var(--muted);font-size:13px;line-height:1.75}
#${ROOT_ID} .sac2-badge{flex:0 0 auto;padding:8px 11px;border:1px solid var(--line);border-radius:999px;color:var(--gold);font:900 10px/1 Outfit,sans-serif;letter-spacing:.08em}
#${ROOT_ID} [data-gate-state="ready"] .sac2-badge,#${ROOT_ID} [data-gate-state="done"] .sac2-badge{border-color:rgba(112,203,151,.35);color:#aee4c4;background:rgba(112,203,151,.07)}
#${ROOT_ID} [data-gate-state="locked"] .sac2-badge{border-color:rgba(255,95,95,.34);color:#ffaaa5;background:rgba(177,13,23,.08)}
#${ROOT_ID} .sac2-stars{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
#${ROOT_ID} .sac2-stars button{min-height:64px;border:1px solid var(--line2);border-radius:18px;background:rgba(255,255,255,.045);color:rgba(255,248,236,.55);font:inherit;cursor:pointer;transition:.25s ease}
#${ROOT_ID} .sac2-stars button span{display:block;font-size:23px;line-height:1}
#${ROOT_ID} .sac2-stars button b{display:block;margin-top:5px;font-size:10px}
#${ROOT_ID} .sac2-stars button.is-on{border-color:rgba(216,180,106,.58);background:linear-gradient(135deg,rgba(216,180,106,.15),rgba(255,43,54,.08));color:#ffe7a7;box-shadow:0 0 30px rgba(216,180,106,.10)}
#${ROOT_ID} .sac2-tags{display:flex;flex-wrap:wrap;gap:8px}
#${ROOT_ID} .sac2-tags button{min-height:42px;padding:10px 13px;border:1px solid var(--line2);border-radius:999px;background:rgba(255,255,255,.045);color:var(--muted);font:800 12px/1.2 inherit;cursor:pointer}
#${ROOT_ID} .sac2-tags button.is-on{border-color:rgba(216,180,106,.5);background:rgba(216,180,106,.11);color:#fff1bd}
#${ROOT_ID} .sac2-issue-tags button.is-on{border-color:rgba(255,43,54,.5);background:rgba(255,43,54,.11);color:#ffc0bd}
#${ROOT_ID} .sac2-hint{margin:9px 0 0;color:var(--soft);font-size:11px;line-height:1.6}
#${ROOT_ID} .sac2-optional{color:var(--soft);font-weight:600}
#${ROOT_ID} .sac2-care-box details{margin:0}
#${ROOT_ID} .sac2-care-box summary{display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;list-style:none;color:var(--ink);font-weight:900}
#${ROOT_ID} .sac2-care-box summary::-webkit-details-marker{display:none}
#${ROOT_ID} .sac2-care-box summary span{display:grid;place-items:center;width:28px;height:28px;border:1px solid var(--line2);border-radius:50%;color:var(--gold);transition:transform .25s ease}
#${ROOT_ID} .sac2-care-box details[open] summary span{transform:rotate(45deg)}
#${ROOT_ID} .sac2-care-body{padding-top:14px}
#${ROOT_ID} .sac2-care-body p{margin:0 0 12px;color:var(--muted);font-size:12.5px;line-height:1.7}
#${ROOT_ID} .sac2-inline-btn{margin-top:13px;width:max-content}
#${ROOT_ID} .sac2-submit-row{align-items:center}
#${ROOT_ID} .sac2-submit-note{color:var(--soft);font-size:11px}
#${ROOT_ID} fieldset{min-width:0;margin:0;padding:0;border:0}
#${ROOT_ID} fieldset:disabled{opacity:.43;filter:saturate(.6)}
#${ROOT_ID} fieldset:disabled button,#${ROOT_ID} fieldset:disabled textarea{cursor:not-allowed}
#${ROOT_ID} .sac2-result{margin-top:18px}
#${ROOT_ID} .sac2-success{border:1px solid rgba(112,203,151,.26);border-radius:24px;padding:20px;background:radial-gradient(circle at 0 0,rgba(112,203,151,.10),transparent 42%),rgba(255,255,255,.035)}
#${ROOT_ID} .sac2-success>span{color:#aee4c4;font:900 10px/1 Outfit,sans-serif;letter-spacing:.14em}
#${ROOT_ID} .sac2-success h3{margin:10px 0 0;font-size:22px}
#${ROOT_ID} .sac2-success p{margin:9px 0 0;color:var(--muted);font-size:13px;line-height:1.7}
#${ROOT_ID} .sac-form-card textarea{min-height:150px}
@media(min-width:860px){#${ROOT_ID} .sac2-stars{max-width:600px}#${ROOT_ID} .sac2-title{font-size:clamp(88px,9vw,138px)}}
@media(max-width:560px){#${ROOT_ID} .sac2-status{display:grid}#${ROOT_ID} .sac2-badge{width:max-content}#${ROOT_ID} .sac2-stars button{min-height:58px}#${ROOT_ID} .sac2-stars button span{font-size:20px}}
`;
    document.head.appendChild(style);
  }
})();
