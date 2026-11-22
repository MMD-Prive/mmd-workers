import test from 'node:test';
import assert from 'node:assert/strict';
import {handleCoModelOwner} from './src/co-model-owner.js';
import {createIntake} from '../partners-worker/src/co-model-intake.mjs';
const origin = 'https://fixture.invalid';
const url = origin + '/internal/admin/console/co-model-requests';
const partnerId = 'recAAAAAAAAAAAAAA';
for (const mode of ['Bridge', 'รวมโม', 'หารกำไร']) {
  test(mode + ' · Owner selection, issue and retry', async () => {
    const rows = new Map();
    const intake = createIntake({store:{async update(id, change) {
      const [record, result] = change(rows.get(id));
      if (record) rows.set(id, record);
      return result;
    }}, authenticatePartner: async () => ({id:partnerId}), now:()=>0, randomId:()=> 'fixture-link'});
    const env = {CO_MODEL_OWNER:{
      recipients:async()=>[{id:partnerId,name:'<Partner>'}],
      issue:(id,draft)=> draft.partnerId === partnerId
        ? intake.manage({role:'owner'},id,'issue_once',draft) : {status:403},
    }};
    const owner = {role:'owner'};
    const form = await (await handleCoModelOwner(new Request(url),env,owner)).text();
    assert.match(form,/&lt;Partner&gt;/);
    const draft = form.match(/name="draft" value="([^"]+)"/)[1];
    const submit = (actor, partner=partnerId, source=origin) => handleCoModelOwner(new Request(url,{
      method:'POST',headers:{origin:source},
      body:new URLSearchParams({draft,partner,mode,description:'fixture'}),
    }),env,actor);
    assert.equal((await submit({role:'partner'})).status,403);
    assert.equal((await submit(owner,partnerId,'https://other.invalid')).status,403);
    assert.equal((await submit(owner,'recBBBBBBBBBBBBBB')).status,403);
    assert.equal(rows.size,0);
    const first = await submit(owner);
    assert.equal(first.status,201);
    const html = await first.text();
    assert.match(html,/link=fixture-link/);
    assert.doesNotMatch(html,/[?&]t=/);
    assert.equal(await (await submit(owner)).text(),html);
    assert.equal(rows.size,1);
    assert.equal(rows.get(draft).mode,mode);
    assert.equal(rows.get(draft).expiresAt,172800000);
  });
}
