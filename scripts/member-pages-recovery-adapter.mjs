// Credential adapter for the existing owner-protected workflow; importing is inert.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {ACCOUNT,buildMemberPagesBundle} from './member-pages-code-only-release.mjs';
import {RECOVERY_TARGET as T} from './member-pages-uploaded-recovery.mjs';
import {ORIGINAL_ARTIFACT,checkRecoverySources,createPromotionOnlyTransport,promoteExistingStartupVersion} from './member-pages-promotion-only-recovery.mjs';

const hash=x=>createHash('sha256').update(x).digest('hex');
export function createRecoveryGitHubReader(env,request=fetch) {
  assert.ok(env.GH_TOKEN);assert.match(env.GITHUB_RUN_ID||'',/^[1-9][0-9]*$/);
  const paths=new Set(['/actions/runs/'+env.GITHUB_RUN_ID,'/actions/runs/'+env.GITHUB_RUN_ID+'/approvals',
    '/actions/runs/'+T.run,'/actions/artifacts/'+ORIGINAL_ARTIFACT.id,'/git/ref/heads/main',
    '/environments/member-pages-code-only-owner','/environments/member-pages-code-only-owner/deployment-branch-policies?per_page=100']);
  return async(path,options={})=>{
    assert.equal(options.method||'GET','GET');assert.equal(options.body,undefined);assert.ok(paths.has(path));
    const r=await request('https://api.github.com/repos/MMD-Prive/mmd-workers'+path,{
      method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{Authorization:'Bearer '+env.GH_TOKEN,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
    assert.equal(r.status,200);return r.json();
  };
}

// gh handles the authenticated archive redirect; no bearer token is manually forwarded.
// Verify pinned archive bytes before inspecting ZIP contents. Never extract to disk.
export function readOriginalArchive(id,options={},run=execFileSync) {
  assert.equal(id,ORIGINAL_ARTIFACT.id);assert.equal(options.method||'GET','GET');
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
  assert.ok(env.SOURCE_DIRECTORY);assert.ok(env.RUNNER_TEMP);
  assert.ok(env.GH_TOKEN);assert.ok(env.CLOUDFLARE_API_TOKEN);
}

export async function runRecovery(env,args) {
  validateRecoveryInvocation(env,args);
  const dir=mkdtempSync(join(tmpdir(),'member-pages-existing-'));
  const journal=resolve(env.RUNNER_TEMP,'member-pages-code-only-receipt.json');
  return promoteExistingStartupVersion({env,
    ghRead:createRecoveryGitHubReader(env),artifactRead:readOriginalArchive,
    cf:createPromotionOnlyTransport(env.CLOUDFLARE_API_TOKEN),
    sourceCheck:async releaseSha=>{
      const evidence=checkRecoverySources(releaseSha,env.SOURCE_DIRECTORY,process.cwd());
      const bytes=buildMemberPagesBundle(dir,env.SOURCE_DIRECTORY);
      assert.equal(hash(bytes),T.bundle_sha256,'rebuilt source differs from uploaded version');
      return evidence;
    },
    save:record=>writeFileSync(journal,JSON.stringify(record,null,2),{mode:0o600}),
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runRecovery(process.env,process.argv.slice(2)).then(()=>console.log('Existing version promotion readback complete; browser acceptance remains separate.'))
    .catch(()=>{console.error('Existing version recovery stopped; inspect sanitized receipt; never retry automatically.');process.exitCode=1;});
}
