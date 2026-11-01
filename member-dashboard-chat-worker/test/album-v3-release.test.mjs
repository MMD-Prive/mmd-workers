import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import{emsAlbumsPage,isEmsAlbumsPage}from'../src/my-mmd-ems-albums.mjs';
import{gwsAlbumsPage,isGwsAlbumsPage}from'../src/my-mmd-gws-albums.mjs';
class Element{
 constructor(){this.children=[];this.events={};this.hidden=false;this.textContent='';this.value='';}
 append(...els){this.children.push(...els);}replaceChildren(...els){this.children=els;}
 setAttribute(k,v){this[k]=v;}addEventListener(k,fn){this.events[k]=fn;}
 focus(){}removeAttribute(k){delete this[k];}showModal(){this.open=true;}close(){this.open=false;}
}
for(const[kind,render,isPage]of[['ems',emsAlbumsPage,isEmsAlbumsPage],['gws',gwsAlbumsPage,isGwsAlbumsPage]]){
 test(kind+': page routes and GET/HEAD preserve API boundary',async()=>{
  const root='https://www.mmdbkk.com/my-mmd/'+kind;
  assert.equal(isPage(new Request(root)),true);assert.equal(isPage(new Request(root+'/'+kind+'1-123456789abc')),true);
  assert.equal(isPage(new Request(root+'/other')),false);assert.equal((await render(new Request(root,{method:'POST'}))).status,405);
  const head=render(new Request(root,{method:'HEAD'}));assert.equal(await head.text(),'');assert.equal(head.headers.get('cache-control'),'private, no-store');
 });
 test(kind+': inline script parses and each page has an independent nonce',async()=>{
  const root='https://www.mmdbkk.com/my-mmd/'+kind;
  const a=await render(new Request(root)).text(),b=await render(new Request(root)).text();
  const script=a.match(/<script nonce="([^"]+)">([\s\S]*?)<\/script>/);new vm.Script(script[2]);
  assert.notEqual(script[1],b.match(/<script nonce="([^"]+)">/)[1]);assert.ok(!a.includes('__ALBUM_CONFIG__'));assert.ok(!a.includes('__ART__'));
 });
 for(const[status,title,action]of[[401,'A private world, for you.','login'],[403,'Member access',null],[503,'A little pause.','retry']])test(kind+': '+status+' keeps album data hidden',async()=>{
  const slug=kind+'1-123456789abc';const html=await render(new Request('https://www.mmdbkk.com/my-mmd/'+kind+'/'+slug)).text();
  const code=html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)[1];const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
  let destination;const requests=[];const context={document:{body:{classList:{add(){},remove(){}}},getElementById:get,createElement:()=>new Element()},WeakMap,location:{assign:value=>{destination=value;}},fetch:async(url,opts)=>{requests.push(url);assert.equal(opts.credentials,'same-origin');assert.equal(opts.cache,'no-store');return Response.json({ok:false},{status});}};
  vm.runInNewContext(code,context);await new Promise(setImmediate);
  assert.equal(get('state-title').textContent,title);assert.equal(get('content').hidden,true);assert.equal(get('content').children.length,0);assert.equal(requests.length,1,'no previews fetched after denied/unavailable access');
  assert.equal(get('login').hidden,action!=='login');assert.equal(get('retry').hidden,action!=='retry');
  if(status===401){get('login').events.click();assert.equal(destination,'https://miniapp.line.me/2010862595-yT4DCEMc/?intent=status&view='+kind+'_albums&album='+slug);}
 });
}

for(const[kind,render]of[['ems',emsAlbumsPage],['gws',gwsAlbumsPage]])test(kind+': approved V3 release identity and complete gallery features',async()=>{const r=render(new Request('https://www.mmdbkk.com/my-mmd/'+kind));assert.equal(r.headers.get('x-mmd-ui-source'),'my-mmd-'+kind+'-albums-sigil-v3');const h=await r.text();assert.ok(h.includes('grid-template-columns:repeat(2,minmax(0,1fr))'));assert.ok(h.includes('id="album-search"'));assert.ok(h.includes('id="viewer"'));assert.ok(h.includes('data:image/png;base64,'));assert.ok(!h.includes('DESIGN PREVIEW'));});
