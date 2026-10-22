// Presentation only. No identity, balance or business decision is made here.
export function createCustomerProgress({ render, request, timeoutMs = 15000, mutationTimeoutMs = 120000 }) {
  let generation = 0, memberGeneration = 0, nextId = 0;
  const tasks = new Map(), panels = new Set(), failures = new Map();
  function publish(panel, reset = false) {
    panels.add(panel);
    const active = [...tasks.values()].filter(t => t.panel === panel);
    const all = [...tasks.values()];
    render(panel, { pending:active.length, confirmedPercent:active.length ? Math.min(...active.map(t => t.stage)) * 50 : 0,
      error:Boolean(failures.get(panel)?.size), overallPending:all.length,
      overallPercent:all.length ? Math.min(...all.map(t => t.stage)) * 50 : 0,
      overallError:[...failures.values()].some(entries => entries.size > 0), reset });
  }
  function finish(id, panel, failed) {
    const task = tasks.get(id);
    tasks.delete(id);
    if (!failures.has(panel)) failures.set(panel, new Map());
    const errors = failures.get(panel);
    if (failed) errors.set(task.key, {floor:nextId, scope:task.scope});
    else if (id > (errors.get(task.key)?.floor ?? Infinity)) errors.delete(task.key);
    publish(panel);
  }
  function reset({ memberOnly = false } = {}) {
    memberGeneration++;
    if (!memberOnly) generation++;
    // Ignore late completion; do not abort/replay a business mutation on account reset.
    for (const [id, task] of tasks) if (!memberOnly || task.scope === "member") tasks.delete(id);
    for (const errors of failures.values()) for (const [key, failure] of errors) {
      if (!memberOnly || failure.scope === 'member') errors.delete(key);
    }
    for (const panel of panels) publish(panel, true);
  }
  async function fetchWithProgress(url, init = {}) {
    const path = String(url).split('?')[0];
    const panel = /history/.test(path) ? 'history-panel' : /credit/.test(path) ? 'credits'
      : /coupon|care-back\/wallet/.test(path) ? 'coupons' : /care|wish/.test(path) ? 'care'
      : /customer.request|evidence/.test(path) ? 'my-requests'
      : /renewal/.test(path) ? 'package' : /catalog|purchase/.test(path) ? 'signup'
      : /session\/current/.test(path) ? 'home' : 'home';
    const id = ++nextId, epoch = generation, memberEpoch = memberGeneration;
    const bootstrap = /\/liff\/(?:welcome-context|start|logout)$/.test(path)
      || (path === '/member/api/liff/public-membership/catalog' && (init.method || 'GET').toUpperCase() === 'GET');
    const current = () => epoch === generation && (bootstrap || memberEpoch === memberGeneration);
    tasks.set(id, { panel, stage:0, scope:bootstrap ? 'bootstrap' : 'member', key:(init.method || 'GET').toUpperCase() + ':' + String(url) }); publish(panel);
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (init.signal?.aborted) abort();
    init.signal?.addEventListener('abort', abort, { once:true });
    const readOnly = ["GET", "HEAD"].includes((init.method || "GET").toUpperCase());
    const timer = setTimeout(abort, readOnly ? timeoutMs : mutationTimeoutMs);
    let failed = false;
    try {
      const response = await request(url, { ...init, signal:controller.signal });
      if (current()) { tasks.get(id).stage = 1; publish(panel); }
      // Keep the bar and existing serialized session lane until the body is read.
      // No claimed byte percentage: Content-Length may describe compressed data.
      if (response.body?.getReader) {
        const reader = response.body.getReader(), chunks = [];
        let size = 0;
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.byteLength;
            if (size > 2 * 1024 * 1024) throw new Error('customer_response_too_large');
            chunks.push(part.value);
          }
        } catch (error) { await reader.cancel().catch(() => {}); throw error; }
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        if (!current()) throw new Error("customer_response_stale");
        failed = !response.ok;
        return new Response(response.status === 204 ? null : bytes, {
          status:response.status, statusText:response.statusText, headers:response.headers,
        });
      }
      if (!current()) throw new Error("customer_response_stale");
      failed = !response.ok;
      return response;
    } catch (error) { failed = true; throw error; }
    finally {
      clearTimeout(timer);
      init.signal?.removeEventListener('abort', abort);
      if (current()) finish(id, panel, failed);
    }
  }
  async function waitFor(operation, panel = 'home') {
    const id = ++nextId, epoch = generation;
    tasks.set(id, {panel, stage:0, scope:'bootstrap', key:'sdk-init'}); publish(panel);
    let timer, failed = false;
    try {
      const result = await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('customer_step_timeout')), timeoutMs);
      })]);
      if (epoch !== generation) throw new Error('customer_step_stale');
      return result;
    } catch (error) { failed = true; throw error; }
    finally { clearTimeout(timer); if (epoch === generation) finish(id, panel, failed); }
  }
  return { fetch:fetchWithProgress, reset, waitFor };
}

export function renderCustomerProgress(panel, state) {
  const boot = document.getElementById('customer-boot-progress');
  const bootBar = document.getElementById('hype-progress');
  const bootRetry = document.getElementById('customer-boot-retry');
  if (boot?.dataset && state.overallPending !== undefined) {
    if (state.reset) boot.dataset.confirmedPercent = '0';
    if (state.overallPending) boot.dataset.confirmedPercent = String(state.overallPercent);
    const percent = boot.dataset.confirmedPercent === '50' ? '50%' : '0%';
    boot.textContent = state.overallError && !state.overallPending ? 'เปิดข้อมูลไม่สำเร็จครับ กรุณาเปิดหน้าใหม่'
      : percent + ' · ความคืบหน้าขั้นตอน · ' + (state.overallPending ? 'กำลังรอหรืออ่านข้อมูล' : 'กำลังเตรียมหน้า');
    if (bootBar) bootBar.hidden = state.overallError && !state.overallPending;
    if (bootRetry?.dataset) {
      bootRetry.hidden = !state.overallError || state.overallPending > 0;
      if (!bootRetry.dataset.bound) { bootRetry.dataset.bound = 'true'; bootRetry.addEventListener('click', () => window.location.reload()); }
    }
  }
  const profile = document.getElementById('profile');
  const host = document.getElementById(panel === 'home' && profile?.classList.contains('hidden') ? 'customer-entry-progress' : panel);
  if (!host || !document.createElement || !host.prepend) return;
  const id = 'customer-progress-' + panel;
  let node = document.getElementById(id);
  if (!node) {
    node = document.createElement('div'); node.id = id; node.className = 'customer-progress';
    node.innerHTML = '<progress aria-label="กำลังรับข้อมูล"></progress><span role="status" aria-live="polite"></span><span class="customer-icon customer-progress-error" data-mmd-icon="icon-error" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3v.1"/></svg></span><button type="button" hidden><span class="customer-icon" data-mmd-icon="icon-retry" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 8a9 9 0 1 0 1 8M21 3v6h-6"/></svg></span>เปิดหน้าใหม่</button>';
    node.querySelector('button').addEventListener('click', () => window.location.reload());
    host.prepend(node);
  } else if (node.parentElement !== host) {
    node.parentElement?.setAttribute('aria-busy', 'false');
    host.prepend(node);
  }
  host.setAttribute('aria-busy', String(state.pending > 0));
  if (node.dataset) node.dataset.state = state.pending ? 'loading' : state.error ? 'error' : 'ready';
  node.hidden = !state.pending && !state.error;
  node.querySelector('progress').hidden = !state.pending;
  node.querySelector('span').textContent = state.pending
    ? (state.confirmedPercent === 50 ? '50% · ความคืบหน้าขั้นตอน · กำลังอ่านข้อมูล' : '0% · กำลังรอข้อมูล') : state.error ? 'รับข้อมูลไม่สำเร็จครับ เปิดหน้าใหม่เพื่อตรวจสอบอีกครั้ง โดยไม่ส่งรายการเดิมซ้ำอัตโนมัติ' : '';
  node.querySelector('button').hidden = !state.error || state.pending > 0;
}
