import {execFileSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,sep} from 'node:path';

export async function createPinnedSource(root,source){
 if(!/^[0-9a-f]{40}$/.test(source))throw Error('full_source_sha_required');
 execFileSync('git',['merge-base','--is-ancestor',source,'HEAD'],{cwd:root});
 const snapshot=await mkdtemp(join(tmpdir(),'mmd-co-model-source-'));
 try{
  const archive=execFileSync('git',['archive',source,'member-pages-worker','payments-worker','auth-worker','admin-worker','partners-worker','shared','webflow'],{cwd:root,maxBuffer:128*1024*1024});
  execFileSync('tar',['-xf','-','-C',snapshot],{input:archive});
  return snapshot+sep;
 }catch(error){await rm(snapshot,{recursive:true,force:true});throw error;}
}
