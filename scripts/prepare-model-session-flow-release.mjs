import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {buildConfirmationInstallBlocks} from './build-customer-confirmation-travel.mjs';
import {buildCustomerAftercareEmbed} from './build-customer-aftercare-embed.mjs';
import {buildConsoleEmbed,buildConsoleDeclineEmbed} from './build-model-console-atelier-embed.mjs';
import {buildBundle} from './build-my-model-workspace-bundle.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
export const components=[
  {worker:'payments-worker',config:'payments-worker/wrangler.merged.toml',main:'index.session-paid-projection-wrapper.js',impact:'Canonical final-payment lifecycle field; no verification-policy or money-rule change.'},
  {worker:'events-worker',config:'events-worker/wrangler.toml',main:'src/model-eta-wrapper.js',impact:'Durable customer completion/aftercare, owner outbox, ETA and reconfirm; existing compcard/promotions share the Worker.'},
  {worker:'admin-worker',config:'admin-worker/wrangler.toml',main:'src/admin-login-hero-worker.js',impact:'Model lifecycle, owner completion/payout/manual-review and 5-minute retry; shared admin runtime requires scoped diff review.'},
  {worker:'member-pages-worker',config:'member-pages-worker/wrangler.toml',main:'src/runtime-index.js',impact:'Signed customer travel/chat authorization; existing member APIs must remain unchanged.'},
];
const sha=value=>createHash('sha256').update(value).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
function runtimeClosure(entry){
  if(!vm.SourceTextModule)throw Error('Run preparation with --experimental-vm-modules');
  const pending=[entry],seen=new Set();
  while(pending.length){
    const file=pending.pop();if(seen.has(file))continue;
    if(/^(?:mmd-redirect-worker|partners-worker|workers\/partners-worker)\//.test(file))continue;
    seen.add(file);
    if(!/\.(m?js)$/.test(file)||!fs.existsSync(path.join(root,file)))continue;
    const module=new vm.SourceTextModule(fs.readFileSync(path.join(root,file),'utf8'));
    for(const dep of module.dependencySpecifiers)if(dep.startsWith('.'))pending.push(path.posix.normalize(path.posix.join(path.posix.dirname(file),dep)));
  }
  return seen;
}
function configAt(file){
  const result=spawnSync(process.env.RELEASE_PYTHON||'python3',['-c','import json,sys,tomllib; print(json.dumps(tomllib.loads(sys.stdin.read())))'],{input:fs.readFileSync(path.join(root,file),'utf8'),encoding:'utf8'});
  if(result.status!==0)throw Error('TOML parse failed: '+file);
  return JSON.parse(result.stdout);
}
export function bindingPlan(component,baseline){
  if(!baseline||baseline.worker!==component.worker||!baseline.active_version)throw Error('Exact active baseline required');
  const names=baseline.bindings.map(b=>b.name);
  if(new Set(names).size!==names.length)throw Error('Duplicate baseline binding');
  const addition={name:'SESSION_COMPLETION_STATE',type:'r2_bucket',bucket_name:'mmd-private-model-media'};
  const existing=baseline.bindings.find(b=>b.name===addition.name);
  if(component.worker==='events-worker'&&existing&&(existing.type!==addition.type||existing.bucket_name!==addition.bucket_name))throw Error('Completion bucket conflict');
  return {
    inherit:baseline.bindings.map(({name})=>({name,type:'inherit'})),
    add:component.worker==='events-worker'&&!existing?[addition]:[],
    remove:[],rotate:[],preserve_routes:true,preserve_crons:baseline.crons,
    preserve_runtime:baseline.runtime,
    upload_authorized:false,promote_authorized:false,
  };
}
function diffFor(file){
  if(git('ls-files','--',file))return git('diff','HEAD','--',file);
  const result=spawnSync('git',['diff','--no-index','--','/dev/null',file],{cwd:root,encoding:'utf8'});
  if(result.status!==1&&result.status!==0)throw Error('Cannot capture local change: '+file);
  return result.stdout;
}
export function prepare(output){
  const baseline=JSON.parse(fs.readFileSync(path.join(root,'release/model-session-flow-local/baseline.json'),'utf8'));
  const dest=path.resolve(output);
  if(fs.existsSync(dest))throw Error('Refusing to overwrite an existing release packet');
  const dirty=execFileSync('git',['status','--porcelain','--untracked-files=all'],{cwd:root,encoding:'utf8'}).split('\n').filter(Boolean).map(line=>line.slice(3));
  const json=(file,value)=>fs.writeFileSync(path.join(dest,file),JSON.stringify(value,null,2)+'\n');
  fs.mkdirSync(dest,{recursive:true});
  const manifest={schema:'mmd_model_session_local_release_v1',status:'PREPARED_LOCAL_HOLD',generated_at:new Date().toISOString(),
    branch:git('branch','--show-current'),base_head:git('rev-parse','HEAD'),dirty_worktree:true,
    approvals:{push:false,upload:false,promote:false,deploy:false,publish:false,route_change:false,secret_change:false},
    blockers:['Admin production drift: previous 6274c7de-9c09-4e05-a074-057cfbcf61a7; refreshed baseline must be reviewed.',
      'Review exact source patches in a clean release checkout; current dirty tree is not an approved release SHA.',
      'Build and inspect each canonical entrypoint before any separately approved upload; this packet contains source patches, not compiled Worker bundles.',
      'Fresh deployed baseline and operational-settings comparison required before each Worker.',
      'Authenticated staging/E2E and external transport acceptance remain separate release gates.'],
    order:components.map(c=>c.worker).concat('webflow-install'),components:[]};
  for(const component of components){
    const config=configAt(component.config),live=baseline.workers.find(w=>w.worker===component.worker);
    if(config.name!==component.worker||config.main!==component.main)throw Error('Canonical config/entrypoint mismatch: '+component.worker);
    const plan=bindingPlan(component,live);
    if(component.worker==='events-worker'){
      const buckets=(config.r2_buckets||[]).filter(b=>b.binding==='SESSION_COMPLETION_STATE');
      if(buckets.length!==1||buckets[0].bucket_name!=='mmd-private-model-media')throw Error('Events completion binding missing or duplicated');
    }
    const folder=component.worker;fs.mkdirSync(path.join(dest,folder));
    const entry=path.posix.join(path.posix.dirname(component.config),component.main);
    const closure=runtimeClosure(entry);
    const files=dirty.filter(file=>closure.has(file)||file===component.config||file.startsWith(folder+'/')&&/\.test\.(mjs|js)$/.test(file));
    const patch=files.map(diffFor).filter(Boolean).join('\n');
    fs.writeFileSync(path.join(dest,folder,'source-changes.patch'),patch+'\n');
    const record={...component,canonical_entrypoint:entry,baseline_version:live.active_version,rollback_version:live.active_version,
      config_sha256:sha(fs.readFileSync(path.join(root,component.config))),entrypoint_sha256:sha(fs.readFileSync(path.join(root,entry))),
      patch_sha256:sha(patch+'\n'),files:files.map(file=>({path:file,sha256:sha(fs.readFileSync(path.join(root,file)))})),
      build_status:'NOT_BUILT',approval_status:'HOLD',bindings_to_inherit:plan.inherit.length,bindings_to_add:plan.add};
    json(folder+'/release.json',record);json(folder+'/binding-plan.json',plan);
    json(folder+'/config-reference.json',{path:component.config,sha256:record.config_sha256,main:component.main,
      warning:'Reference only. Do not direct-deploy the dirty checkout or a sparse config. Preserve all active bindings/settings.'});
    manifest.components.push(record);
  }
  fs.mkdirSync(path.join(dest,'webflow-install'));
  const blocks=[...buildConfirmationInstallBlocks(),{name:'customer-aftercare.embed.html',content:buildCustomerAftercareEmbed()},
    {name:'my-model-workspace.embed.html',content:buildBundle()},
    {name:'model-console-main.embed.html',content:buildConsoleEmbed()},
    {name:'model-console-decline.embed.html',content:buildConsoleDeclineEmbed()}];
  for(const block of blocks){if(Buffer.byteLength(block.content)>=50000)throw Error('Embed budget exceeded: '+block.name);fs.writeFileSync(path.join(dest,'webflow-install',block.name),block.content);}
  json('webflow-install/install.json',{publish_authorized:false,backend_e2e_required:true,
    confirmation_order:blocks.slice(0,2).map(b=>b.name),console_order:['model-console-decline.embed.html','model-console-main.embed.html'],
    existing_embed_inventory_required:true,replace_not_append_duplicate_runtimes:true,
    files:blocks.map(b=>({name:b.name,bytes:Buffer.byteLength(b.content),sha256:sha(b.content)}))});
  const uiFiles=dirty.filter(file=>file.startsWith('webflow/')||file.startsWith('shared/model-travel-client')||file.startsWith('shared/model-meeting-client')||file.startsWith('scripts/build-'));
  fs.writeFileSync(path.join(dest,'webflow-install/source-changes.patch'),uiFiles.map(diffFor).filter(Boolean).join('\n')+'\n');
  json('manifest.json',manifest);
  return {output:dest,status:manifest.status,workers:manifest.components.map(c=>({worker:c.worker,files:c.files.length,additions:c.bindings_to_add.length})),embeds:blocks.length};
}
export function verifyPacket(output){
  const dest=path.resolve(output),read=name=>JSON.parse(fs.readFileSync(path.join(dest,name),'utf8'));
  const manifest=read('manifest.json');let checked=0;
  if(manifest.status!=='PREPARED_LOCAL_HOLD'||Object.values(manifest.approvals).some(Boolean))throw Error('Unapproved release state');
  for(const component of components){
    const record=read(component.worker+'/release.json'),plan=read(component.worker+'/binding-plan.json');
    if(record.config!==component.config||record.canonical_entrypoint!==path.posix.join(path.posix.dirname(component.config),component.main))throw Error('Entrypoint drift');
    if(sha(fs.readFileSync(path.join(root,record.config)))!==record.config_sha256)throw Error('Config drift');
    if(sha(fs.readFileSync(path.join(dest,component.worker,'source-changes.patch')))!==record.patch_sha256)throw Error('Patch drift');
    for(const file of record.files){if(sha(fs.readFileSync(path.join(root,file.path)))!==file.sha256)throw Error('Source drift: '+file.path);checked++;}
    if(plan.inherit.some(b=>Object.keys(b).sort().join(',')!=='name,type'||b.type!=='inherit')||plan.remove.length||plan.rotate.length||plan.upload_authorized||plan.promote_authorized)throw Error('Unsafe binding plan');
    if(plan.add.length!==(component.worker==='events-worker'?1:0))throw Error('Unexpected binding addition');
  }
  const ui=read('webflow-install/install.json');
  if(ui.publish_authorized||ui.console_order[0]!=='model-console-decline.embed.html')throw Error('Unsafe UI install plan');
  for(const file of ui.files){const content=fs.readFileSync(path.join(dest,'webflow-install',file.name));if(content.length!==file.bytes||content.length>=50000||sha(content)!==file.sha256)throw Error('Embed drift: '+file.name);}
  return {ok:true,workers:components.length,source_hash_checks:checked,embed_checks:ui.files.length,production_mutations:0};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(!process.argv[2])throw Error('Explicit local output directory required');
  console.log(JSON.stringify(process.argv[2]==='--verify'?verifyPacket(process.argv[3]):prepare(process.argv[2]),null,2));
}
