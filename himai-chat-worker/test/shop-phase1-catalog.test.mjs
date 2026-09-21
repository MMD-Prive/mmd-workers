import test from 'node:test';
import assert from 'node:assert/strict';
import { handleShopCatalog } from '../src/shop-catalog.js';
import worker from '../src/entry.js';
import { SHOP_RELIABILITY_SOURCE } from '../../webflow/shared/shop-reliability-runtime.mjs';

for(const shop of ['shop','mmd-shop']) test(`${shop}: reads all stock pages and keeps brand prices separate`,async()=>{
  const original=globalThis.fetch, visited=[];
  globalThis.fetch=async(input)=>{
    const u=new URL(String(input)), table=u.pathname.split('/').at(-1); visited.push(table);
    if(table==='tblzsmNLfP6J0kQ90')return Response.json({records:[{id:'recFixture',fields:{'Product Name':'Fixture accessory',SKU:'FX','Brand Availability':['Both'],Status:'active','Himai Selling Price THB':80,'MMD Shop Selling Price THB':100}}]});
    if(table==='tblwFgl4et1TOgtNn')return Response.json({records:[{id:'recBatch',fields:{Product:['recFixture'],'Quantity Remaining':u.searchParams.has('offset')?3:2,'Batch Status':'active'}}],...(u.searchParams.has('offset')?{}:{offset:'page2'})});
    if(table==='tbl81bnFyASeXCj9x')return Response.json({records:[]});
    throw new Error('Unexpected table');
  };
  try { const d=await(await handleShopCatalog(new Request(`https://mmdbkk.com/${shop}/api/products`),{AIRTABLE_BASE_ID:'appFixture',AIRTABLE_TOKEN:'fixture'})).json();
    assert.equal(d.products[0].available,5);assert.equal(d.products[0].selling_price_thb,shop==='shop'?80:100);assert.equal(visited.filter(x=>x==='tblwFgl4et1TOgtNn').length,2);
  } finally {globalThis.fetch=original;}
});
test('repeated pagination cursor fails closed instead of presenting partial stock',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({records:[],offset:'loop'});
  try {await assert.rejects(handleShopCatalog(new Request('https://mmdbkk.com/shop/api/products'),{AIRTABLE_BASE_ID:'appFixture',AIRTABLE_TOKEN:'fixture'}),/incomplete|pagination/);}finally{globalThis.fetch=original;}
});
test('runtime assets are exact allowlisted GET/HEAD routes and never require business credentials',async()=>{
  for(const path of ['/shop/api/runtime/reliability-v1.js','/mmd-shop/api/runtime/reliability-v1.js']){
    const response=await worker.fetch(new Request('https://mmdbkk.com'+path),{},{});assert.equal(response.status,200);assert.equal(await response.text(),SHOP_RELIABILITY_SOURCE);
    assert.match(response.headers.get('content-type'),/javascript/);assert.equal(response.headers.get('cache-control'),'no-store');
    const head=await worker.fetch(new Request('https://mmdbkk.com'+path,{method:'HEAD'}),{},{});assert.equal(await head.text(),'');
    const post=await worker.fetch(new Request('https://mmdbkk.com'+path,{method:'POST'}),{},{});assert.equal(post.status,405);
  }
  for(const path of ['/shop/api/runtime/storefront-v1.js','/mmd-shop/api/runtime/storefront-v1.js','/shop/api/runtime/storefront-v1.css']){
    const response=await worker.fetch(new Request('https://mmdbkk.com'+path),{},{});assert.equal(response.status,200);assert.ok((await response.text()).length>1000);
  }
});
