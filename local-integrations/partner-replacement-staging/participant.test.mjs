import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { participantApi } from './participant.mjs';
import { withPartnerReplacement } from './console-qa-adapter.mjs';
import { openParticipantService } from './render-entry.mjs';

test('verified identities alone control staging review, assignment, and acknowledgment', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'participant-api-'));
  const roles = ['owner','partner','modelA','modelB','customer'];
  const bindings = Object.fromEntries(roles.map(role => [role, 'test-sub-' + role]));
  const origin = 'https://partner-replacement-staging.onrender.com', audience = '123456';
  const qaOrigin = 'https://my-model-developing-console-qa.malemodel-bkk.workers.dev';
  const replacementUrl = qaOrigin + '/sigil/model/console/partner-replacement/';
  const envService = { RENDER:'true', RENDER_EXTERNAL_HOSTNAME:new URL(origin).host,
    REPLACEMENT_STAGING_ENABLED:'true', REPLACEMENT_DEVELOPING_CHANNEL_ID:audience,
    REPLACEMENT_DEVELOPING_LIFF_ID:audience + '-mock', REPLACEMENT_TEST_BINDINGS_JSON:JSON.stringify(bindings) };
  const boot = () => openParticipantService(envService, () => dir);
  let { store } = boot();
  t.after(async () => { await store.close(); await rm(dir, { recursive:true }); });
  const modelB = 'model_STAGE_B', sessionId = 'sess_STAGE_PARTNER_001';
  const config = { origin, audience, bindings, store, enabled: true, now: () => 9000,
    verifyFetch: async (url, options) => {
      assert.equal(url, 'https://api.line.me/oauth2/v2.1/verify');
      assert.equal(options.body.get('client_id'), audience);
      const id = options.body.get('id_token');
      if (id === 'outage') throw Error();
      return Response.json({ iss:'https://access.line.me', sub:'test-sub-' + id, exp:id === 'expired' ? 9 : 100,
        aud:id === 'wrong' ? '0' : audience });
    }};
  let backend = participantApi(config);
  const qa = withPartnerReplacement({ fetch: req => new Response(new URL(req.url).pathname) }, req => backend(req));
  const env = { CONSOLE_QA_REPLACEMENT_ENABLED:'true', CONSOLE_QA_REPLACEMENT_HOST:new URL(origin).host };
  const handle = request => qa.fetch(request, env);
  const request = (role, input, requestOrigin = qaOrigin) => new Request(replacementUrl + (input ? 'staging/action' : 'staging/job'), {
    method: input ? 'POST' : 'GET', headers: { ...(role && { authorization:'Bearer ' + role }), origin:requestOrigin,
      'content-type':'application/json' }, body:input ? JSON.stringify(input) : undefined,
  });
  assert.throws(() => participantApi({ ...config, bindings:{ ...bindings, owner:bindings.customer } }));
  assert.equal((await withPartnerReplacement({}, participantApi({ ...config, enabled:false })).fetch(request('owner'), env)).status,503);
  assert.equal((await qa.fetch(request('owner'), {})).status,404);
  assert.equal((await qa.fetch(request('owner'), { ...env, CONSOLE_QA_REPLACEMENT_HOST:'mmdbkk.com' })).status,503);
  for (const path of ['/sigil/model/console', '/sigil/model/console/private-jobs', '/qa/partner-replacement/']) {
    assert.equal(await (await handle(new Request(qaOrigin + path))).text(), path);
  }
  for (const [role, status] of [[null,401],['expired',401],['wrong',401],['unknown',403],['outage',503],['modelB',403]])
    assert.equal((await handle(request(role))).status,status);
  const before = await (await handle(request('modelA'))).json();
  const review = { action:'review', session_id:sessionId, revision:before.revision, generation:before.generation, next_model:modelB };
  assert.equal((await handle(request('owner',review,'https://elsewhere.invalid'))).status,403);
  assert.equal((await handle(request('partner',review))).status,403);
  assert.equal((await handle(request('owner',review))).status,200);
  const replace = { ...review, action:'replace', operation_id:'stage_replace' };
  assert.equal((await handle(request('owner',replace))).status,200);
  assert.equal((await handle(request('modelA'))).status,403);
  const after = await (await handle(request('modelB'))).json();
  assert.equal(after.session_id,'sess_STAGE_PARTNER_001');
  assert.equal(after.session_id,before.session_id);
  assert.equal(after.model,modelB);
  assert.deepEqual(after.schedule,before.schedule);
  const partnerView = await (await handle(request('partner'))).json();
  for (const key of ['session_id', 'generation', 'revision', 'model', 'state', 'schedule', 'job_update']) {
    assert.deepEqual(partnerView[key], after[key], key);
  }
  const issue = { action:'issue_customer_link',session_id:sessionId,revision:after.revision,generation:after.generation,operation_id:'stage_issue' };
  const link = await (await handle(request('owner',issue))).json();
  assert.equal(link.ok,true);
  const ack = { ...issue, action:'acknowledge', operation_id:'stage_ack', link_id:link.link_id };
  assert.equal((await handle(request('modelB',ack))).status,403);
  assert.equal((await handle(request('customer',ack))).status,200);
  assert.equal((await (await handle(request('partner'))).json()).job_update.state,'awaiting_model');
  assert.equal((await handle(new Request(replacementUrl + 'fixture/state'))).status,404);
  await store.close();
  ({ store } = boot());
  backend = participantApi({ ...config, store });
  assert.equal((await handle(request('modelA'))).status,403);
  const refreshed = await handle(request('modelB'));
  assert.equal(refreshed.status,200);
  assert.equal(refreshed.headers.get('cache-control'),'no-store');
  assert.equal((await refreshed.json()).session_id,'sess_STAGE_PARTNER_001');
});

test('participant service reopens only its own disk, origin and enrollment; exposes no preview controls', async t => {
  const { openParticipantService, openParticipantStore, serveParticipant } = await import('./render-entry.mjs');
  assert.throws(() => openParticipantService({ RENDER:'true', RENDER_EXTERNAL_HOSTNAME:'mmdbkk.com' }));
  const dir = await mkdtemp(join(tmpdir(), 'participant-service-'));
  t.after(() => rm(dir, { recursive:true }));
  const path = join(dir, 'hosted.sqlite');
  const config = { origin:'https://partner-replacement-staging.onrender.com', audience:'123456',
    bindings:{ owner:'mock-o',partner:'mock-p',modelA:'mock-a',modelB:'mock-b',customer:'mock-c' },enabled:false };
  await openParticipantStore(path, config).close();
  assert.throws(() => openParticipantStore(path, { ...config, bindings:{ ...config.bindings, owner:'changed' } }));
  assert.throws(() => openParticipantStore(path, { ...config, audience:'123457' }));
  const store = openParticipantStore(path,config);
  const api = participantApi({ ...config,store });
  const server = serveParticipant(api,config.origin);
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await store.close(); });
  // Node's HTTP client sends the proxy Host header exactly as Render must forward it.
  const { get } = await import('node:http');
  const status = (path, host) => new Promise((resolve,reject) =>
    get({ host:'127.0.0.1',port:server.address().port,path,headers:{ host } },res => {
      res.resume(); resolve(res.statusCode);
    }).on('error',reject));
  assert.equal(await status('/healthz','mmdbkk.com'),403);
  assert.equal(await status('/healthz',new URL(config.origin).host),200);
  assert.equal(await status('/staging/job',new URL(config.origin).host),503);
  assert.equal(await status('/fixture/state',new URL(config.origin).host),503);
});

test('participant entry serves the sign-in page and dashboard script from the staging origin', async t => {
  const { serveParticipant } = await import('./render-entry.mjs');
  const server = serveParticipant(() => new Response(null, { status:404 }),
    'https://partner-replacement-staging.onrender.com', '123456-test');
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const { get } = await import('node:http');
  const read = path => new Promise((resolve,reject) => get({
    hostname:'127.0.0.1',port:server.address().port,path,headers:{host:'partner-replacement-staging.onrender.com'},
  },async res => {
    let body = '';
    for await (const part of res) body += part;
    resolve({status:res.statusCode, body});
  }).on('error',reject));
  const page = await read('/');
  assert.equal(page.status,200);
  assert.match(page.body,/data-liff="123456-test"/);
  assert.ok(page.body.includes('src="./participant-ui.js"'));
  const script = await read('/participant-ui.js');
  assert.equal(script.status,200);
  assert.ok(script.body.includes("call('job')"));
  assert.equal((await read('/fixture/state')).status,404);

  const qa = withPartnerReplacement({}, async request => {
    const asset = await read(new URL(request.url).pathname);
    return new Response(asset.body, { status:asset.status });
  });
  const env = { CONSOLE_QA_REPLACEMENT_ENABLED:'true', CONSOLE_QA_REPLACEMENT_HOST:'partner-replacement-staging.onrender.com' };
  const entry = new URL('https://my-model-developing-console-qa.malemodel-bkk.workers.dev/sigil/model/console/partner-replacement/');
  const mounted = await qa.fetch(new Request(entry),env);
  assert.equal(mounted.status,200);
  const relativeScript = (await mounted.text()).match(/src="(\.\/participant-ui\.js)"/)?.[1];
  assert.ok(relativeScript);
  const asset = await qa.fetch(new Request(new URL(relativeScript,entry)),env);
  assert.equal(asset.status,200);
  assert.equal(await asset.text(),script.body);
});

test('closed Render entry serves health without LINE settings or SQLite, including on restart', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'closed-render-'));
  t.after(() => rm(dir, { recursive:true }));
  const host = 'partner-replacement-staging.onrender.com';
  const env = { RENDER:'true', RENDER_EXTERNAL_HOSTNAME:host, REPLACEMENT_STAGING_ENABLED:'false' };
  for (const key of ['REPLACEMENT_TEST_BINDINGS_JSON','REPLACEMENT_DEVELOPING_CHANNEL_ID','REPLACEMENT_DEVELOPING_LIFF_ID']) {
    Object.defineProperty(env, key, { get() { throw Error('Unexpected enrollment access'); } });
  }
  assert.throws(() => openParticipantService(env, () => { throw Error('missing mount'); }), /missing mount/);
  const { request } = await import('node:http');
  for (let run = 0; run < 2; run++) {
    const { server, store } = openParticipantService(env, () => dir);
    assert.equal(store,null);
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    try {
      for (const [method,path,status] of [['GET','/healthz',200],['GET','/staging/job',503],['POST','/staging/action',503]]) {
        const res = await new Promise((resolve,reject) => request({
          hostname:'127.0.0.1', port:server.address().port, headers:{ host }, method, path,
        },resolve).on('error',reject).end());
        let body = '';
        for await (const chunk of res) body += chunk;
        assert.equal(res.statusCode,status);
        assert.deepEqual(JSON.parse(body),status === 200 ? { ok:true } : { ok:false,code:'staging_gate_closed' });
      }
    } finally { await new Promise(resolve => server.close(resolve)); }
    assert.deepEqual(await readdir(dir),[]);
  }
});

test('enabled startup rejects wrong channel or incomplete enrollment before creating SQLite', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'invalid-render-'));
  t.after(() => rm(dir, { recursive:true }));
  const env = { RENDER:'true', RENDER_EXTERNAL_HOSTNAME:'partner-replacement-staging.onrender.com',
    REPLACEMENT_STAGING_ENABLED:'true', REPLACEMENT_DEVELOPING_CHANNEL_ID:'123456' };
  for (const [id,error] of [['999999-mock',/Matching Developing/],['123456-mock',/Five distinct/]]) {
    assert.throws(() => openParticipantService({ ...env,REPLACEMENT_DEVELOPING_LIFF_ID:id }, () => dir),error);
    assert.deepEqual(await readdir(dir),[]);
  }
});
