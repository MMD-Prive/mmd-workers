// Synthetic browser checks only; all outbound requests are aborted.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createRenewalView,renewalViewHtml,RENEWAL_VIEW_CSS} from '../member-pages-worker/src/liff-renewal-view.js';
import {resolveCanonicalRenewalOffer} from '../member-pages-worker/src/renewal-offer.js';
import {LIFF_RENEWAL_CARD_INTERNALS as internals} from '../member-pages-worker/src/liff-renewal-card.js';
const require=createRequire(import.meta.url);const {chromium}=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright') : require('playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.RENEWAL_BROWSER_EXECUTABLE,args:['--no-sandbox']});
const results=[];const now=new Date('2026-11-04T09:00:00Z');
try{for(const tier of ['standard','premium'])for(const width of [320,360,390,430]){
const page=await browser.newPage({viewport:{width,height:844}});let pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));await page.route('**/*',r=>r.abort());
const offer=await resolveCanonicalRenewalOffer({},{liff_intent:'renew',member_exists:true,line_user_id:'U'+'a'.repeat(32),member_profile:{tier,membership_status:'active',membership_expires_at:'2027-01-31T17:15:00Z'}},now);
const payload={...offer,ok:true,payment_available:true,pricing_policy:'renewal_90_days_20261027',current_expires_at:'2027-01-31T17:15:00.000Z',renewal_starts_at:offer.membership_start_at,new_expires_at:internals.expiryAfter(offer),bonus_days:offer.promotion?.bonus_days||0,bonus_years:offer.promotion?.bonus_years||0,bonus_months:0,promotion_label:internals.promoLabel(offer.promotion),official_verification_required:true,entitlement_granted:false};
await page.setContent('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{margin:0;background:#0B0E10;color:#F3F0E8;font-family:system-ui}'+RENEWAL_VIEW_CSS+'</style>'+renewalViewHtml(now));
await page.evaluate(async({source,payload,tier})=>{const ui=eval('('+source+')')({document,fetcher:async()=>Response.json(payload),navigate:()=>{},showView:()=>document.getElementById('renewal-card').hidden=false,checkoutUrl:u=>u,getBusy:()=>false,setBusy:()=>{}});await ui.load(tier);},{source:createRenewalView.toString(),payload,tier});
const metrics=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth,ctaEnabled:!document.getElementById('renewal-action').disabled,selection:document.getElementById('rn-selection').textContent,banner:!!document.querySelector('.rn-campaign'),position:getComputedStyle(document.querySelector('.rn-checkout')).position}));
assert.ok(metrics.scroll<=width,JSON.stringify(metrics));assert.equal(metrics.ctaEnabled,true);assert.equal(metrics.banner,false);assert.equal(metrics.position,'relative');assert.deepEqual(pageErrors,[]);results.push({tier,width,...metrics});
if(width===390)await page.screenshot({path:new URL('../docs/previews/renewal-recheck-'+tier+'-390.png',import.meta.url).pathname,fullPage:true});await page.close();}
writeFileSync(new URL('../release/renewal-recheck-20261104/mobile-fixture-results.json',import.meta.url),JSON.stringify({kind:'synthetic_browser_fixture',browser:await browser.version(),results},null,2));console.log(JSON.stringify({passed:results.length,results}));}finally{await browser.close();}
