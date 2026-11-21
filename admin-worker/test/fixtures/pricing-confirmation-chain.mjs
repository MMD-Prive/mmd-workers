import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { handleCreateJobWorkerPage } from '../../src/create-job-worker-page.js';
import { run } from './pricing-chain-storage.mjs';
import { signConfirmToken, createConfirmTokenRecord } from '../../../payments-worker/index.js';
import { handleConfirmationDetails } from '../../../payments-worker/confirmation-details.js';
import { handlePaymentInstructions } from '../../../payments-worker/payment-instructions-v1.js';
const require = createRequire(import.meta.url);
const { JSDOM } = require(require.resolve('jsdom', {paths:[process.env.MMD_UI_TEST_MODULES || process.cwd()]}));

export async function formPayload({discountType='percent',kind='promotion',adjustmentType='amount',adjustment=500,gross=10000,percent=20,visibility='private'}={}) {
  let html = await handleCreateJobWorkerPage(new Request('https://mmdbkk.com/internal/admin/jobs/create-job')).text();
  html = html.replace('setStep(0);loadRequestedClient()', 'window.__pricingFixture={readPayload,select:(c,m)=>{client=c;model=m}};setStep(0);loadRequestedClient()');
  const errors=[];
  const dom = new JSDOM(html,{url:'https://mmdbkk.com/internal/admin/jobs/create-job',runScripts:'dangerously',beforeParse(w){
    w.scrollTo=()=>{};w.fetch=()=>{throw Error('Unexpected form request')};
    w.addEventListener('error',event=>errors.push(event.error));
  }});
  const w=dom.window, doc=w.document;
  const fill=(id,value)=>{const input=doc.getElementById(id);assert.ok(input,id);input.value=String(value);input.dispatchEvent(new w.Event('input',{bubbles:true}));input.dispatchEvent(new w.Event('change',{bubbles:true}));};
  doc.querySelector('input[name="visibility"][value="'+visibility+'"]').click();
  for(const [id,value] of Object.entries({ptype:'pn',folder:'standard',orientation:'gay',publicFormat:'event',publicFolder:'travel',duties:'Demo hosting',customerCount:2,date:'2026-11-28',time:'18:00',duration:120,location:'MMD · Demo location',amount:gross,payout:6000,modelAdjustType:adjustmentType,modelAdjustValue:adjustment,modelAdjustReason:'Demo agreed rate adjustment',discType:discountType}))fill(id,value);
  fill('discValue',discountType==='percent'?percent:2000);fill('discKind',kind);fill('discReason','Demo November offer');
  w.__pricingFixture.select({client_id:'recCLIENT00000001',client_name:'Demo Guest',line_user_id:'U11111111111111111111111111111111'}, {model_id:'recMODEL000000001',model_name:'Mira',model_lookup_key:visibility==='private'?'private/standard/Mira':'public/travel/Mira',visibility,access_folder:visibility==='private'?'standard':'travel'});
  try {assert.deepEqual(errors,[]);return JSON.parse(JSON.stringify(w.__pricingFixture.readPayload()));}
  finally {dom.window.close();}
}

export async function simulatePricingChain(options={}) {
  const input=await formPayload(options);
  const created=await run(input,{privateJob:options.visibility!=='public'});
  assert.equal(created.status,200,JSON.stringify(created.data));
  created.env.ALLOWED_ORIGINS="https://www.mmdbkk.com";
  const claims=[...created.kv.values()].map(value=>JSON.parse(value));
  const call=async(role,endpoint='/v1/confirm/details')=>{
    const subject=claims.find(value=>value.role===role);
    assert.ok(subject,'Persisted role token');
    const token=await signConfirmToken(subject,created.env.PAYMENT_CONFIRMATION_SIGNING_SECRET);
    await createConfirmTokenRecord(created.env,token,subject);
    const request=new Request('https://sigil.mmdbkk.com'+endpoint,{method:'POST',headers:{origin:'https://www.mmdbkk.com','content-type':'application/json'},body:JSON.stringify({t:token,expected_role:role})});
    return endpoint.includes('payment-instructions')
      ? handlePaymentInstructions(request,created.env,next=>handleConfirmationDetails(next,created.env))
      : handleConfirmationDetails(request,created.env);
  };
  const customerResponse=await call('customer');const customer=await customerResponse.json();
  const modelResponse=await call('model');const model=await modelResponse.json();
  assert.equal(customerResponse.status,200,JSON.stringify(customer));assert.equal(modelResponse.status,200,JSON.stringify(model));
  const instructionsResponse=await call('customer','/v1/confirm/payment-instructions');
  const instructions=await instructionsResponse.json();
  return {input,created,customer,model,instructions};
}
