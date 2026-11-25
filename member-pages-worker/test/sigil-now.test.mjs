import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {runInNewContext} from "node:vm";
import {handleMemberUpdates} from "../src/member-updates.js";
import {projectSigilNowAccess} from "../src/sigil-now.js";

const root = "https://mmdbkk.com/api/member/app/updates";
const session = async()=>({lineUserId:"U"+"a".repeat(32),memberId:"synthetic-member",memberExists:true});
const eligible = {schema_version:"my_mmd_entitlement_resolver_v1",source_status:"verified",fail_closed:true,member_blocked:false,access:{private_visibility_envelope:"standard",new_model_reveals_allowed:true}};
const readEntitlement = async(_env,identity)=>{assert.deepEqual(identity,{line_user_id:"U"+"a".repeat(32)});return eligible;};
const post = {id:"test-pair",title:"Private editorial",summary:"Private update",published:true,published_at:"2026-01-01T00:00:00Z",cover_extension:"webp",image_alt:"Editorial portrait"};
const publicPost={id:"public-post",isDraft:false,isArchived:false,lastPublished:"2026-01-01T00:00:00Z",fieldData:{name:"Public news","short-summary":"Public update"}};
const imageBytes = new Uint8Array([12,34,56]);
function fixture(rows=[post], imageType="image/webp") {
  const calls={cms:0,storage:[],entitlement:0};
  const env={WEBFLOW_CMS_TOKEN:"fixture",WEBFLOW_CMS_HTTP:{fetch:async()=>{calls.cms++;return Response.json({items:[publicPost],pagination:{total:1}});}},
    SIGIL_NOW_PRIVATE_R2:{get:async key=>{calls.storage.push(key);
      if(key==="sigil-now/v1/index.json"){const value=JSON.stringify({schema:"sigil_now_v1",items:rows});return {size:new TextEncoder().encode(value).length,text:async()=>value};}
      if(key==="sigil-now/v1/covers/test-pair.webp")return {size:imageBytes.length,httpMetadata:{contentType:imageType},body:imageBytes};
      return null;
    }},
  };
  return {env,calls,access:async(e,i)=>{calls.entitlement++;return readEntitlement(e,i);}};
}

test("Public MMD NOW and both aliases never read private content",async()=>{
  for(const path of [root,"https://mmdbkk.com/api/v1/member/updates/list"]){
    const {env,calls,access}=fixture();
    const r=await handleMemberUpdates(new Request(path+"?limit=10"),env,session,access);
    const body=await r.json();assert.equal(r.status,200);assert.equal(body.audience,"public");
    assert.deepEqual(body.items.map(x=>x.id),["public-post"]);assert.equal(calls.cms,2);
    assert.deepEqual(calls.storage,[]);assert.equal(calls.entitlement,0);
  }
});

test("Verified active Private receives only independent private cards and gated cover URLs",async()=>{
  const {env,calls,access}=fixture();
  const r=await handleMemberUpdates(new Request(root+"?world=sigil&limit=10"),env,session,access);
  assert.equal(r.status,200);assert.match(r.headers.get("cache-control"),/private, no-store/);
  const body=await r.json();assert.equal(body.audience,"sigil");assert.equal(body.source,"sigil_now_private");
  assert.equal(body.items.length,1);assert.equal(body.items[0].title,post.title);
  assert.equal(body.items[0].image_url,"/api/member/app/updates?world=sigil&cover=test-pair");
  assert.equal(calls.cms,0);assert.equal(calls.entitlement,1);
  assert.deepEqual(calls.storage,["sigil-now/v1/index.json"]);
});

test("Private list and every direct cover request fail closed without verified active capability",async()=>{
  const cases=[
    [null,503], [{...eligible,source_status:"unavailable"},503],
    [{...eligible,member_blocked:true},403],
    [{...eligible,access:{private_visibility_envelope:"none",new_model_reveals_allowed:false}},403],
    [{...eligible,access:{private_visibility_envelope:"standard",new_model_reveals_allowed:false}},403],
    [{...eligible,fast_trust:{active:true}},403],
    [{...eligible,fail_closed:false},503],
  ];
  for(const [snapshot,status] of cases)for(const query of ["?world=sigil","?world=sigil&cover=test-pair"]){
    const {env,calls}=fixture();
    const response=await handleMemberUpdates(new Request(root+query),env,session,async()=>snapshot);
    assert.equal(response.status,status);assert.deepEqual(calls.storage,[]);assert.equal(calls.cms,0);
    assert.ok(!JSON.stringify(await response.json()).includes(post.title));
  }
  const {env,calls,access}=fixture();
  const denied=await handleMemberUpdates(new Request(root+"?world=sigil&cover=test-pair"),env,async()=>null,access);
  assert.equal(denied.status,401);assert.deepEqual(calls.storage,[]);assert.equal(calls.entitlement,0);
  assert.equal(projectSigilNowAccess(eligible),"allowed");
});

test("Private cover is served only for current published manifest, not raw bucket paths or stale cards",async()=>{
  const {env,calls,access}=fixture();
  const cover=await handleMemberUpdates(new Request(root+"?world=sigil&cover=test-pair"),env,session,access);
  assert.equal(cover.status,200);assert.equal(cover.headers.get("content-type"),"image/webp");
  assert.equal(cover.headers.get("cross-origin-resource-policy"),"same-origin");assert.match(cover.headers.get("cache-control"),/no-store/);
  assert.deepEqual(new Uint8Array(await cover.arrayBuffer()),imageBytes);assert.equal(calls.entitlement,1);
  for(const rows of [[{...post,published:false}],[{...post,published_at:"2099-01-01T00:00:00Z"}],[post,post],[]]){
    const f=fixture(rows);
    const r=await handleMemberUpdates(new Request(root+"?world=sigil&cover=test-pair"),f.env,session,f.access);
    assert.equal(r.status,404);assert.deepEqual(f.calls.storage,["sigil-now/v1/index.json"]);
  }
  for(const query of ["?cover=test-pair","?world=sigil&cover=../index","?world=sigil&cover=test-pair&cover=other","?world=sigil&world=public","?world=sigil&cover=test-pair&limit=5","?world=sigil&unknown=1"]){
    const f=fixture();
    assert.equal((await handleMemberUpdates(new Request(root+query),f.env,session,f.access)).status,400);
    assert.deepEqual(f.calls.storage,[]);
  }
  const f=fixture([post],"text/html");
  assert.equal((await handleMemberUpdates(new Request(root+"?world=sigil&cover=test-pair"),f.env,session,f.access)).status,404);
});

test("Private feed never falls back to Public when storage or entitlement lookup fails",async()=>{
  const {env,calls,access}=fixture();delete env.SIGIL_NOW_PRIVATE_R2;
  const r=await handleMemberUpdates(new Request(root+"?world=sigil"),env,session,access);
  assert.equal(r.status,503);assert.equal(calls.cms,0);
  const cross=await handleMemberUpdates(new Request(root+"?world=sigil&cover=test-pair",{headers:{"sec-fetch-site":"cross-site"}}),env,session,access);
  assert.equal(cross.status,403);
});

test("LIFF uses separate Private requests and refuses cross-audience response",async()=>{
  const source=await readFile(new URL("../src/liff-member-shell.js",import.meta.url),"utf8");
  const from=source.indexOf("async function loadDigitalUpdates()"), to=source.indexOf("function renderProfile(",from);
  assert.ok(from>=0&&to>from);
  const code=source.slice(from,to);
  for(const [brand,returned,expectedUrl,shouldRender] of [
    ["private","sigil",root+"?limit=10&world=sigil",true],
    ["private","public",root+"?limit=10&world=sigil",false],
    ["public","public",root+"?limit=10",true],
    ["public","sigil",root+"?limit=10",false]
  ]){
    const calls=[],rendered=[];const details={addEventListener(){}};const feed={textContent:""};
    const context={document:{body:{dataset:{brandAudience:brand}},getElementById:id=>id==="digital-news-disclosure"?details:feed},
      profileReady:true,digitalUpdatesLoaded:false,digitalUpdatesPending:null,digitalUpdatesGeneration:0,digitalHomeReady:Promise.resolve(),digitalPersonalizedFeed:[],
      memberApiFetch:async path=>{calls.push(new URL(path,root).href);return Response.json({ok:true,audience:returned,items:[]});},
      renderDigitalNews(...args){rendered.push(args);},Promise,Number,Response};
    await runInNewContext(code+"\nloadDigitalUpdates()",context);
    assert.deepEqual(calls,[expectedUrl]);assert.equal(rendered.length,shouldRender?1:0);
  }
  assert.match(source,/setNowHeading\(verifiedAudience\)/);
  assert.match(source,/SĪGIL NOW/);
  assert.match(source,/staleNews\.textContent = ""/);
});
