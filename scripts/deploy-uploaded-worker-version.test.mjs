import test from 'node:test';
import assert from 'node:assert/strict';
import {deployUploadedWorkerVersion} from './deploy-uploaded-worker-version.mjs';
const version='b70239bd-00ba-423a-96f8-e04359725bd0',deployment='11111111-1111-1111-1111-111111111111';
const args={worker:'admin-worker',version,account:'a'.repeat(32),token:'test-token'};
const result=data=>Response.json({success:true,result:data});
test('promotes only the uploaded version to 100% and verifies exact deployment without listing history',async()=>{
  const calls=[];
  const out=await deployUploadedWorkerVersion({...args,fetcher:async(url,init)=>{
    calls.push({url,init});if(calls.length===1)return result({id:version});if(calls.length===2){assert.deepEqual(JSON.parse(init.body),{strategy:'percentage',versions:[{version_id:version,percentage:100}]});return result({id:deployment});}return result({id:deployment,strategy:'percentage',versions:[{version_id:version,percentage:100}]});
  }});assert.equal(out.deployment,deployment);assert.match(calls[0].url,/\/versions\//);assert.equal(calls[1].init.method,'POST');assert.match(calls[2].url,/\/deployments\//);assert.ok(calls.every(c=>!c.url.includes('force=')));
});
test('wrong uploaded version prevents promotion',async()=>{let calls=0;await assert.rejects(()=>deployUploadedWorkerVersion({...args,fetcher:async()=>{calls++;return result({id:'wrong'});}}),/version readback mismatch/);assert.equal(calls,1);});
test('wrong deployment allocation fails readback verification',async()=>{let calls=0;await assert.rejects(()=>deployUploadedWorkerVersion({...args,fetcher:async()=>{calls++;return calls===1?result({id:version}):calls===2?result({id:deployment}):result({id:deployment,strategy:'percentage',versions:[{version_id:version,percentage:50}]});}}),/Deployment readback mismatch/);});
test('API and malformed responses fail closed without printing credentials',async()=>{await assert.rejects(()=>deployUploadedWorkerVersion({...args,fetcher:async()=>new Response('html',{status:200})}),error=>error.message.includes('failed (200)')&&!error.message.includes(args.token));});
