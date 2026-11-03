import assert from "node:assert/strict";
import { test } from "node:test";

import {
  modelMiniAppHandoffUrl,
  resolveJobBoardContextFromRequest,
  shouldServePhaseAAfterBootstrap,
} from "./src/index.js";
import { modelLiffDigitalBootstrapHtml } from "./src/model-liff-digital-shell.js";

test("job board handoff preserves owner assigned model alias", () => {
  const request = new Request("https://www.mmdbkk.com/sigil/model/dashboard?intent=job_board&source=refund_completed_pack&job_id=JOB-FILM-J-20260929&model_alias=Film%20J&model_record_id=recFilmJ&next=https%3A%2F%2Fsigil.mmdbkk.com%2Fpublic%2Fapi%2Fjobs%2FJOB-FILM-J-20260929");
  const context = resolveJobBoardContextFromRequest(request);
  assert.equal(context.model_alias, "Film J");
  assert.equal(context.model_record_id, "recFilmJ");
  const handoff = new URL(modelMiniAppHandoffUrl(request));
  assert.equal(handoff.origin, "https://miniapp.line.me");
  assert.equal(handoff.searchParams.get("model_alias"), "Film J");
  assert.equal(handoff.searchParams.get("model_record_id"), "recFilmJ");
});

test("job board after LIFF bootstrap cannot fall into apply onboarding", () => {
  const request = new Request("https://www.mmdbkk.com/sigil/model/dashboard?intent=job_board&job_id=JOB-FILM-J-20260929", {
    headers: { cookie: "mmd_liff_boot=1" },
  });
  assert.equal(shouldServePhaseAAfterBootstrap(request), false);
});

test("customer-selected model gets selected-job copy, not applicant Welcome V2", () => {
  const html = modelLiffDigitalBootstrapHtml({
    liffId: "2010864854-N34SgCqq",
    fallback: "https://miniapp.line.me/2010864854-N34SgCqq/",
    sdk: "https://static.line-scdn.net/liff/edge/2/sdk.js",
    jobBoard: {
      job_id: "JOB-FILM-J-20260929",
      next: "https://sigil.mmdbkk.com/public/api/jobs/JOB-FILM-J-20260929",
      model_alias: "Film J",
      model_record_id: "recFilmJ",
    },
  });
  assert.match(html, /ลูกค้าเลือกคุณสำหรับงานนี้/);
  assert.match(html, /งานนี้ส่งตรงถึง Film J/);
  assert.match(html, /ไม่ใช่หน้าสมัครงาน/);
  assert.match(html, /เปิดรายละเอียดงานนี้/);
  assert.doesNotMatch(html, /WELCOME V2 · สมัครงานนี้กับ MMD/);
  assert.doesNotMatch(html, /ยืนยันตัวตนสำหรับงาน/);
  assert.doesNotMatch(html, /สมัครเป็นโมเดล MMD/);
  assert.match(html, /model_alias/);
});

test("public job board entry keeps Per-led Welcome and returns unlinked visitors to the board", () => {
  const html = modelLiffDigitalBootstrapHtml({
    liffId: "2010864854-N34SgCqq",
    fallback: "https://miniapp.line.me/2010864854-N34SgCqq/",
    sdk: "https://static.line-scdn.net/liff/edge/2/sdk.js",
    jobBoard: {
      job_id: "JOB-20260929-05F8B7666EC7",
      next: "https://sigil.mmdbkk.com/public/api/jobs/JOB-20260929-05F8B7666EC7",
    },
  });
  assert.match(html, /ส่งข้อมูลส่วนตัว/);
  assert.match(html, /เริ่มส่งข้อมูล/);
  assert.match(html, /ต้องการแก้ไขหรือลบข้อมูล/);
  assert.match(html, /t\.me\/per_mmd/);
  assert.match(html, /window\.location\.replace\("https:\/\/sigil\.mmdbkk\.com\/public\/api\/jobs"\)/);
  assert.doesNotMatch(html, /intake|flow","apply/);
  assert.match(html, /job_id/);
  assert.match(html, /intent:"job_board"/);
  assert.match(html, /identity_review_required/);
  assert.match(html, /fallback\.addEventListener\("click"/);
  assert.doesNotMatch(html, /ลูกค้าเลือกคุณสำหรับงานนี้/);
  assert.doesNotMatch(html, /ยืนยันตัวตน|กำลังตรวจสอบตัวตน|สมัครสมาชิก/);
});

// Exercise the emitted browser script with a synthetic SDK and exchange reply;
// no real LINE credentials or production writes are involved.
async function runJobBoardEntry(jobBoard, exchangeReply) {
  const { runInNewContext } = await import('node:vm');
  const { setImmediate: tick } = await import('node:timers/promises');
  const nodes = Object.fromEntries(['status', 'session-pill', 'fallback', 'detail', 'loading-meter'].map(id => [id, {
    textContent: '', hidden: false, addEventListener(_type, listener) { this.click = listener; },
  }]));
  const redirects = [], requests = [];
  const html = modelLiffDigitalBootstrapHtml({ liffId: 'synthetic-liff-id', sdk: '', fallback: 'https://miniapp.line.me/2010864854-N34SgCqq/', jobBoard });
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  await runInNewContext(script, {
    URL, URLSearchParams, setTimeout, clearTimeout, AbortController,
    document: { getElementById: id => nodes[id] },
    window: { liff: { init: async () => {}, getIDToken: () => 'SYNTHETIC_NO_REAL_CREDENTIAL' }, location: { replace: url => redirects.push(url) } },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (url === '/v1/model/liff/exchange') return { status: exchangeReply.status, ok: exchangeReply.status >= 200 && exchangeReply.status < 300, json: async () => exchangeReply.body };
      assert.ok(url.startsWith('/v1/model/job-board/handoff?'));
      return { status: 200, ok: true, json: async () => ({ ok: true, redirect_url: 'https://sigil.mmdbkk.com/public/api/jobs/JOB-LINKED?mmd_job_board_handoff=SYNTHETIC' }) };
    },
  });
  if (nodes.fallback.click) nodes.fallback.click({ preventDefault() {} });
  await tick();
  return { redirects, requests, nodes };
}

test('unlinked LINE entry returns to the board for general, Public and Private job links without onboarding or Model handoff', async () => {
  for (const context of [{}, { job_id: 'JOB-PUBLIC', next: 'https://sigil.mmdbkk.com/public/api/jobs/JOB-PUBLIC' }, { job_id: 'JOB-PRIVATE', next: 'https://sigil.mmdbkk.com/public/api/jobs/JOB-PRIVATE' }]) {
    const result = await runJobBoardEntry(context, { status: 202, body: { ok: false, state: 'identity_review_required' } });
    assert.deepEqual(result.redirects, ['https://sigil.mmdbkk.com/public/api/jobs']);
    assert.equal(result.requests.length, 1);
    assert.equal(result.requests[0].url, '/v1/model/liff/exchange');
    assert.equal(JSON.parse(result.requests[0].options.body).intent, 'job_board');
  }
});

test('linked LINE entry keeps the canonical Model handoff and selected job', async () => {
  const result = await runJobBoardEntry({ job_id: 'JOB-LINKED', next: 'https://sigil.mmdbkk.com/public/api/jobs/JOB-LINKED' }, { status: 200, body: { ok: true } });
  assert.equal(result.requests.length, 2);
  assert.ok(result.requests[1].url.includes('job_id=JOB-LINKED'));
  assert.deepEqual(result.redirects, ['https://sigil.mmdbkk.com/public/api/jobs/JOB-LINKED?mmd_job_board_handoff=SYNTHETIC']);
});

test('authentication failures, unknown review states and owner-assigned Model links do not receive the anonymous fallback', async () => {
  for (const reply of [{ status: 401, body: { ok: false, error: 'unauthorized' } }, { status: 503, body: { ok: false } }, { status: 202, body: { ok: false, state: 'other_review' } }]) {
    const result = await runJobBoardEntry({}, reply);
    assert.deepEqual(result.redirects, []);
    assert.equal(result.requests.length, 1);
  }
  const assigned = await runJobBoardEntry({ model_record_id: 'recAssigned', model_alias: 'Assigned', job_id: 'JOB-PRIVATE' }, { status: 202, body: { ok: false, state: 'identity_review_required' } });
  assert.deepEqual(assigned.redirects, []);
  assert.equal(assigned.requests.length, 1);
});
