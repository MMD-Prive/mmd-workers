import test from 'node:test';
import assert from 'node:assert/strict';
import {transactionalIntakeStore} from '../src/co-model-intake-store.mjs';
import {createIntake, renderIntake} from '../src/co-model-intake.mjs';

for (const mode of ['Bridge', 'รวมโม', 'หารกำไร']) {
  test(`${mode} · recipient, deadline, revoke, reissue and replay`, async () => {
    const rows = new Map();
    let queue = Promise.resolve();
    let time = 0;
    let sequence = 0;
    const api = createIntake({
      store: transactionalIntakeStore({transaction(fn) {
        const result = queue.then(() => fn({
          get: key => rows.get(key),
          put: (key, value) => rows.set(key, value),
        }));
        queue = result.catch(() => {});
        return result;
      }}),
      authenticatePartner: async request => ({id: request.headers.get('x-fixture-account')}),
      now: () => time, randomId: () => String(++sequence),
    });
    const owner = {role:'owner'};
    const draft = {mode, partnerId:'fixture-a', description:'<fixture>'};
    const call = (link, account='fixture-a', choice) =>
      api.receive(new Request('https://fixture.invalid/request', {
        method: choice ? 'POST' : 'GET',
        headers:{'x-fixture-account':account,origin:'https://fixture.invalid'},
        body:choice ? new URLSearchParams({choice}) : undefined,
      }), 'fixture-request', link);
    assert.equal((await api.manage({role:'partner'},'fixture-request','issue',draft)).status,403);
    const first = await api.manage(owner,'fixture-request','issue',draft);
    assert.equal(first.expiresAt,172800000);
    assert.deepEqual(await call(first.linkId,'fixture-b'),{status:404});
    assert.deepEqual(await call(first.linkId,'fixture-b','interested'),{status:404});
    assert.match(await renderIntake(await call(first.linkId)).text(), /&lt;fixture&gt;/);
    time = first.expiresAt;
    assert.equal((await call(first.linkId)).status,410);
    assert.equal((await call(first.linkId,'fixture-a','interested')).status,410);
    const second = await api.manage(owner,'fixture-request','issue');
    await api.manage(owner,'fixture-request','revoke');
    assert.equal((await call(second.linkId)).status,404);
    const third = await api.manage(owner,'fixture-request','issue');
    const fourth = await api.manage(owner,'fixture-request','issue');
    assert.equal((await call(third.linkId)).status,404);
    const [answer, concurrent] = await Promise.all([call(fourth.linkId,'fixture-a','interested'), call(fourth.linkId,'fixture-a','declined')]);
    assert.deepEqual(answer, concurrent);
    assert.equal(answer.answer.choice,'interested');
    assert.deepEqual(await call(fourth.linkId,'fixture-a','declined'),answer);
    assert.equal(rows.size,1);
  });
}
