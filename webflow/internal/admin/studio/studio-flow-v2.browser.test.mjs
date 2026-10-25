// Isolated integration fixture: real pages/controller/renderer and backend intake
// normalization; all HTTP is fulfilled from memory/local files. Never production.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildStudioFlowPackage } from '../../../../scripts/build-studio-flow-v2.mjs';
import { decorateInternalSilverTheme } from '../../../global/sigil-internal-theme-v1.mjs';
import { normalizeStudioIntake } from '../../../../admin-worker/src/studio-real-worker.js';
import { projectStudioModelContext } from '../../../../admin-worker/src/studio-flow-model-context.js';

const require=createRequire(import.meta.url);
const { chromium }=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const origin='https://studio.test', base='/internal/admin/studio';
const paths={home:base,upload:base+'/upload',review:base+'/review',preview:base+'/model-preview'};
const modelId='rec'+'M'.repeat(14), requestId='rec'+'Q'.repeat(14);
const model=projectStudioModelContext({id:modelId,fields:{working_name:'Ice T',sales_layer:'public','MMD Public Category':'Travel',height_cm:175,weight_kg:77,status:'active'}});
assert.equal(model.ready,true);
const [release,manifest]=await Promise.all([
  buildStudioFlowPackage(),
  readFile(new URL('./frames/clean-v1/manifest.json',import.meta.url),'utf8').then(JSON.parse),
]);
const frameBase='https://raw.githubusercontent.com/MMD-Prive/mmd-workers/e25f3dcdcccc48b29111a483fd3ab4ce2c26cd64/webflow/internal/admin/studio/frames/clean-v1/';
const localFonts=process.env.STUDIO_FONT_DIR ? new Map(await Promise.all([['Rg','regular.woff2'],['Bd','bold.woff2']].map(async([weight,file])=>[weight,await readFile(resolve(process.env.STUDIO_FONT_DIR,file))]))) : null;
const frames=new Map(await Promise.all(manifest.assets.map(async asset=>[frameBase+asset.asset_file,await readFile(new URL('./frames/clean-v1/'+asset.asset_file,import.meta.url))])));
const pages=new Map(await Promise.all(Object.entries(paths).map(async([stage,path])=>{
  const built=release.pages[stage];
  const html=`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}</style>${built.head}</head><body><div id="mmdStudioOnsenVisual">Legacy content to isolate</div>${built.embed}${built.footer}</body></html>`;
  return [path,await(await decorateInternalSilverTheme(new Request(origin+path),new Response(html,{headers:{'content-type':'text/html'}}))).text()];
})));
const clone=value=>JSON.parse(JSON.stringify(value));

async function fixture(browser) {
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',acceptDownloads:true});
  const page=await context.newPage();page.setDefaultTimeout(7000);
  // Deliberately synthetic image input, with no personal photos or remote assets.
  const portraits=await page.evaluate(()=>['#7897af','#b48d72'].map(color=>{
    const c=document.createElement('canvas');c.width=96;c.height=144;const x=c.getContext('2d');
    x.fillStyle=color;x.fillRect(0,0,96,144);x.fillStyle='#f1dcc7';x.beginPath();x.arc(48,43,22,0,Math.PI*2);x.fill();
    x.fillStyle='#2f4155';x.fillRect(23,70,50,74);return c.toDataURL('image/png').split(',')[1];
  }));
  const files=portraits.map((data,i)=>({name:`portrait-${i+1}.png`,mimeType:'image/png',buffer:Buffer.from(data,'base64')}));
  const state={calls:[],errors:[],intakes:new Map(),reviews:new Map(),intakeByKey:new Map(),reviewByKey:new Map(),assets:new Map(),lastIntake:null,lastReview:null,failIntake:false,failReview:false,previewReady:true};
  const json=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  page.on('pageerror',error=>state.errors.push(error.message));
  await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    try {
      if(frames.has(req.url())) return route.fulfill({contentType:'image/png',headers:{'access-control-allow-origin':'*'},body:frames.get(req.url())});
      const font=url.origin==='https://s3.amazonaws.com' && url.pathname.match(/LINESeedSansTH_W_(Rg|Bd)\.woff2$/);
      if(font) return localFonts ? route.fulfill({contentType:'font/woff2',headers:{'access-control-allow-origin':'*'},body:localFonts.get(font[1])}) : route.abort();
      if(url.origin!==origin) throw new Error('Unexpected external request: '+req.url());
      if(req.method()==='GET' && pages.has(url.pathname)) return route.fulfill({contentType:'text/html; charset=utf-8',body:pages.get(url.pathname)});
      if(url.pathname==='/v1/admin/auth/me') return json(route,{ok:true,authenticated:true});
      if(url.pathname==='/v1/admin/ai-ops/client.js') return route.fulfill({contentType:'application/javascript',body:'/* isolated test: no external AI client */'});
      if(url.pathname==='/favicon.ico') return route.abort();
      assert.equal(req.method(),'POST');assert.ok(url.pathname.startsWith('/studio/api/'));
      const endpoint=url.pathname.slice('/studio/api/'.length);
      if(endpoint==='upload') {
        const form=await new Request(req.url(),{method:'POST',headers:req.headers(),body:req.postDataBuffer()}).formData();
        assert.equal(form.getAll('file').length,1,'each upload transports one image');
        const file=form.get('file'),bytes=Buffer.from(await file.arrayBuffer());
        assert.equal(file.type,'image/png');assert.ok(bytes.length>0);
        assert.equal(req.headers()['idempotency-key'],form.get('upload_key'));
        const asset_id='studio_'+createHash('sha256').update(bytes).digest('hex');
        state.assets.set(asset_id,{bytes,type:file.type,size:file.size});state.calls.push({endpoint,asset_id});
        return json(route,{ok:true,asset_id});
      }
      const body=req.postDataJSON() || {};state.calls.push({endpoint,body:clone(body)});
      if(endpoint==='model-cards/list') return json(route,{ok:true,jobs:[],enabled:false,cursor:null});
      if(endpoint==='models/search') return json(route,{ok:true,items:[{model_record_id:modelId,display_name:'Ice T',ready:true,field:'EN',world:'public'}]});
      if(endpoint==='model-context') {assert.equal(body.model_record_id,modelId);return json(route,model);}
      if(endpoint==='assets/read') {const asset=state.assets.get(body.asset_id);assert.ok(asset,'only saved assets may be read');return route.fulfill({contentType:asset.type,body:asset.bytes});}
      if(endpoint==='intake/validate' || endpoint==='intake/commit') {
        // Use the shipped backend contract so front-end family/type drift fails here.
        const intake=normalizeStudioIntake(body);
        assert.ok(intake.files.length>=1 && intake.files.length<=10);
        assert.equal(intake.compcard_family,'C','EN maps to canonical family C');
        assert.equal(typeof intake.client_types,'string');assert.equal(intake.model_record_id,modelId);
        for(const [key,value] of Object.entries({model_name:'Ice T',field:'EN',layer:'Public / MMD Privé',height_cm:175,weight_kg:77})) assert.equal(intake[key],value,key);
        for(const file of intake.files){const asset=state.assets.get(file.asset_id);assert.ok(asset);assert.equal(file.size,asset.size);assert.equal(file.type,asset.type);}
        if(endpoint==='intake/validate') return json(route,{ok:true,normalized:intake});
        if(state.failIntake) return json(route,{ok:false,error:'write_unavailable'},state.failIntake===true?503:state.failIntake);
        const id='recI'+String(state.intakes.size+1).padStart(13,'0');
        const saved={...clone(intake),studio_intake_id:id,model_context:clone(model)};
        state.intakes.set(id,saved);state.intakeByKey.set(body.idempotency_key,id);state.lastIntake=saved;
        return json(route,{ok:true,studio_intake_id:id});
      }
      if(endpoint==='intake/read') {
        const saved=state.intakes.get(body.studio_intake_id || state.intakeByKey.get(body.idempotency_key));
        return saved?json(route,{ok:true,intake:saved}):json(route,{ok:false,error:'not_found'},404);
      }
      if(endpoint==='review/validate' || endpoint==='review/commit') {
        const intake=state.intakes.get(body.studio_intake_id);assert.ok(intake);
        assert.equal(body.flow_version,2);assert.ok(['Approved Direction','Needs Review','Revise Source','Reject'].includes(body.decision));
        if(body.decision==='Approved Direction') assert.deepEqual(body.checklist,{identity:true,photo:true,safe:true});
        assert.equal(body.intake_snapshot,undefined,'client must not supply its own review snapshot');
        if(endpoint==='review/validate') return json(route,{ok:true});
        if(state.failReview) return json(route,{ok:false,error:'write_unavailable'},state.failReview===true?503:state.failReview);
        const id='recR'+String(state.reviews.size+1).padStart(13,'0');
        const saved={...clone(body),studio_review_id:id,intake_snapshot:clone(intake)};
        state.reviews.set(id,saved);state.reviewByKey.set(body.idempotency_key,id);state.lastReview=saved;
        return json(route,{ok:true,studio_review_id:id,published:false});
      }
      if(endpoint==='review/read') {
        const saved=state.reviews.get(body.studio_review_id || state.reviewByKey.get(body.idempotency_key));
        return saved?json(route,{ok:true,review:saved,preview_ready:state.previewReady && saved.decision==='Approved Direction'}):json(route,{ok:false,error:'not_found'},404);
      }
      if(endpoint==='compcard-requests/list') return json(route,{ok:true,requests:[{request_id:requestId,model_name:'Ice T',status:'submitted'}]});
      if(endpoint==='compcard-requests/import') {assert.equal(body.compcard_request_id,requestId);return json(route,{ok:true,draft:{source_owner:'model:'+modelId}});}
      if(endpoint==='compcard-requests/media') {assert.equal(body.compcard_request_id,requestId);return route.fulfill({contentType:'image/png',body:files[0].buffer});}
      throw new Error('Unexpected endpoint: '+endpoint);
    } catch(error) {
      state.errors.push(error.stack || error.message);return json(route,{ok:false,error:error.message},error.status || 500);
    }
  });
  return {context,page,files,state};
}
async function fontsReady(page) {
  const fonts=await page.evaluate(async()=>{
    await document.fonts.ready;
    return {thai:document.fonts.check('16px "LINE Seed Sans TH"','ภาษาไทย'),loaded:[...document.fonts].filter(face=>face.family.replace(/["']/g,'')==='LINE Seed Sans TH' && face.status==='loaded').map(face=>face.weight)};
  });
  if(localFonts) {assert.equal(fonts.thai,true,'Thai glyph font must be ready');assert.ok(fonts.loaded.includes('400') && fonts.loaded.includes('700'),'regular and bold LINE Seed Thai faces must be loaded');}
}
async function ready(page) {await page.waitForFunction(()=>document.querySelector('#studioFlow')?.getAttribute('aria-busy')==='false');await fontsReady(page);}
async function chooseModel(page) {
  await page.locator('#sfSearch').fill('Ice');await page.locator('#sfSearch').press('Enter');
  const result=page.locator('#sfModelResults button');await result.waitFor();await ready(page);await result.focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('[name="model_name"]').value==='Ice T');await ready(page);
}
async function renderedCanvas(page) {
  await page.locator('#sfCanvas:not([hidden])').waitFor();
  assert.deepEqual(await page.locator('#sfCanvas').evaluate(c=>[c.width,c.height,c.getContext('2d').getImageData(600,600,1,1).data[3]]),[1316,1195,255]);
}
async function reportFailure(page,state,label) {
  console.error('STUDIO_FAILURE '+JSON.stringify({label,url:page.url(),errors:state.errors,calls:state.calls.slice(-8),ui:await page.locator('#sfStatus').textContent().catch(()=>''),form:await page.evaluate(()=>[...document.querySelectorAll('input,select,textarea')].filter(el=>el.validity&&!el.validity.valid).map(el=>({name:el.name,id:el.id,value:el.value,disabled:el.disabled,reason:el.validationMessage}))).catch(()=>[])}));
}
async function inspectLayout(page,width,stage) {
  await fontsReady(page);
  await page.mouse.move(0,0);
  const result=await page.evaluate(()=>{
    const root=document.querySelector('#studioFlow'),visible=el=>el.getClientRects().length && getComputedStyle(el).visibility!=='hidden';
    const rgb=value=>value.match(/[\d.]+/g).map(Number),lum=c=>c.slice(0,3).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((n,x,i)=>n+x*[.2126,.7152,.0722][i],0);
    const contrast=el=>{let bg=[255,255,255],chain=[];for(let n=el;n;n=n.parentElement)chain.push(n);for(const n of chain.reverse()){const c=rgb(getComputedStyle(n).backgroundColor),a=c[3]??1;bg=c.slice(0,3).map((x,i)=>x*a+bg[i]*(1-a));}const fg=rgb(getComputedStyle(el).webkitTextFillColor || getComputedStyle(el).color);return (Math.max(lum(fg),lum(bg))+.05)/(Math.min(lum(fg),lum(bg))+.05);};
    const text=[...root.querySelectorAll('h1,h2,h3,p,small,label,legend,dt,dd,.sf-button,.sf-step,.sf-step-num,.sf-kicker,input,select,textarea')].filter(visible);
    const controls=[...root.querySelectorAll('button,a[href],input:not([type="checkbox"]):not([type="radio"]),select,textarea,summary,.sf-check')].filter(visible);
    return {width:document.documentElement.scrollWidth,contrast:text.filter(el=>contrast(el)<4.5).map(el=>({text:el.textContent.slice(0,55),ratio:contrast(el)})),targets:controls.filter(el=>el.getBoundingClientRect().height<43.9).map(el=>({id:el.id,tag:el.tagName,height:el.getBoundingClientRect().height})),untabbable:[...root.querySelectorAll('[data-sf-step][href]')].filter(el=>el.tabIndex<0).map(el=>el.dataset.sfStep)};
  });
  assert.ok(result.width<=width,`${stage} ${width}px overflow: ${JSON.stringify(result)}`);
  assert.deepEqual(result.contrast,[],`${stage} ${width}px contrast`);assert.deepEqual(result.targets,[],`${stage} ${width}px targets`);assert.deepEqual(result.untabbable,[],`${stage} ${width}px keyboard nav`);
  const button=page.locator('#studioFlow .sf-button:visible').first();await button.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
  const focus=await button.evaluate(el=>({active:document.activeElement===el,outline:getComputedStyle(el).outlineWidth}));
  assert.deepEqual(focus,{active:true,outline:'3px'},`${stage} ${width}px keyboard focus`);
  if(process.env.STUDIO_SCREENSHOTS && [390,1440].includes(width)) {
    await mkdir(process.env.STUDIO_SCREENSHOTS,{recursive:true});await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});
    await page.screenshot({path:resolve(process.env.STUDIO_SCREENSHOTS,`studio-flow-${stage}-${width}.png`),fullPage:true});
  }
}

test('Studio upload → saved review → approved snapshot → real PNG export, with four responsive widths',async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
  const f=await fixture(browser),{page,state,files}=f;
  try {
    await page.goto(origin+paths.home);await ready(page);
    await page.locator(`a[href="${paths.upload}?new=1"]`).click();await page.waitForURL(origin+paths.upload);await ready(page);
    await chooseModel(page);
    await page.locator('#sfFiles').setInputFiles(files);await renderedCanvas(page);
    await page.locator('#sfThumbs button').nth(1).click();await renderedCanvas(page);
    await page.locator('[name="visual_variant_number"]').selectOption('3');await renderedCanvas(page);
    await page.locator('[name="consent"]').check();await renderedCanvas(page);
    await page.locator('#sfSave').focus();await page.keyboard.press('Enter');
    await page.waitForURL(/\/studio\/review\?intake_id=rec/);await ready(page);await renderedCanvas(page);
    assert.ok(state.lastIntake,JSON.stringify(state.errors));assert.equal(state.lastIntake.files.length,2);
    assert.equal(state.lastIntake.main_asset_id,'studio_'+createHash('sha256').update(files[1].buffer).digest('hex'));
    assert.equal(state.lastIntake.visual_variant_number,3);
    for(const name of ['identity','photo','safe']) await page.locator(`[name="${name}"]`).check();
    await page.locator('[name="decision"]').selectOption('Approved Direction');await page.locator('[name="final_note"]').fill('ตรวจรูปและข้อมูลเรียบร้อย');
    await page.locator('#sfReviewSave').click();await page.waitForURL(/\/model-preview\?review_id=rec/);await ready(page);await renderedCanvas(page);
    assert.deepEqual(state.lastReview.intake_snapshot,state.lastIntake);
    const reads=state.calls.filter(x=>x.endpoint==='review/read').length;
    const downloaded=page.waitForEvent('download');await page.locator('#sfDownload').click();const download=await downloaded;
    assert.equal(download.suggestedFilename(),'Ice T-card.png');
    const chunks=[];for await(const chunk of await download.createReadStream())chunks.push(chunk);const png=Buffer.concat(chunks);
    assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.equal(png.readUInt32BE(16),1316);assert.equal(png.readUInt32BE(20),1195);
    assert.ok(state.calls.filter(x=>x.endpoint==='review/read').length>reads,'download must recheck server approval');
    if(localFonts) {
      const thaiCard=await page.evaluate(async bytes=>{
        await document.fonts.ready;
        const canvas=document.createElement('canvas');
        await window.MMDStudioFlowRenderer.render(canvas,{model_name:'ไอซ์ ที',field:'EN',height_cm:175,weight_kg:77,visual_variant_number:3,photo:new Blob([new Uint8Array(bytes)],{type:'image/png'})});
        return {label:canvas.getAttribute('aria-label'),png:canvas.toDataURL('image/png').split(',')[1],ready:canvas.getAttribute('data-studio-render-ready')};
      },[...files[0].buffer]);
      assert.equal(thaiCard.ready,'true');assert.match(thaiCard.label,/ไอซ์ ที/);
      const thaiPng=Buffer.from(thaiCard.png,'base64');assert.equal(thaiPng.readUInt32BE(16),1316);assert.equal(thaiPng.readUInt32BE(20),1195);
      if(process.env.STUDIO_SCREENSHOTS) {await mkdir(process.env.STUDIO_SCREENSHOTS,{recursive:true});await writeFile(resolve(process.env.STUDIO_SCREENSHOTS,'studio-flow-thai-card.png'),thaiPng);}
    }
    for(const width of [360,390,768,1440]) {
      await page.setViewportSize({width,height:844});
      for(const stage of ['home','upload','review','preview']) {
        const query=stage==='preview'?'?review_id='+state.lastReview.studio_review_id:['upload','review'].includes(stage)?'?intake_id='+state.lastIntake.studio_intake_id:'';
        await page.goto(origin+paths[stage]+query);await ready(page);if(stage!=='home')await renderedCanvas(page);
        if(stage==='upload') await page.locator('#sfAutoTools>summary').click();
        await inspectLayout(page,width,stage);
      }
    }
    assert.deepEqual(state.errors,[]);
  } catch(error) {await reportFailure(page,state,'complete-flow');throw error;}
  finally {await f.context.close();await browser.close();}
});

test('missing records, too many photos and failed commits cannot advance the Studio flow',async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
  const f=await fixture(browser),{page,state,files}=f;
  try {
    await page.goto(origin+paths.review);await ready(page);assert.equal(await page.locator('#sfReviewControls').evaluate(el=>el.disabled),true);assert.equal(await page.locator('#sfReviewSave').isDisabled(),true);
    await page.goto(origin+paths.preview);await ready(page);assert.equal(await page.locator('#sfDownload').isDisabled(),true);assert.equal(await page.locator('#sfCanvas').isVisible(),false);
    assert.equal(state.calls.length,0,'direct pages must not invent or fetch record IDs');
    await page.goto(origin+paths.upload+'?new=1');await ready(page);await chooseModel(page);
    await page.locator('#sfFiles').setInputFiles(Array.from({length:11},(_,i)=>({...files[0],name:`excess-${i}.png`})));
    await page.locator('#sfStatus[data-state="error"]').waitFor();assert.equal(state.calls.filter(x=>x.endpoint==='upload').length,0);
    await page.locator('#sfFiles').setInputFiles(files[0]);await renderedCanvas(page);await page.locator('[name="consent"]').check();await renderedCanvas(page);
    state.failIntake=true;await page.locator('#sfSave').click();await page.locator('#sfStatus[data-state="error"]').waitFor();await ready(page);
    assert.equal(new URL(page.url()).pathname,paths.upload);assert.equal(state.intakes.size,0);assert.equal(await page.locator('[data-sf-step="review"]').getAttribute('href'),null);
    assert.equal(await page.locator('#sfSave').isDisabled(),false,'uncertain writes remain retryable');
    state.failIntake=400;await page.locator('#sfSave').click();await ready(page);
    assert.equal(await page.locator('#sfFiles').isDisabled(),false,'a definitive rejection must restore photo editing');
    assert.equal(await page.locator('[name="visual_variant_number"]').isDisabled(),false);
    assert.equal(await page.locator('[name="consent"]').isDisabled(),false);
    state.failIntake=false;await page.locator('#sfSave').click();await page.waitForURL(/\/studio\/review\?intake_id=rec/);await ready(page);await renderedCanvas(page);
    for(const name of ['identity','photo','safe'])await page.locator(`[name="${name}"]`).check();
    await page.locator('[name="decision"]').selectOption('Approved Direction');state.failReview=true;await page.locator('#sfReviewSave').click();
    await page.locator('#sfStatus[data-state="error"]').waitFor();await ready(page);
    assert.equal(new URL(page.url()).pathname,paths.review);assert.equal(state.reviews.size,0);assert.equal(await page.locator('[data-sf-step="preview"]').getAttribute('href'),null);
    state.failReview=400;await page.locator('#sfReviewSave').click();await ready(page);
    assert.equal(await page.locator('[name="decision"]').isDisabled(),false,'review must thaw after a definitive rejection');
    assert.equal(await page.locator('[name="final_note"]').isDisabled(),false);
    await page.locator('[name="decision"]').selectOption('Needs Review');state.failReview=true;
    await page.locator('#sfReviewSave').click();await ready(page);
    state.failReview=false;await page.locator('#sfReviewSave').click();await ready(page);
    assert.equal(state.lastReview.decision,'Needs Review');assert.equal(new URL(page.url()).pathname,paths.review);
    assert.equal(await page.locator('[name="identity"]').isDisabled(),false,'non-approved retry success restores the checklist');
    assert.equal(await page.locator('[name="decision"]').isDisabled(),false);
    assert.equal(await page.locator('[data-sf-step="preview"]').getAttribute('href'),null);
    assert.deepEqual(state.errors,[]);
  } catch(error) {await reportFailure(page,state,'blocked-flow');throw error;}
  finally {await f.context.close();await browser.close();}
});

test('an explicit record URL wins over pending recovery from a different saved job',async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
  const f=await fixture(browser),{page,state,files}=f;
  try {
    const assetId='studio_'+createHash('sha256').update(files[0].buffer).digest('hex');
    state.assets.set(assetId,{bytes:files[0].buffer,type:'image/png',size:files[0].buffer.length});
    const intake=normalizeStudioIntake({flow_version:2,model_record_id:modelId,model_name:'Ice T',field:'EN',layer:'Public / MMD Privé',height_cm:175,weight_kg:77,compcard_family:'C',visual_variant_number:1,template_hint:'studio-clean-frame-1',files:[{asset_id:assetId,name:'portrait.png',size:files[0].buffer.length,type:'image/png'}],main_asset_id:assetId,audiences:['public'],consent:true,client_types:''});
    const intakeA='rec'+'A'.repeat(14),intakeB='rec'+'B'.repeat(14),reviewA='rec'+'C'.repeat(14),reviewB='rec'+'D'.repeat(14);
    for(const id of [intakeA,intakeB]) state.intakes.set(id,{...clone(intake),studio_intake_id:id,model_context:clone(model)});
    for(const [id,intakeId] of [[reviewA,intakeA],[reviewB,intakeB]]) state.reviews.set(id,{flow_version:2,studio_review_id:id,studio_intake_id:intakeId,decision:'Approved Direction',checklist:{identity:true,photo:true,safe:true},intake_snapshot:clone(state.intakes.get(intakeId))});
    const stale={intake_id:intakeA,review_id:reviewA,pending_intake_key:'studio-v2:intake:00000000-0000-4000-8000-000000000001',pending_review_key:'studio-v2:review:00000000-0000-4000-8000-000000000002'};
    state.intakeByKey.set(stale.pending_intake_key,intakeA);state.reviewByKey.set(stale.pending_review_key,reviewA);
    await page.goto(origin+paths.home);await ready(page);
    for(const [stage,key,id] of [['review','intake_id',intakeB],['preview','review_id',reviewB]]) {
      await page.evaluate(refs=>sessionStorage.setItem('mmdStudioFlowV2',JSON.stringify(refs)),stale);state.calls=[];
      await page.goto(origin+paths[stage]+'?'+key+'='+id);await ready(page);await renderedCanvas(page);
      assert.equal(await page.locator('#sfEdit').getAttribute('href'),paths.upload+'?intake_id='+intakeB);
      const refs=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('mmdStudioFlowV2')));
      assert.equal(refs.intake_id,intakeB);if(stage==='preview')assert.equal(refs.review_id,reviewB);
      assert.equal(state.calls.some(call=>call.body?.idempotency_key),false,'explicit navigation must not run unrelated pending recovery');
    }
    assert.deepEqual(state.errors,[]);
  } catch(error) {await reportFailure(page,state,'explicit-record');throw error;}
  finally {await f.context.close();await browser.close();}
});

test('replacing an imported My Card photo clears the original request association and consent',async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
  const f=await fixture(browser),{page,state,files}=f;
  try {
    await page.goto(origin+paths.upload+'?new=1');await ready(page);await page.locator('[name="source_mode"]').selectOption('mycard');
    await page.locator('#sfRequestsRefresh').click();await page.locator('#sfRequests button').waitFor();await ready(page);await page.locator('#sfRequests button').click();
    await renderedCanvas(page);await ready(page);await page.locator('[name="consent"]').check();await renderedCanvas(page);
    await page.locator('#sfFiles').setInputFiles(files[1]);await renderedCanvas(page);
    assert.equal(await page.locator('[name="source_mode"]').inputValue(),'existing');assert.equal(await page.locator('[name="consent"]').isChecked(),false);
    await page.locator('[name="consent"]').check();await renderedCanvas(page);await page.locator('#sfSave').click();
    await page.waitForURL(/\/studio\/review\?intake_id=rec/);await ready(page);
    assert.equal(state.lastIntake.compcard_request_id,'');assert.equal(state.lastIntake.files.length,1);
    assert.equal(state.lastIntake.main_asset_id,'studio_'+createHash('sha256').update(files[1].buffer).digest('hex'));assert.deepEqual(state.errors,[]);
  } catch(error) {await reportFailure(page,state,'my-card-replacement');throw error;}
  finally {await f.context.close();await browser.close();}
});
