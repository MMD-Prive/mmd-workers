// Credential adapter for the existing owner-protected workflow; importing is inert.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,openSync,fsyncSync,closeSync,renameSync,unlinkSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {ACCOUNT,buildMemberPagesBundle} from './member-pages-code-only-release.mjs';
import {RECOVERY_TARGET as T} from './member-pages-uploaded-recovery.mjs';
import {ORIGINAL_ARTIFACT,checkRecoverySources,createPromotionOnlyTransport,promoteExistingStartupVersion} from './member-pages-promotion-only-recovery.mjs';

const hash=x=>createHash('sha256').update(x).digest('hex');
export function createRecoveryGitHubReader(env,request=fetch) {
  const token=env.GH_TOKEN;assert.ok(typeof token==='string'&&token.length>0);assert.match(env.GITHUB_RUN_ID||'',/^[1-9][0-9]*$/);
  const paths=new Set(['/actions/runs/'+env.GITHUB_RUN_ID,'/actions/runs/'+env.GITHUB_RUN_ID+'/approvals',
    '/actions/runs/'+T.run,'/actions/artifacts/'+ORIGINAL_ARTIFACT.id,'/git/ref/heads/main',
    '/environments/member-pages-code-only-owner','/environments/member-pages-code-only-owner/deployment-branch-policies?per_page=100']);
  return async(path,options={})=>{
    assert.equal(options.method||'GET','GET');assert.ok(Object.keys(options).every(k=>k==='method'));assert.ok(paths.has(path));
    const r=await request('https://api.github.com/repos/MMD-Prive/mmd-workers'+path,{
      method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
    assert.equal(r.status,200);return r.json();
  };
}

// gh handles the authenticated archive redirect; no bearer token is manually forwarded.
// Verify pinned archive bytes before inspecting ZIP contents. Never extract to disk.
export function readOriginalArchive(id,options={},run=execFileSync) {
  assert.equal(id,ORIGINAL_ARTIFACT.id);assert.equal(options.method||'GET','GET');assert.ok(Object.keys(options).every(k=>k==='method'));
  const archiveBytes=run('gh',['api',`repos/MMD-Prive/mmd-workers/actions/artifacts/${id}/zip`],
    {encoding:null,stdio:['ignore','pipe','ignore'],timeout:30000,maxBuffer:4*1024*1024});
  assert.equal(hash(archiveBytes),ORIGINAL_ARTIFACT.archive_sha256);
  const receiptBytes=run('python3',['-c',
    'import io,sys,zipfile\nz=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))\nn=z.namelist()\nassert n == ["member-pages-code-only-receipt.json"]\ni=z.getinfo(n[0])\nassert i.file_size < 1024*1024\nsys.stdout.buffer.write(z.read(n[0]))'],
    {input:archiveBytes,encoding:null,stdio:['pipe','pipe','ignore'],timeout:10000,maxBuffer:1024*1024});
  assert.equal(hash(receiptBytes),ORIGINAL_ARTIFACT.receipt_sha256);
  return {archiveBytes,receiptBytes};
}

export function validateRecoveryInvocation(env,args) {
  assert.deepEqual(args,['--execute-approved']);
  assert.equal(env.CLOUDFLARE_ACCOUNT_ID,ACCOUNT);
  assert.equal(env.PRODUCTION_APPROVED,'true');assert.equal(env.RECOVERY_MODE,'promote-existing');
  assert.equal(env.EXPECTED_UPLOADED_VERSION,T.uploaded_version);
  assert.equal(env.EXPECTED_VERSION,T.baseline_version);assert.equal(env.EXPECTED_DEPLOYMENT,T.baseline_deployment);
  assert.ok(isAbsolute(env.SOURCE_DIRECTORY||''));assert.ok(isAbsolute(env.RUNNER_TEMP||''));
  assert.ok(env.GH_TOKEN);assert.ok(env.CLOUDFLARE_API_TOKEN);
}

const check=ok=>{if(!ok)throw Error('Recovery journal validation failed.');};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const SHA=/^[a-f0-9]{40}$/;
const phases=new Set(['preflight','validated-not-promoted','promotion-attempted-outcome-unknown','complete','stopped']);
const diagnosticPairs={
 RECOVERY_OWNER_INPUT:'OWNER_INPUT_INVALID',RECOVERY_OWNER_RUN:'RUN_IDENTITY_INVALID',RECOVERY_MAIN_CHECK:'MAIN_DRIFT',RECOVERY_OWNER_POLICY:'OWNER_POLICY_INVALID',RECOVERY_OWNER_BRANCH:'BRANCH_POLICY_INVALID',RECOVERY_OWNER_APPROVAL:'APPROVAL_RECEIPT_INVALID',ORIGINAL_ARTIFACT_CHECK:'ORIGINAL_ARTIFACT_UNVERIFIED',PINNED_SOURCE_CHECK:'SOURCE_SCOPE_UNVERIFIED',RECOVERY_READBACK:'RECOVERY_EVIDENCE_UNVERIFIED',RECOVERY_FINAL_READBACK:'FINAL_BASELINE_OR_BYTES_DRIFT',RECOVERY_PROMOTION_REQUEST:'PROMOTION_OUTCOME_UNKNOWN',RECOVERY_PROMOTION_ID:'PROMOTION_ID_INVALID',RECOVERY_POST_PROMOTION_CHECK:'POST_PROMOTION_EVIDENCE_UNVERIFIED',RECOVERY_VALIDATION_JOURNAL:'JOURNAL_WRITE_FAILED',RECOVERY_ATTEMPT_JOURNAL:'JOURNAL_WRITE_FAILED',RECOVERY_COMPLETE_JOURNAL:'JOURNAL_WRITE_FAILED',RECOVERY_FINAL_ACTIVE_CHECK:'FINAL_ACTIVE_DEPLOYMENT_DRIFT',RECOVERY_FINAL_VERSION_CHECK:'FINAL_VERSION_ORDER_DRIFT',RECOVERY_ADAPTER_SETUP:'ADAPTER_SETUP_FAILED'};
export function sanitizeRecoveryJournal(value) {
  check(value?.worker==='member-pages-worker'&&phases.has(value.phase)&&value.source_sha===T.source_sha&&value.uploaded_version===T.uploaded_version&&value.overall_phase==='OPEN');
  check(value.release_sha===null||(typeof value.release_sha==='string'&&SHA.test(value.release_sha)));
  const result={phase:value.phase,worker:value.worker,source_sha:value.source_sha,release_sha:value.release_sha,uploaded_version:value.uploaded_version,overall_phase:'OPEN'};
  if(value.deployment!==undefined){check(typeof value.deployment==='string'&&UUID.test(value.deployment));result.deployment=value.deployment;}
  if(value.stopped_after!==undefined){check(phases.has(value.stopped_after));result.stopped_after=value.stopped_after;}
  if(value.diagnostic!==undefined){const {stage,reason}=value.diagnostic;check(Object.hasOwn(diagnosticPairs,stage)&&diagnosticPairs[stage]===reason);result.diagnostic={stage,reason};}
  return result;
}
export function createDurableRecoveryJournal(directory,runId) {
  check(isAbsolute(directory)&&/^[1-9][0-9]*$/.test(runId));const root=realpathSync(directory);
  const path=join(root,'member-pages-code-only-receipt.json');
  return {path,save(value){
    const bytes=JSON.stringify(sanitizeRecoveryJournal(value),null,2)+'\n';
    const temporary=join(root,`member-pages-recovery-${runId}-${randomUUID()}.tmp`);let fd;
    try{fd=openSync(temporary,'wx',0o600);writeFileSync(fd,bytes);fsyncSync(fd);closeSync(fd);fd=undefined;renameSync(temporary,path);
      const dir=openSync(root,'r');try{fsyncSync(dir);}finally{closeSync(dir);}
    }catch{if(fd!==undefined)try{closeSync(fd);}catch{}try{unlinkSync(temporary);}catch{}throw Error('Recovery journal write failed.');}
  }};
}
const environmentKeys=['GITHUB_EVENT_NAME','GITHUB_REF','GITHUB_REPOSITORY','GITHUB_REPOSITORY_ID','GITHUB_ACTOR','GITHUB_ACTOR_ID','GITHUB_TRIGGERING_ACTOR','GITHUB_SHA','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','APPROVED_SHA','RECOVERY_MODE','PRODUCTION_APPROVED','EXPECTED_UPLOADED_VERSION','EXPECTED_VERSION','EXPECTED_DEPLOYMENT','APPROVAL_REF'];

export async function runRecovery(env,args) {
  validateRecoveryInvocation(env,args);
  const dir=mkdtempSync(join(tmpdir(),'member-pages-existing-'));
  const journal=createDurableRecoveryJournal(env.RUNNER_TEMP,env.GITHUB_RUN_ID);
  const sourceDirectory=realpathSync(env.SOURCE_DIRECTORY),releaseDirectory=realpathSync(process.cwd());
  assert.notEqual(sourceDirectory,releaseDirectory);
  const publicEnv=Object.freeze(Object.fromEntries(environmentKeys.map(k=>[k,env[k]])));
  return promoteExistingStartupVersion({env:publicEnv,
    ghRead:createRecoveryGitHubReader(env),artifactRead:readOriginalArchive,
    cf:createPromotionOnlyTransport(env.CLOUDFLARE_API_TOKEN),
    sourceCheck:async releaseSha=>{
      const evidence=checkRecoverySources(releaseSha,sourceDirectory,releaseDirectory);
      const bytes=buildMemberPagesBundle(dir,sourceDirectory);
      assert.equal(hash(bytes),T.bundle_sha256,'rebuilt source differs from uploaded version');
      return evidence;
    },
    save:record=>journal.save(record),
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runRecovery(process.env,process.argv.slice(2)).then(()=>console.log('Existing version promotion readback complete; browser acceptance remains separate.'))
    .catch(()=>{console.error('Existing version recovery stopped; inspect sanitized receipt; never retry automatically.');process.exitCode=1;});
}
