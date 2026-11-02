// Called only by the dedicated manual owner workflow. No execution on import.
import assert from 'node:assert/strict';
import {openSync,writeFileSync,fsyncSync,closeSync,renameSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {verifyBookingOwnerApproval} from './member-booking-owner-approval.mjs';
import {runApprovedBookingRelease} from './member-booking-release-adapter.mjs';
export async function bookingReleaseMain(args,env=process.env){
 assert.equal(args.length,1);assert.ok(['--verify-protection','--execute-approved'].includes(args[0]));
 if(args[0]==='--verify-protection'){await verifyBookingOwnerApproval(env,fetch,{preflight:true});return;}
 assert.equal(env.RELEASE_MODE,'booking-artifact-with-migration');assert.equal(env.PRODUCTION_APPROVED,'true');assert.match(env.GITHUB_RUN_ID||'',/^[1-9][0-9]*$/);assert.equal(env.GITHUB_RUN_ATTEMPT,'1');assert.ok(env.RUNNER_TEMP&&env.ESBUILD_BIN);
 const journal=join(resolve(env.RUNNER_TEMP),'booking-release-'+env.GITHUB_RUN_ID+'.json');assert.ok(!existsSync(journal),'receipt already exists; do not repeat release');
 const fd=openSync(journal,'wx',0o600);writeFileSync(fd,JSON.stringify({phase:'started',sha:env.GITHUB_SHA,retry_allowed:false})+'\n');fsyncSync(fd);closeSync(fd);
 const save=receipt=>{const temp=journal+'.tmp';const f=openSync(temp,'wx',0o600);try{writeFileSync(f,JSON.stringify(receipt,null,2)+'\n');fsyncSync(f);}finally{closeSync(f);}renameSync(temp,journal);};
 await runApprovedBookingRelease({env,directory:process.cwd(),esbuild:env.ESBUILD_BIN,save});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){bookingReleaseMain(process.argv.slice(2)).then(()=>console.log('Booking release stage verified.')).catch(()=>{console.error('Booking release stopped; inspect safe receipt and do not retry automatically.');process.exitCode=1;});}
