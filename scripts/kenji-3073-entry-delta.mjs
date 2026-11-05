// Local-only artifact construction. No credentials, upload or promotion.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
export const SOURCE_SHA='3f2acbc2a3f359163f3ec0c7bd0524a88a359b92';
export const BASELINE_HASH='a0414fb5356605698b9b2539573d66b1135111f00fcc01ed545d8df125c43956';
export const sha=x=>createHash('sha256').update(x).digest('hex');
const root=new URL('../',import.meta.url);
const read=name=>{const path='member-dashboard-chat-worker/src/'+name;const source=fs.readFileSync(new URL(path,root),'utf8');assert.equal(source,execFileSync('git',['show',SOURCE_SHA+':'+path],{cwd:root,encoding:'utf8'}),'source pin drift: '+name);return source;};
const compile=text=>createRequire(import.meta.url)('../member-pages-worker/test-runtime/node_modules/esbuild/lib/main.js').transformSync(text.replace(/^export /gm,''),{target:'es2022',format:'esm'}).code.trim();
const part=(text,start,end)=>{const a=text.indexOf(start),b=text.indexOf(end,a+start.length);assert(a>=0&&b>a,'missing exact function boundary');assert.equal(text.split(start).length,2,'ambiguous function');return text.slice(a,b).trimEnd();};
export function validatePinnedEntrySource(){for(const file of ['kenji-entry-topics.mjs','kenji-reply-category-gate.mjs','kenji-category-turn.mjs'])read(file);return true;}
export function buildEntryDelta(bytes){
 assert.equal(sha(bytes),BASELINE_HASH,'baseline drift');const text=bytes.toString(),patches=[];
 const add=(id,before,after)=>{assert.equal(text.split(before).length,2,'ambiguous patch');assert.notEqual(before,after);patches.push({id,before,after,before_sha256:sha(before),after_sha256:sha(after)});};
 const prefix=text.slice(0,text.indexOf('// src/kenji-reply-category-gate.mjs'));assert(prefix.length>100&&prefix.length<2000);
 const helpers='var __kenjiEntry3073 = (() => {\n'+compile(read('kenji-entry-topics.mjs'))+'\nreturn {entryTopicCommand,entryTopicReply,entryPromotionReply};\n})();\n';
 add('isolated-entry-helpers',prefix,prefix+helpers);
 const gate=read('kenji-reply-category-gate.mjs');
 const bind=source=>source.replace(/\b(entryTopicCommand|entryTopicReply|entryPromotionReply)\(/g,'__kenjiEntry3073.$1(');
 for(const [name,next]of [['isExplicitCategoryCommand','membershipUriButton'],['withCategoryReplyGrant','approvedCategoryReply']]){
  const before=part(text,'function '+name+'(','\nfunction '+next+'(');
  const sourceEnd=name==='isExplicitCategoryCommand'?'\nexport const CATEGORY_REPLY_GRANT':'\nexport function '+next+'(';
  const after=bind(compile(part(gate,'export function '+name+'(',sourceEnd)));
  add(name,before,after);
 }
 const turn=read('kenji-category-turn.mjs');
 add('runApprovedCategoryTurn',part(text,'async function runApprovedCategoryTurn(','\n__name(runApprovedCategoryTurn'),bind(compile(part(turn,'export async function runApprovedCategoryTurn(','\nfunction transportReason('))));
 let candidate=text;for(const p of patches)candidate=candidate.replace(p.before,p.after);
 let reverse=candidate;for(const p of [...patches].reverse()){assert.equal(reverse.split(p.after).length,2);reverse=reverse.replace(p.after,p.before);}assert.equal(reverse,text,'unrelated bytes changed');
 assert(candidate.includes('owner_model_only_mode'));assert.equal(candidate.split('owner_model_only_mode').length,text.split('owner_model_only_mode').length);
 const manifest={schema:'kenji_entry_local_candidate_v1',source_sha:SOURCE_SHA,worker:'member-dashboard-chat-worker',baseline_version:'428fde80-3778-4a63-a719-5ebd85333a59',baseline_deployment:'8dfb5dca-b56a-4332-8b1d-830e14f79592',configuration_sha256:'efc3831a0343468349579f74b649bc64dd51bd798a543ed613e12e18248d4c6e',settings_sha256:'9c9ebf7825fbffbea427a63ae46722396d62dba1a7b2a831871b842749fb3ec2',main_module:'worker.js',baseline_sha256:BASELINE_HASH,candidate_sha256:sha(candidate),patches,release_ready:false};
 return {candidate:Buffer.from(candidate),manifest};
}
