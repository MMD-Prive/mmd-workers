// Guarded recovery library. Execution adapter is wired only to the owner-protected workflow.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ROOT, VERSION_ROOT, ZONE, CODE_ONLY_SOURCE_SHA, activeVersion,
  versionConfiguration, versionAnnotations, inspectCodeOnlyCheckouts, assertTmibPublicReaderArtifact} from './member-pages-code-only-release.mjs';
import {RECOVERY_TARGET as T, inspectUploadedRecovery, verifyRecoveryArtifact} from './member-pages-uploaded-recovery.mjs';

export const RECOVERY_WORKFLOW = '.github/workflows/deploy-member-pages-worker-code-only.yml';
export const ORIGINAL_ARTIFACT = Object.freeze({id:12296886000,
  name:'member-pages-worker-code-only-39488159580',
  archive_sha256:'907ba8593db27d9770a10aa0219ff1eac7864f6d7e996222569343f637de6be6',
  receipt_sha256:'cd2265a91ccfa4f04197a3cfd1eb6611cf43f2721d1213df21b8ad6cf442ffd7'});
const ENVIRONMENT='member-pages-code-only-owner', ENVIRONMENT_ID=24708510559;
const owner=u=>u?.login==='mmdprive'&&u.id===216427112;
const sha=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(x);
const sort=x=>Array.isArray(x)?x.map(sort):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sort(x[k])])):x;
const canonical=x=>JSON.stringify(sort(x));
const ordered=x=>[...x].sort((a,b)=>canonical(a).localeCompare(canonical(b)));
const bytesHash=bytes=>{assert.ok(bytes instanceof Uint8Array&&bytes.byteLength>0);return createHash('sha256').update(bytes).digest('hex');};
const digest=x=>bytesHash(Buffer.from(canonical(x)));
const same=(a,b)=>assert.equal(canonical(a),canonical(b));
const reasons=Object.freeze({RECOVERY_FINAL_ACTIVE_CHECK:'FINAL_ACTIVE_DEPLOYMENT_DRIFT',RECOVERY_FINAL_VERSION_CHECK:'FINAL_VERSION_ORDER_DRIFT',RECOVERY_VALIDATION_JOURNAL:'JOURNAL_WRITE_FAILED',RECOVERY_ATTEMPT_JOURNAL:'JOURNAL_WRITE_FAILED',RECOVERY_COMPLETE_JOURNAL:'JOURNAL_WRITE_FAILED',RECOVERY_OWNER_INPUT:'OWNER_INPUT_INVALID',RECOVERY_OWNER_RUN:'RUN_IDENTITY_INVALID',RECOVERY_MAIN_CHECK:'MAIN_DRIFT',RECOVERY_OWNER_POLICY:'OWNER_POLICY_INVALID',RECOVERY_OWNER_BRANCH:'BRANCH_POLICY_INVALID',RECOVERY_OWNER_APPROVAL:'APPROVAL_RECEIPT_INVALID',ORIGINAL_ARTIFACT_CHECK:'ORIGINAL_ARTIFACT_UNVERIFIED',PINNED_SOURCE_CHECK:'SOURCE_SCOPE_UNVERIFIED',RECOVERY_READBACK:'RECOVERY_EVIDENCE_UNVERIFIED',RECOVERY_FINAL_READBACK:'FINAL_BASELINE_OR_BYTES_DRIFT',RECOVERY_PROMOTION_REQUEST:'PROMOTION_OUTCOME_UNKNOWN',RECOVERY_PROMOTION_ID:'PROMOTION_ID_INVALID',RECOVERY_POST_PROMOTION_CHECK:'POST_PROMOTION_EVIDENCE_UNVERIFIED'});
const body=()=>({strategy:'percentage',versions:[{version_id:T.uploaded_version,percentage:100}]});

export function checkRecoverySources(releaseSha,sourceDirectory,releaseDirectory) {
  return inspectCodeOnlyCheckouts(releaseSha,sourceDirectory,{releaseDirectory});
}

// No POST is ever accepted by the GitHub reader. All run/environment evidence is fresh.
export async function verifyRecoveryOwner(env,read,mark=()=>{}) {
  mark('RECOVERY_OWNER_INPUT');
  assert.equal(env.GITHUB_EVENT_NAME,'workflow_dispatch');assert.equal(env.GITHUB_REF,'refs/heads/main');
  assert.equal(env.GITHUB_REPOSITORY?.toLowerCase(),'mmd-prive/mmd-workers');assert.equal(env.GITHUB_REPOSITORY_ID,'1121397236');
  assert.equal(env.GITHUB_ACTOR,'mmdprive');assert.equal(env.GITHUB_ACTOR_ID,'216427112');assert.equal(env.GITHUB_TRIGGERING_ACTOR,'mmdprive');
  assert.ok(sha(env.GITHUB_SHA));assert.equal(env.APPROVED_SHA,env.GITHUB_SHA);
  assert.equal(env.RECOVERY_MODE,'promote-existing');assert.equal(env.PRODUCTION_APPROVED,'true');
  assert.equal(env.EXPECTED_UPLOADED_VERSION,T.uploaded_version);assert.equal(env.EXPECTED_VERSION,T.baseline_version);
  assert.equal(env.EXPECTED_DEPLOYMENT,T.baseline_deployment);assert.ok(env.APPROVAL_REF?.trim());
  assert.match(env.GITHUB_RUN_ID||'',/^[1-9][0-9]*$/);assert.notEqual(env.GITHUB_RUN_ID,String(T.run));
  assert.equal(env.GITHUB_RUN_ATTEMPT,'1');
  const get=path=>read(path,{method:'GET'});
  mark('RECOVERY_OWNER_RUN');
  const run=await get('/actions/runs/'+env.GITHUB_RUN_ID);
  assert.equal(String(run.id),env.GITHUB_RUN_ID);assert.equal(run.repository?.id,1121397236);
  assert.equal(run.event,'workflow_dispatch');assert.equal(run.head_branch,'main');assert.equal(run.head_sha,env.GITHUB_SHA);
  assert.ok([RECOVERY_WORKFLOW,RECOVERY_WORKFLOW+'@main'].includes(run.path));
  assert.ok(owner(run.actor)&&owner(run.triggering_actor));assert.equal(run.run_attempt,1);
  mark('RECOVERY_MAIN_CHECK');assert.equal((await get('/git/ref/heads/main')).object?.sha,env.GITHUB_SHA);
  mark('RECOVERY_OWNER_POLICY');const p=await get('/environments/'+ENVIRONMENT);
  assert.equal(p.id,ENVIRONMENT_ID);assert.equal(p.name,ENVIRONMENT);assert.equal(p.can_admins_bypass,false);
  const rules=p.protection_rules?.filter(r=>r.type==='required_reviewers');assert.equal(rules?.length,1);
  assert.equal(rules[0].prevent_self_review,false);assert.equal(rules[0].reviewers?.length,1);
  assert.equal(rules[0].reviewers[0].type,'User');assert.ok(owner(rules[0].reviewers[0].reviewer));
  same(p.deployment_branch_policy,{protected_branches:false,custom_branch_policies:true});
  mark('RECOVERY_OWNER_BRANCH');const branches=await get('/environments/'+ENVIRONMENT+'/deployment-branch-policies?per_page=100');
  assert.equal(branches.total_count,1);assert.equal(branches.branch_policies?.length,1);same(branches.branch_policies[0].name,'main');assert.equal(branches.branch_policies[0].type,'branch');
  mark('RECOVERY_OWNER_APPROVAL');const history=await get('/actions/runs/'+env.GITHUB_RUN_ID+'/approvals');
  assert.ok(Array.isArray(history)&&history.length===1);assert.equal(history[0].state,'approved');assert.ok(owner(history[0].user));
  assert.equal(history[0].environments?.length,1);
  // GitHub includes metadata alongside identity; policy is checked independently above.
  assert.equal(history[0].environments[0]?.id,p.id);
  assert.equal(history[0].environments[0]?.name,ENVIRONMENT);
}

export async function authenticateOriginalArtifact(ghRead,artifactRead) {
  const run=await ghRead('/actions/runs/'+T.run,{method:'GET'});
  assert.equal(run.id,T.run);assert.equal(run.repository?.id,1121397236);assert.equal(run.run_attempt,1);
  assert.equal(run.head_sha,T.original_release_sha);assert.equal(run.head_branch,'main');assert.equal(run.event,'workflow_dispatch');
  assert.ok(['.github/workflows/deploy-member-pages-worker-code-only.yml','.github/workflows/deploy-member-pages-worker-code-only.yml@main'].includes(run.path));
  assert.equal(run.status,'completed');assert.equal(run.conclusion,'failure');assert.ok(owner(run.actor)&&owner(run.triggering_actor));
  const a=await ghRead('/actions/artifacts/'+ORIGINAL_ARTIFACT.id,{method:'GET'});
  assert.equal(a.id,ORIGINAL_ARTIFACT.id);assert.equal(a.name,ORIGINAL_ARTIFACT.name);assert.equal(a.expired,false);
  assert.equal(a.digest,'sha256:'+ORIGINAL_ARTIFACT.archive_sha256);
  assert.equal(a.workflow_run?.id,T.run);assert.equal(a.workflow_run?.head_sha,T.original_release_sha);
  assert.equal(a.workflow_run?.repository_id,1121397236);assert.equal(a.workflow_run?.head_repository_id,1121397236);
  // The adapter must GET this exact artifact. No URL from caller evidence is followed.
  const bytes=await artifactRead(ORIGINAL_ARTIFACT.id,{method:'GET'});
  assert.equal(bytesHash(bytes.archiveBytes),ORIGINAL_ARTIFACT.archive_sha256);
  assert.equal(bytesHash(bytes.receiptBytes),ORIGINAL_ARTIFACT.receipt_sha256);
  const receipt=JSON.parse(Buffer.from(bytes.receiptBytes).toString('utf8'));
  assert.equal(receipt.source_sha,CODE_ONLY_SOURCE_SHA);assert.equal(receipt.uploaded_version,T.uploaded_version);
  return receipt;
}

// Only this transport can write; only one exact deployment POST is permitted per instance.
export function createPromotionOnlyTransport(token,request=fetch) {
  assert.ok(typeof token==='string'&&token);let attempted=false;
  const readPaths=new Set([ROOT+'/deployments',ROOT+'/versions',ROOT+'/versions/'+T.baseline_version,
    ROOT+'/versions/'+T.uploaded_version,VERSION_ROOT+'/'+T.uploaded_version,ROOT+'/script-settings',
    ROOT+'/schedules',ROOT+'/subdomain',`/zones/${ZONE}/workers/routes`]);
  return async(path,options={})=>{
    const method=options.method||'GET';
    if(method==='GET'){
      assert.ok(readPaths.has(path)||(path.startsWith(ROOT+'/deployments/')&&uuid(path.slice((ROOT+'/deployments/').length))));
      if(options.query!==undefined){assert.equal(path,VERSION_ROOT+'/'+T.uploaded_version);same(options.query,{include:'modules'});}
      assert.equal(options.body,undefined);
    }else{
      assert.equal(method,'POST');assert.equal(path,ROOT+'/deployments');assert.equal(options.query,undefined);
      same(JSON.parse(options.body),body());assert.equal(attempted,false);attempted=true;
    }
    const suffix=options.query?'?include=modules':'';
    const res=await request('https://api.cloudflare.com/client/v4'+path+suffix,{method,redirect:'error',
      signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      ...(method==='POST'?{body:options.body}:{})});
    const payload=await res.json();assert.ok(res.ok&&payload?.success===true);return payload.result;
  };
}

async function verifyAfterPromotion(read,deploymentId,receipt) {
  const d=await read(ROOT+'/deployments/'+deploymentId,{method:'GET'});
  assert.equal(d.id,deploymentId);assert.equal(activeVersion(d),T.uploaded_version);
  const latest=(await read(ROOT+'/deployments',{method:'GET'})).deployments?.[0];same(latest,d);
  const versions=(await read(ROOT+'/versions',{method:'GET'})).items;
  assert.equal(versions?.[0]?.id,T.uploaded_version);assert.equal(versions?.[1]?.id,T.baseline_version);
  const v=await read(ROOT+'/versions/'+T.uploaded_version,{method:'GET'});assert.equal(v.id,T.uploaded_version);
  assert.equal(digest(versionConfiguration(v)),receipt.configuration_digest);
  const a=await read(VERSION_ROOT+'/'+T.uploaded_version,{method:'GET',query:{include:'modules'}});
  verifyRecoveryArtifact(a,T);const ann=versionAnnotations(a);
  assert.equal(ann?.['workers/commit_sha'],T.source_sha);assert.equal(ann?.['workers/message'],`member-pages code-only source-sha=${T.source_sha}`);
  assert.equal(digest(await read(ROOT+'/script-settings',{method:'GET'})),receipt.settings_digest);
  const schedules=await read(ROOT+'/schedules',{method:'GET'});assert.ok(Array.isArray(schedules?.schedules));
  const boundary={routes:ordered(await read(`/zones/${ZONE}/workers/routes`,{method:'GET'})),schedules:ordered(schedules.schedules),subdomain:await read(ROOT+'/subdomain',{method:'GET'})};
  assert.equal(digest(boundary),receipt.boundary_digest);
}

export async function promoteExistingStartupVersion(io) {
  const state={phase:'preflight',worker:'member-pages-worker',source_sha:T.source_sha,
    release_sha:null,uploaded_version:T.uploaded_version,overall_phase:'OPEN'};
  let stage='RECOVERY_OWNER_INPUT';const mark=x=>{stage=Object.hasOwn(reasons,x)?x:'RECOVERY_OWNER_INPUT';};
  const save=async phase=>{state.phase=phase;await io.save({...state});};
  try {
    await verifyRecoveryOwner(io.env,io.ghRead,mark);
    state.release_sha=io.env.GITHUB_SHA; // Only publish identity after live run/main checks pass.
    mark('ORIGINAL_ARTIFACT_CHECK');const receipt=await authenticateOriginalArtifact(io.ghRead,io.artifactRead);
    mark('PINNED_SOURCE_CHECK');const evidence=await io.sourceCheck(io.env.GITHUB_SHA,T.source_sha);
    assert.equal(evidence?.method,'separate-pinned-source-checkout');assert.equal(evidence.source_sha,T.source_sha);
    assert.equal(evidence.release_sha,io.env.GITHUB_SHA);assert.equal(evidence.config_unchanged,true);
    mark('RECOVERY_READBACK');const first=await inspectUploadedRecovery({originalReceipt:receipt,read:io.cf});
    assert.equal(first.state,'REVIEW_ONLY');assert.equal(first.artifact_bytes_match,true);
    const tmibArtifact=await io.cf(VERSION_ROOT+'/'+T.uploaded_version,{method:'GET',query:{include:'modules'}});
    verifyRecoveryArtifact(tmibArtifact,T);
    await (io.verifyTmibArtifact || assertTmibPublicReaderArtifact)(Buffer.from(tmibArtifact.modules[0].content_base64,'base64'));
    mark('RECOVERY_VALIDATION_JOURNAL');await save('validated-not-promoted');
    // Durably record conservative unknown-outcome intent before final live checks.
    // A slow journal must not leave a stale approval or production baseline at write time.
    mark('RECOVERY_ATTEMPT_JOURNAL');await save('promotion-attempted-outcome-unknown');
    // Final approval/main and complete baseline/bytes checks run after that await.
    await verifyRecoveryOwner(io.env,io.ghRead,mark);
    mark('RECOVERY_FINAL_READBACK');const final=await inspectUploadedRecovery({originalReceipt:receipt,read:io.cf});
    assert.equal(final.state,'REVIEW_ONLY');assert.equal(final.artifact_bytes_match,true);
    // Recheck owner/main after potentially slow byte readback, closest to mutation.
    await verifyRecoveryOwner(io.env,io.ghRead,mark);
    // Recheck cheap mutable Cloudflare pointers after slow byte and owner evidence reads.
    mark('RECOVERY_FINAL_VERSION_CHECK');
    const finalVersions=(await io.cf(ROOT+'/versions',{method:'GET'}))?.items;
    assert.equal(finalVersions?.[0]?.id,T.uploaded_version);assert.equal(finalVersions?.[1]?.id,T.baseline_version);
    mark('RECOVERY_FINAL_ACTIVE_CHECK');
    const finalDeployment=(await io.cf(ROOT+'/deployments',{method:'GET'}))?.deployments?.[0];
    assert.equal(finalDeployment?.id,T.baseline_deployment);assert.equal(activeVersion(finalDeployment),T.baseline_version);
    // No awaited journal or evidence operation intervenes between this comparison and POST.
    mark('RECOVERY_PROMOTION_REQUEST');
    const d=await io.cf(ROOT+'/deployments',{method:'POST',body:JSON.stringify(body())});
    mark('RECOVERY_PROMOTION_ID');assert.ok(uuid(d?.id)&&d.id!==T.baseline_deployment);state.deployment=d.id;
    mark('RECOVERY_POST_PROMOTION_CHECK');await verifyAfterPromotion(io.cf,d.id,receipt);
    mark('RECOVERY_COMPLETE_JOURNAL');await save('complete');return {...state};
  } catch {
    state.stopped_after=state.phase;
    // mark is only called with fixed literals above or in the fixed owner checker.
    state.diagnostic={stage,reason:reasons[stage]};
    try{await save('stopped');}catch{} // Never expose journal errors, credentials or provider bodies.
    throw new Error('Promotion-only recovery stopped; inspect sanitized receipt; never retry automatically.');
  }
}
