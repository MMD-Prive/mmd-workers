import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const workflow=readFileSync(new URL('../../.github/workflows/deploy-sigil-public-floor-5000.yml',import.meta.url),'utf8');
const job=name=>{const m=workflow.match(new RegExp('^  '+name+':\\n([\\s\\S]*?)(?=^  [a-z-]+:\\n|(?![\\s\\S]))','m'));assert.ok(m,name);return m[1];};
test('production paths are dispatch-only and gated on owner, main, first attempt, exact SHA',()=>{
 assert.match(workflow,/^  workflow_dispatch:/m);assert.doesNotMatch(workflow,/^  (push|workflow_run|schedule):/m);
 for(const s of ["github.actor == 'mmdprive'","github.run_attempt == 1","github.ref == 'refs/heads/main'","inputs.approved_sha == github.sha","inputs.production_approved == true"])assert.ok(job('owner-policy').includes(s),s);
 assert.doesNotMatch(workflow,/continue-on-error|\|\| true|wrangler|--execute-approved|workflow_call/);
});
test('capture and release both need the owner preflight and the protected environment',()=>{
 for(const name of ['capture','release']){const j=job(name);assert.match(j,/needs: owner-policy/);assert.match(j,/environment: member-pages-code-only-owner/);}
 assert.match(job('capture'),/if: inputs\.mode == 'capture'/);assert.match(job('release'),/if: inputs\.mode == 'release'/);
});
test('the owner preflight and the review job hold no Cloudflare credentials or environment',()=>{
 for(const name of ['review','owner-policy']){const j=job(name);assert.doesNotMatch(j,/CLOUDFLARE|secrets\.|environment:|--execute|--capture|--fetch-baseline/);}
 assert.match(job('owner-policy'),/preflight:true/);
});
test('Cloudflare token is only given to the three transport steps and the capture step never writes',()=>{
 assert.equal((workflow.match(/CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/g)||[]).length,3);
 const capture=job('capture');assert.match(capture,/floor-release-adapter\.mjs --capture > "\$CAPTURE_PATH"/);assert.doesNotMatch(capture,/\|\s*tee/,'a pipe would hide a failed capture behind tee');assert.doesNotMatch(capture,/--execute|--fetch-baseline/);
 assert.equal((workflow.match(/floor-release-adapter\.mjs --execute/g)||[]).length,1);
});
test('release order: fresh approval, tests, read-only baseline, offline build, candidate tests, then the sole publish',()=>{
 const j=job('release');let at=-1;
 for(const s of ['Initialize safe receipt','Verify fresh exact-run owner approval','Test release transport and workflow guards','--fetch-baseline','build-floor-overlay.mjs --baseline','SIGIL_BASELINE:','floor-release-adapter.mjs --execute','Preserve safe release receipt']){const next=j.indexOf(s);assert.ok(next>at,s);at=next;}
 assert.match(j,/if: always\(\)/);assert.match(j,/sigil-floor-receipt\.jsonl/);assert.match(j,/if-no-files-found: error/);
});
test('no credentials persist, tools install nothing, and the scope and no-migration policy are fixed',()=>{
 assert.doesNotMatch(workflow,/npm install|npx |pip install/);
 const checkouts=(workflow.match(/actions\/checkout@v5/g)||[]).length;assert.equal((workflow.match(/persist-credentials: false/g)||[]).length,checkouts);
 assert.match(workflow,/APPROVED_RELEASE_SCOPE: sigil-public-floor-5000-code-only/);assert.match(workflow,/APPROVED_MIGRATION_POLICY: none-retain-existing/);assert.match(workflow,/RELEASE_MODE: sigil-public-floor-5000-code-only/);
});
test('deployment concurrency is shared with the other production releases',()=>{
 assert.match(workflow,/group:.*sigil-floor-5000-review-.*deploy-member-pages-worker-production/);assert.match(workflow,/cancel-in-progress: false/);
});
test('artifacts and receipts live outside the checkout and evidence uploads are exact files only',()=>{
 assert.doesNotMatch(workflow,/runner\./);
 for(const [key,path] of [['ARTIFACT_ROOT','sigil-floor-artifacts'],['JOURNAL_PATH','sigil-floor-receipt.jsonl'],['CAPTURE_PATH','sigil-floor-capture.json']])assert.ok(workflow.includes(key+': ${{ github.workspace }}/'+path));
 const block=workflow.split('      - name: Preserve exact candidate bytes and non-sensitive proof')[1];
 assert.ok(block);assert.match(block,/if: always\(\)/);for(const f of ['sigil-candidate.mjs','sigil-floor-proof.json'])assert.ok(block.includes('/'+f));
 assert.doesNotMatch(block,/settings|bindings|baseline|\/\*|ARTIFACT_ROOT/);
});
test('the PR review job runs only offline tests and the contract is never half-sealed',()=>{
 const review=job('review');assert.match(review,/if: github\.event_name == 'pull_request'/);assert.match(review,/floor-release-workflow\.test\.mjs/);
 const c=JSON.parse(readFileSync(new URL('./floor-release-contract.json',import.meta.url),'utf8'));
 // Sealed fields are filled by a separate owner PR after a read-only capture; this tooling never seals itself.
 // A half-sealed contract is a mistake: it must be all null (fail closed) or all valid.
 const fields=[c.target.version,c.target.deployment,c.target.configuration_sha256,c.approval_ref_sha256];
 const nulls=fields.filter(v=>v===null).length;assert.ok(nulls===0||nulls===fields.length,'half-sealed contract');
 if(nulls===0){assert.match(c.target.version,/^[a-f0-9-]{36}$/);assert.match(c.target.deployment,/^[a-f0-9-]{36}$/);assert.match(c.target.configuration_sha256,/^[a-f0-9]{64}$/);assert.match(c.approval_ref_sha256,/^[a-f0-9]{64}$/);}
});
