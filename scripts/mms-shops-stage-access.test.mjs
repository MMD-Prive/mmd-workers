import test from 'node:test';
import assert from 'node:assert/strict';
import { stageActorForPersona } from './mms-shops-stage-access.mjs';
import { StageShopLedger } from '../mms-worker/src/shop-ledger-stage.mjs';

test('each Stage persona has fixed scope, independent of the requested shop', async () => {
  const ledger=new StageShopLedger({get:async()=>undefined});
  for(const shop of ['kalima','relax']){
    const actor=stageActorForPersona('partner-'+shop);
    assert.deepEqual(actor.shop_keys,[shop]);
    assert.equal((await ledger.snapshot(actor,shop)).shop_key,shop);
    await assert.rejects(()=>ledger.snapshot(actor,shop==='kalima'?'relax':'kalima'),{code:'STAGE_SHOP_ACCESS_DENIED'});
    await assert.rejects(()=>ledger.quote(actor,shop,{}),{code:'OWNER_REQUIRED'});
  }
  for(const shop of ['kalima','relax'])assert.equal((await ledger.snapshot(stageActorForPersona('owner'),shop)).shop_key,shop);
});
test('unknown and real Partner names cannot become synthetic shop personas',()=>{
  for(const id of ['partner','partner_kendo','Kendo','kalima','__proto__',''])assert.throws(()=>stageActorForPersona(id),/STAGE_PERSONA_REQUIRED/);
  const actor=stageActorForPersona('partner-kalima');actor.shop_keys.push('relax');
  assert.deepEqual(stageActorForPersona('partner-kalima').shop_keys,['kalima']);
});
