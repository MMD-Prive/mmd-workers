import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenewalView } from '../src/liff-renewal-view.js';
function harness(response, refreshIdentity) {
  const nodes = new Map(), calls = [], views = [];
  const node = () => ({ textContent:'', hidden:false, disabled:false, children:[], handlers:{}, addEventListener(k, fn){this.handlers[k]=fn;}, append(...v){this.children.push(...v);}, replaceChildren(...v){this.children=v;} });
  const get = id => { if(id==='rn-logo-image') return null; if(!nodes.has(id)) nodes.set(id,node()); return nodes.get(id); };
  const fields = ['premium','standard'].map(value => ({...node(),value,checked:false}));
  const ui = createRenewalView({document:{getElementById:get,querySelectorAll:()=>fields,createElement:node},fetcher:async (path,init)=>{calls.push({path,init}); return response();},navigate:()=>{throw new Error('unexpected navigation');},showView:view=>views.push(view),checkoutUrl:()=>'',getBusy:()=>false,setBusy:()=>{},refreshIdentity});
  return {get,calls,views,ui,fields};
}
test('unlinked renewal stays in Renewal, requests only canonical offer, never checkout or Home', async()=>{
  const h=harness(()=>Response.json({ok:false},{status:401}));
  await h.ui.lookup();
  assert.deepEqual(h.views,['package']); assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].path,'/member/api/liff/renewal/offer'); assert.equal(h.calls[0].init.method,undefined);
  assert.equal(h.get('renewal-action').disabled,true); assert.equal(h.get('rn-retry').hidden,false);
  await h.ui.purchase(); assert.equal(h.calls.length,1);
});
test('review/over-90-day and upstream errors stay unknown, price guard unchanged',async()=>{
  for(const response of [()=>Response.json({ok:true,status:'contact_owner',reason:'renewal_expired_over_90_days_review_required'}),()=>Response.json({ok:false},{status:503})]) {
    const h=harness(response); await h.ui.lookup();
    assert.equal(h.get('renewal-amount').textContent,'—'); assert.equal(h.get('renewal-action').disabled,true);
    assert.equal(h.get('rn-retry').hidden,false); assert.deepEqual(h.views,['package']);
  }
});
test('already-paid choice cannot create or re-enable another payment',async()=>{
  const h=harness(()=>Response.json({ok:false},{status:503}));
  h.get('rn-paid-help').textContent='review original proof; not bank verified';
  h.get('rn-already-paid').handlers.click(); await h.ui.purchase();
  h.ui.render({ok:true,status:'ready',payment_available:true,amount_thb:2500});
  assert.equal(h.calls.length,0); assert.equal(h.get('renewal-action').disabled,true);
  assert.equal(h.get('rn-paid-help').hidden,false); assert.ok(h.fields.every(f=>f.disabled));
});
test('retry reuses LIFF resolver before offer read; resolver failure cannot open checkout',async()=>{
  let refreshes=0;
  const h=harness(()=>Response.json({ok:true,status:'contact_owner'}),async()=>{refreshes++;});
  await h.ui.retry(); assert.equal(refreshes,1); assert.equal(h.calls.length,1);
  const failed=harness(()=>{throw new Error('must not call offer');},async()=>{throw new Error('upstream unavailable');});
  await failed.ui.retry(); assert.equal(failed.calls.length,0); assert.equal(failed.get('renewal-action').disabled,true);
});
