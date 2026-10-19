// Presentation only. No identity, balance or business decision is made here.
export function createCustomerProgress({ render, request, timeoutMs = 15000 }) {
  let generation = 0, memberGeneration = 0, nextId = 0;
  const tasks = new Map(), panels = new Set();
  function publish(panel, error = false) {
    panels.add(panel);
    const active = [...tasks.values()].filter(t => t.panel === panel);
    render(panel, { pending:active.length, confirmedPercent:active.length ? Math.min(...active.map(t => t.stage)) * 50 : 0, error });
  }
  function reset({ memberOnly = false } = {}) {
    memberGeneration++;
    if (!memberOnly) generation++;
    // Ignore late completion; do not abort/replay a business mutation on account reset.
    for (const [id, task] of tasks) if (!memberOnly || task.scope === "member") tasks.delete(id);
    for (const panel of panels) publish(panel);
  }
  async function fetchWithProgress(url, init = {}) {
    const path = String(url).split('?')[0];
    const panel = /history/.test(path) ? 'history-panel' : /credit/.test(path) ? 'credits'
      : /coupon|care-back\/wallet/.test(path) ? 'coupons' : /care|wish/.test(path) ? 'care'
      : /customer.request|evidence/.test(path) ? 'my-requests'
      : /renewal/.test(path) ? 'package' : /catalog|purchase/.test(path) ? 'signup'
      : /session\/current/.test(path) ? 'home' : 'home';
    const id = ++nextId, epoch = generation, memberEpoch = memberGeneration;
    const bootstrap = /\/liff\/(?:welcome-context|start)$/.test(path);
    const current = () => epoch === generation && (bootstrap || memberEpoch === memberGeneration);
    tasks.set(id, { panel, stage:0, scope:bootstrap ? 'bootstrap' : 'member' }); publish(panel);
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (init.signal?.aborted) abort();
    init.signal?.addEventListener('abort', abort, { once:true });
    const timer = setTimeout(abort, timeoutMs);
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
      if (current()) { tasks.delete(id); publish(panel, failed); }
    }
  }
  async function waitFor(operation, panel = 'home') {
    const id = ++nextId, epoch = generation;
    tasks.set(id, {panel, stage:0, scope:'bootstrap'}); publish(panel);
    let timer, failed = false;
    try {
      const result = await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('customer_step_timeout')), timeoutMs);
      })]);
      if (epoch !== generation) throw new Error('customer_step_stale');
      return result;
    } catch (error) { failed = true; throw error; }
    finally { clearTimeout(timer); if (epoch === generation) { tasks.delete(id); publish(panel, failed); } }
  }
  return { fetch:fetchWithProgress, reset, waitFor };
}

export function renderCustomerProgress(panel, state) {
  const profile = document.getElementById('profile');
  const host = document.getElementById(panel === 'home' && profile?.classList.contains('hidden') ? 'customer-entry-progress' : panel);
  if (!host || !document.createElement || !host.prepend) return;
  const id = 'customer-progress-' + panel;
  let node = document.getElementById(id);
  if (!node) {
    node = document.createElement('div'); node.id = id; node.className = 'customer-progress';
    node.innerHTML = '<progress aria-label="กำลังรับข้อมูล"></progress><span role="status" aria-live="polite"></span><button type="button" hidden>เปิดหน้าใหม่</button>';
    node.querySelector('button').addEventListener('click', () => window.location.reload());
    host.prepend(node);
  } else if (node.parentElement !== host) {
    node.parentElement?.setAttribute('aria-busy', 'false');
    host.prepend(node);
  }
  host.setAttribute('aria-busy', String(state.pending > 0));
  node.hidden = !state.pending && !state.error;
  node.querySelector('progress').hidden = !state.pending;
  node.querySelector('span').textContent = state.pending
    ? (state.confirmedPercent === 50 ? '50% · ความคืบหน้าขั้นตอน · กำลังอ่านข้อมูล' : '0% · กำลังรอข้อมูล') : state.error ? 'รับข้อมูลไม่สำเร็จครับ เปิดหน้าใหม่เพื่อตรวจสอบอีกครั้ง โดยไม่ส่งรายการเดิมซ้ำอัตโนมัติ' : '';
  node.querySelector('button').hidden = !state.error || state.pending > 0;
}
