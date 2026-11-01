import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseImmigrateWorkerConfig, verifyImmigrateWorkerBaseline, promoteImmigrateWorkerVersion } from './immigrate-worker-code-only-release.mjs';

const version='11111111-1111-4111-8111-111111111111';
const deployment='22222222-2222-4222-8222-222222222222';
const uploaded='33333333-3333-4333-8333-333333333333';
const commit='a'.repeat(40);
const account='b176eda1172b741fd2e58904cc9d77c5';
const config=`name = "immigrate-worker"\nmain = "src/customer-360-live-ingress-wrapper.ts"\ncompatibility_date = "2026-03-25"\n\n[assets]\ndirectory = "./public"\nbinding = "ASSETS"\n\n[vars]\nAIRTABLE_BASE_ID = "appsV1ILPRfIjkaYg"\nPUBLIC_WEB_BASE_URL = "https://www.mmdbkk.com"\n\n[[services]]\nbinding = "ADMIN_WORKER"\nservice = "admin-worker"\n`;

const binding=(name,type,extra={})=>({name,type,...extra});
function settings(){
  return {
    compatibility_date:'2026-03-25',compatibility_flags:[],usage_model:'standard',
    bindings:[
      binding('AIRTABLE_BASE_ID','plain_text',{text:'appsV1ILPRfIjkaYg'}),
      binding('PUBLIC_WEB_BASE_URL','plain_text',{text:'https://www.mmdbkk.com'}),
      binding('AIRTABLE_ENTITLEMENT_MEMBERSTACK_ID_FIELD','plain_text',{text:'memberstack_id'}),
      binding('AIRTABLE_MEMBERS_MEMBERSTACK_ID_FIELD','plain_text',{text:'memberstack_id'}),
      binding('AIRTABLE_API_KEY','secret_text'),
      binding('AUTH_SERVICE_IMMIGRATE_TO_PAYMENTS','secret_text'),
      binding('BROWSER_GATE_PASSWORD','secret_text'),binding('CONFIRM_KEY','secret_text'),
      binding('/eV6h915fcEk4jqqk8Fb5GlMfxZM8f7VzMplGdENwsE=','secret_text'),
      binding('INTERNAL_TOKEN','secret_text'),binding('LINE_CHANNEL_ACCESS_TOKEN','secret_text'),
      binding('LINE_CHANNEL_SECRET','secret_text'),binding('LINK_SIGNING_SECRET','secret_text'),
      binding('TELEGRAM_BOT_TOKEN','secret_text'),binding('TELEGRAM_WEBHOOK_SECRET_TOKEN','secret_text'),
      binding('ASSETS','assets'),binding('ADMIN_WORKER','service',{service:'admin-worker',environment:'production'}),
    ],
  };
}
function fixture({drift=false}={}){
  const calls=[];
  const fetcher=async(url,init={})=>{
    const parsed=new URL(url), prefix=`/client/v4/accounts/${account}/workers/scripts/immigrate-worker`;
    const path=parsed.pathname.startsWith(prefix)?parsed.pathname.slice(prefix.length)+parsed.search:parsed.pathname;
    calls.push({path,method:init.method||'GET'});
    let result;
    if(path==='/deployments?per_page=1')result={deployments:[{id:deployment,versions:[{version_id:drift?uploaded:version,percentage:100}]}]};
    else if(path==='/settings')result=settings();
    else if(path===`/versions/${version}`)result={id:version};
    else if(path===`/versions/${uploaded}`)result={id:uploaded,annotations:{'workers/message':`CEO theme release source=${commit}`}};
    else if(path===`/deployments/${deployment}`)result={id:deployment,strategy:'percentage',versions:[{version_id:uploaded,percentage:100}]};
    else if(path==='/deployments'&&init.method==='POST')result={id:deployment};
    else throw Error(`unexpected request ${path}`);
    return Response.json({success:true,result});
  };
  return {fetcher,calls};
}

test('config parser reads only the Worker vars, asset binding and service binding needed for readback',()=>{
  assert.deepEqual(parseImmigrateWorkerConfig(config),{
    worker:'immigrate-worker',compatibilityDate:'2026-03-25',
    vars:{AIRTABLE_BASE_ID:'appsV1ILPRfIjkaYg',PUBLIC_WEB_BASE_URL:'https://www.mmdbkk.com'},
    service:{name:'ADMIN_WORKER',service:'admin-worker'},assetBinding:'ASSETS',
  });
});

test('config parser keeps vars after blank lines and comments in the vars section',()=>{
  const source=`name = "immigrate-worker"\nmain = "src/index.ts"\ncompatibility_date = "2026-03-25"\n\n[assets]\ndirectory = "./public"\nbinding = "ASSETS"\n\n[vars]\nFIRST = "one"\n\n# Keep parsing across comments and blank lines.\nSECOND = "two"\n\n[[services]]\nbinding = "ADMIN_WORKER"\nservice = "admin-worker"\n`;
  assert.deepEqual(parseImmigrateWorkerConfig(source).vars,{FIRST:'one',SECOND:'two'});
});

test('preflight compares active version and config using read-only Worker API calls',async()=>{
  const f=fixture();
  const result=await verifyImmigrateWorkerBaseline({expectedVersion:version,expectedDeployment:deployment,token:'test',configText:config,fetcher:f.fetcher});
  assert.equal(result.configuration,'matched');
  assert.equal(result.routesChanged,false);
  assert.ok(f.calls.every(call=>call.method==='GET'));
});

test('baseline drift fails closed before a Worker deployment or route write',async()=>{
  const f=fixture({drift:true});
  await assert.rejects(()=>verifyImmigrateWorkerBaseline({expectedVersion:version,expectedDeployment:deployment,token:'test',configText:config,fetcher:f.fetcher}),/baseline drifted/);
  assert.ok(f.calls.every(call=>call.method==='GET'));
});

test('promotion deploys only the uploaded SHA-matched version and never writes routes',async()=>{
  const f=fixture();
  const result=await promoteImmigrateWorkerVersion({uploadedVersion:uploaded,expectedVersion:version,expectedDeployment:deployment,token:'test',configText:config,commitSha:commit,fetcher:f.fetcher});
  assert.equal(result.version,uploaded);
  assert.equal(result.routesChanged,false);
  assert.equal(f.calls.filter(call=>call.path==='/deployments'&&call.method==='POST').length,1);
  assert.ok(f.calls.every(call=>!call.path.includes('/zones/')&& !call.path.includes('/routes')));
});

test('promotion refuses a version without the approved source SHA and leaves traffic untouched',async()=>{
  const f=fixture();
  f.fetcher=async(url,init={})=>{
    const response=await fixture().fetcher(url,init);
    const parsed=new URL(url);
    if(parsed.pathname.endsWith(`/versions/${uploaded}`))return Response.json({success:true,result:{id:uploaded,annotations:{'workers/message':'wrong source'}}});
    return response;
  };
  await assert.rejects(()=>promoteImmigrateWorkerVersion({uploadedVersion:uploaded,expectedVersion:version,expectedDeployment:deployment,token:'test',configText:config,commitSha:commit,fetcher:f.fetcher}),/does not match the approved commit/);
});

test('release workflow only supports manual approved code releases and contains no route mutation',()=>{
  const source=readFileSync(new URL('../.github/workflows/deploy-immigrate-worker-code-only.yml',import.meta.url),'utf8');
  assert.match(source,/workflow_dispatch:/);
  assert.match(source,/inputs\.approved_sha == github\.sha/);
  assert.match(source,/--dry-run --keep-vars/);
  assert.match(source,/--promote/);
  assert.doesNotMatch(source,/wrangler (route|deploy)(\s|$)|Sync exact MMD internal routes|Patch Customer Data/);
});
