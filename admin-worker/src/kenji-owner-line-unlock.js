import { readKenjiRuntimeControlVersions } from './kenji-control-actions.js';

export const OWNER_LINE_PAGE = '/internal/ceo/kenji-control';
export const OWNER_LINE_STATE = 'kenji_line_unlock_state';

export function lineUnlockReady(controls) {
  const line = controls?.line_oa_auto_reply;
  const model = controls?.model_keyword_auto_reply;
  const all = controls?.all_kenji_mutations;
  return line?.enabled === true && Number.isSafeInteger(line.version) && line.version > 0
    && model?.enabled === true && Number.isSafeInteger(model.version) && model.version > 0
    && all?.enabled === false && Number.isSafeInteger(all.version) && all.version >= 0;
}

export function globalUnlockReady(controls) {
  const line = controls?.line_oa_auto_reply;
  const model = controls?.model_keyword_auto_reply;
  const all = controls?.all_kenji_mutations;
  return line?.enabled === true && Number.isSafeInteger(line.version) && line.version > 0
    && model?.enabled === true && Number.isSafeInteger(model.version) && model.version > 0
    && all?.enabled === true && Number.isSafeInteger(all.version) && all.version > 0;
}

// Static browser source must not capture Wrangler's Worker-only name helpers.
export const OWNER_LINE_CLIENT = [
  "function installOwnerLineUnlock(ready, globalReady) {",
  "  const root = document.getElementById('kenji-owner-line-unlock');",
  "  const button = root.querySelector('button');",
  "  const globalButton = root.querySelector('[data-global-unlock]');",
  "  const refresh = root.querySelector('[data-refresh]');",
  "  const output = root.querySelector('[role=\"status\"]');",
  "  const readUrl = '/internal/ceo/kenji-control?kenji_line_unlock_state=1';",
  "  let state = null;",
  "  let busy = false;",
  "  async function request(url, options = {}) {",
  "    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store',",
  "      redirect: 'error', signal: AbortSignal.timeout(10000), ...options });",
  "    const body = await response.json();",
  "    if (!response.ok || body.ok !== true) throw new Error('control_unavailable');",
  "    return body;",
  "  }",
  "  async function read() {",
  "    const body = await request(readUrl);",
  "    return body.controls;",
  "  }",
  "  function same(a, b) { return a?.enabled === b?.enabled && a?.version === b?.version; }",
  "  function show(controls) {",
  "    const line = controls?.line_oa_auto_reply;",
  "    const model = controls?.model_keyword_auto_reply;",
  "    const all = controls?.all_kenji_mutations;",
  "    output.textContent = `Pause รวม: ${all?.enabled === true ? 'ACTIVE' : all?.enabled === false ? 'CLEAR' : 'UNKNOWN'} (v${all?.version ?? '?'}) · LINE kill switch: ${line?.version > 0 ? line.enabled === true ? 'ACTIVE' : line.enabled === false ? 'CLEAR' : 'UNKNOWN' : 'UNKNOWN'} (v${line?.version ?? '?'}) · Model kill switch: ${model?.enabled === true && model?.version > 0 ? 'ACTIVE' : 'UNKNOWN / NOT ACTIVE'} (v${model?.version ?? '?'}) · ไม่เปลี่ยน model flag`;",
  "  }",
  "  async function load() {",
  "    if (busy) return;",
  "    busy = true; button.disabled = true; globalButton.disabled = true; refresh.disabled = true;",
  "    try { state = await read(); show(state); }",
  "    catch { state = null; output.textContent = 'อ่าน controls ไม่สำเร็จ — ไม่อนุญาตให้ปลด'; }",
  "    finally { busy = false; refresh.disabled = false; button.disabled = !ready(state); globalButton.disabled = !globalReady(state); }",
  "  }",
  "  globalButton.addEventListener('click', async () => {",
  "    if (busy || !globalReady(state)) return;",
  "    if (!root.querySelector('[data-owner-confirm]').checked) return;",
  "    busy = true; button.disabled = true; globalButton.disabled = true; refresh.disabled = true;",
  "    const before = state;",
  "    state = null;",
  "    try {",
  "      const current = await read();",
  "      if (!globalReady(current) || !Object.keys(before).every(scope => same(before[scope], current[scope]))) throw new Error('state_changed');",
  "      const expected = current.all_kenji_mutations.version;",
  "      const result = await request('/v1/admin/kenji/control/runtime/kill-switch', {",
  "        method: 'POST', headers: { 'Content-Type': 'application/json',",
  "          'Idempotency-Key': `owner-global-unlock-${crypto.randomUUID()}` },",
  "        body: JSON.stringify({ scope: 'all_kenji_mutations', enabled: false, expected_version: expected,",
  "          reason: 'Owner explicitly approved clearing global pause; preserve LINE and Model pauses until separate LINE confirmation' })",
  "      });",
  "      if (result.scope !== 'all_kenji_mutations' || result.enabled !== false",
  "        || result.version !== expected + 1 || !result.audit_id) throw new Error('action_unconfirmed');",
  "      const after = await read();",
  "      if (after.all_kenji_mutations?.enabled !== false || after.all_kenji_mutations.version !== result.version",
  "        || !same(after.line_oa_auto_reply, before.line_oa_auto_reply)",
  "        || !same(after.model_keyword_auto_reply, before.model_keyword_auto_reply)) throw new Error('readback_failed');",
  "      state = after;",
  "      output.textContent = `ปลด Pause รวมและตรวจ readback สำเร็จ (v${result.version}) · มี audit · Pause LINE และ Pause Model คงเดิม · กดอ่านสถานะใหม่เพื่อปลด LINE แยก`;",
  "    } catch {",
  "      output.textContent = 'ยังยืนยันการปลด Pause รวมไม่ได้ — ไม่มีการ retry อัตโนมัติ กดอ่านสถานะใหม่ก่อนดำเนินการต่อ';",
  "    } finally { busy = false; refresh.disabled = false; button.disabled = true; globalButton.disabled = true; }",
  "  });",
  "  refresh.addEventListener('click', load);",
  "  button.addEventListener('click', async () => {",
  "    if (busy || !ready(state)) return;",
  "    if (!root.querySelector('[data-owner-confirm]').checked) return;",
  "    busy = true; button.disabled = true; globalButton.disabled = true; refresh.disabled = true;",
  "    const before = state;",
  "    state = null;",
  "    try {",
  "      const current = await read();",
  "      if (!ready(current) || !Object.keys(before).every(scope => same(before[scope], current[scope]))) throw new Error('state_changed');",
  "      const expected = current.line_oa_auto_reply.version;",
  "      const result = await request('/v1/admin/kenji/control/runtime/kill-switch', {",
  "        method: 'POST', headers: { 'Content-Type': 'application/json',",
  "          'Idempotency-Key': `owner-line-unlock-${crypto.randomUUID()}` },",
  "        body: JSON.stringify({ scope: 'line_oa_auto_reply', enabled: false,",
  "          expected_version: expected,",
  "          reason: 'Owner confirmed deterministic LINE Safe Walk; preserve model OFF and model kill switch' })",
  "      });",
  "      if (result.scope !== 'line_oa_auto_reply' || result.enabled !== false",
  "        || result.version !== expected + 1 || !result.audit_id) throw new Error('action_unconfirmed');",
  "      const after = await read();",
  "      if (after.line_oa_auto_reply?.enabled !== false || after.line_oa_auto_reply.version !== result.version",
  "        || !same(after.model_keyword_auto_reply, before.model_keyword_auto_reply)",
  "        || !same(after.all_kenji_mutations, before.all_kenji_mutations)) throw new Error('readback_failed');",
  "      state = after;",
  "      output.textContent = `ปลด LINE kill switch และตรวจ readback สำเร็จ (v${result.version}) · มี audit · Model kill switch คงเดิม · ไม่เปลี่ยน model flag · ยังไม่ใช่ customer E2E`;",
  "    } catch {",
  "      output.textContent = 'ยังยืนยันการปลดไม่ได้ — ไม่มีการ retry อัตโนมัติ กดอ่านสถานะใหม่ก่อนดำเนินการต่อ';",
  "    } finally { busy = false; refresh.disabled = false; button.disabled = true; }",
  "  });",
  "  return load();",
  "}",
].join('\n');

export function ownerLinePanel() {
  return `<section id="kenji-owner-line-unlock" aria-label="Owner LINE safe control" style="margin:16px;padding:20px;border:1px solid #777;background:#171717;color:#fff;border-radius:12px">
<h2>Owner · LINE Safe Walk</h2><p>ปลดเฉพาะ LINE auto-reply kill switch ผ่าน control API เดิม ไม่แก้ model flag, model kill switch, secrets หรือ routes</p>
<label style="display:block;margin:12px 0"><input type="checkbox" data-owner-confirm> ยืนยันปลด Pause ตามปุ่มที่เลือก โดยคง Pause Model ไว้ (ปลด Pause รวมแล้วการแก้ข้อมูลกลับมาทำงานตามสิทธิ์เดิม)</label>
<button type="button" disabled style="min-height:44px">ปลดเฉพาะ LINE kill switch</button>
<button type="button" data-global-unlock disabled style="min-height:44px">ปลด Pause รวม · คง Pause LINE และ Model</button>
<button type="button" data-refresh style="min-height:44px">อ่านสถานะใหม่</button>
<p role="status" aria-live="polite">กำลังอ่าน controls — ยังไม่อนุญาตให้ปลด</p></section>
<script>(${OWNER_LINE_CLIENT})(${lineUnlockReady.toString()}, ${globalUnlockReady.toString()});</script>`;
}

export async function handleOwnerLinePage(request, env, actor, page) {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname !== OWNER_LINE_PAGE) return page();
  const stateRequest = url.searchParams.get(OWNER_LINE_STATE) === '1';
  const headers = { 'cache-control': 'private, no-store', vary: 'Cookie', 'x-content-type-options': 'nosniff' };
  if (actor?.role !== 'owner') return stateRequest
    ? Response.json({ ok: false, error: 'owner_required' }, { status: 403, headers }) : page();
  if (stateRequest) {
    try { return Response.json({ ok: true, controls: await readKenjiRuntimeControlVersions(env) }, { headers }); }
    catch { return Response.json({ ok: false, error: 'runtime_control_unavailable' }, { status: 503, headers }); }
  }
  const response = await page();
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return response;
  const rewritten = new HTMLRewriter().on('body', { element(element) { element.prepend(ownerLinePanel(), { html: true }); } }).transform(response);
  const result = new Response(rewritten.body, rewritten);
  for (const [key, value] of Object.entries(headers)) result.headers.set(key, value);
  result.headers.delete('content-length');
  result.headers.delete('etag');
  return result;
}
