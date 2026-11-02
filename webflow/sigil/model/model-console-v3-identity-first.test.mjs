import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./model-console-v3-i18n.js", import.meta.url), "utf8");

test("Model Console offers registered Mini App recovery without initializing at a sibling endpoint", () => {
  assert.match(source, /new Set\(\["\/v1\/model\/session\/current","\/v1\/model\/session\/action"\]\)/);
  assert.match(source, /miniapp\.line\.me\/2010864854-N34SgCqq/);
  assert.match(source, /return_to","console/);
  assert.doesNotMatch(source, /l\.init|l\.login|return F\(q,b\)/);
  assert.match(source, /x\.status===401/);
  assert.match(source, /model_session_\(required\|invalid\|expired\)/);
  assert.doesNotMatch(source, /x\.status==401\|\|x\.status==403/);
  assert.match(source, /setTimeout\(showLineReturn,0\)/);
  assert.match(source, /Verify LINE and return/);
  assert.match(source, /验证 LINE 并返回工作/);
});

test("Model Console renders only the authenticated model payout returned by the server", async () => {
  const { JSDOM } = await import('jsdom');
  for (const payout of [15000, undefined]) {
    const dom = new JSDOM('<section id="sigil-model-console-v3" data-smc data-current-endpoint="/v1/model/session/current"><div data-view="loading"></div><div data-view="error"></div><div data-view="empty"></div><div data-view="work"><div class="smcv3-summary"></div><div data-primary-actions></div></div></section>', {url:'https://fixture.invalid/sigil/model/console?session_id=sess_A', runScripts:'outside-only'});
    const w = dom.window;
    try {
      w.Request = class Request {};
      w.fetch = async () => ({ok:true,status:200,json:async()=>({ok:true,session:{session_id:'sess_A',state:'confirmed',allowed_actions:[],pay_model_thb:payout,customer_amount_due_thb:99999}})});
      w.eval(source);
      await new Promise(setImmediate);
      await new Promise(setImmediate);
      const row = w.document.querySelector('[data-model-payout-row]');
      if (payout === undefined) assert.equal(row, null, 'customer pricing cannot substitute for missing model payout');
      else {
        assert.ok(row);
        assert.match(row.textContent, /เรทถึงตัว/);
        assert.match(row.textContent, /15,000/);
        assert.doesNotMatch(row.textContent, /99,999/);
      }
    } finally { w.close(); }
  }
});

test("Model Console gives a LINE-return action instead of instructing the model to reopen HYPE", () => {
  assert.match(source, /ยืนยัน LINE เพื่อกลับเข้างาน/);
  assert.match(source, /ยืนยัน LINE แล้วกลับเข้างาน/);
  assert.match(source, /data-model-console-line-return/);
});
