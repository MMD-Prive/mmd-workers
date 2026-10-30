// Local artifact construction only. No network, upload, config or promotion.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {resolveEmsAlbumReturnTarget, EMS_ALBUM_PATH} from '../shared/ems-album-navigation.mjs';

export const EMS_ENTRY_BASELINE = Object.freeze({
  worker:'member-dashboard-chat-worker',
  version:'0b48f123-5ae4-4980-a6c7-049f51af3885',
  mainModule:'guide-notification-entry.js',
  sha256:'5e0fec3580b690cbe6e4e8cf0cef85b9bc071ff892a837579690a757cd842103',
  unchangedMemberVersion:'8abe849e-8a85-4b6c-b0ed-a1d8e67f2e4b',
  unchangedMemberModule:'worker.js',
  unchangedMemberSha256:'76a22ae26465a1a39daa2a9a4b0f59d53c25281562a2c3db15097a5c30398861',
});
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// A single wrapper delegates authentication, media and all non-target requests
// to the unchanged active entry. It only normalizes navigation to the existing UI.
export function wrapExistingEmsEntry(original, resolveTarget=resolveEmsAlbumReturnTarget) {
  return {...original, async fetch(request, env, ctx) {
    const url=new URL(request.url);
    if(url.pathname==='/my-mmd/albums/ems'||url.pathname==='/my-mmd/albums/ems/') {
      const headers={'cache-control':'no-store'};
      if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{...headers,allow:'GET, HEAD'}});
      if(url.search)return new Response(null,{status:400,headers});
      return new Response(null,{status:307,headers:{...headers,location:'/my-mmd/ems'}});
    }
    if(!['/member/liff','/member/liff/'].includes(url.pathname)||!['GET','HEAD'].includes(request.method))return original.fetch(request,env,ctx);
    const stateValues=[...url.searchParams.getAll('liff.state'),...url.searchParams.getAll('liff_state')];
    let state=new URLSearchParams();
    if(stateValues.length===1){const value=stateValues[0];state=new URLSearchParams(value.includes('?')?value.slice(value.indexOf('?')+1):value);}
    const requested=[...url.searchParams.getAll('return_to'),...state.getAll('return_to')].includes('albums_ems')||[...url.searchParams.getAll('view'),...state.getAll('view')].includes('ems_albums');
    if(!requested)return original.fetch(request,env,ctx);
    const read=key=>{
      const a=url.searchParams.getAll(key),b=state.getAll(key);
      return a.length>1||b.length>1||a.length&&b.length&&a[0]!==b[0]?null:a[0]??b[0]??'';
    };
    const intent=read('intent'),alias=read('liff_intent'),campaign=read('campaign');
    if([intent,alias,campaign].some(x=>x===null)||intent&&alias&&intent!==alias||stateValues.length>1)return new Response(null,{status:400,headers:{'cache-control':'no-store'}});
    // Other journeys retain their original behavior even if an album hint is attached.
    if(campaign||!['','unknown','status','ems_albums'].includes(intent||alias))return original.fetch(request,env,ctx);
    const target=resolveTarget(url.searchParams,state);
    if(!target)return new Response(null,{status:400,headers:{'cache-control':'no-store'}});
    // Normalize both direct and nested hints. No account/entitlement is inferred.
    for(const params of [url.searchParams,state]){
      params.delete('return_to');params.delete('view');params.delete('album');
      params.delete('intent');params.delete('liff_intent');
    }
    url.searchParams.set('intent','status');url.searchParams.set('view','ems_albums');
    const slug=target.slice('/my-mmd/ems'.length+1);
    if(slug)url.searchParams.set('album',slug);
    url.searchParams.delete('liff.state');url.searchParams.delete('liff_state');
    if(state.toString())url.searchParams.set('liff.state','?'+state.toString());
    return original.fetch(new Request(url,request),env,ctx);
  }};
}

const EXPORT_LINE='  guide_notification_entry_default as default,';
const INSERT_AT='var guide_notification_entry_default = my_mms_customer_front_gate_entry_default;\nexport {';
export function buildExistingEmsEntryArtifact({version,mainModule,moduleNames,bytes}) {
  assert.equal(version,EMS_ENTRY_BASELINE.version,'active version drift');
  assert.equal(mainModule,EMS_ENTRY_BASELINE.mainModule,'main module drift');
  assert.deepEqual(moduleNames,[EMS_ENTRY_BASELINE.mainModule],'module inventory drift');
  assert.ok(Buffer.isBuffer(bytes));
  assert.equal(sha256(bytes),EMS_ENTRY_BASELINE.sha256,'active module bytes drift');
  const source=bytes.toString('utf8');
  assert.equal(source.split(INSERT_AT).length,2,'entry anchor drift');
  assert.equal(source.split(EXPORT_LINE).length,2,'default export anchor drift');
  const injection=`\nvar ems_existing_entry_default = (()=>{\nconst EMS_ALBUM_PATH=${JSON.stringify(EMS_ALBUM_PATH)};\n${resolveEmsAlbumReturnTarget.toString()}\nreturn (${wrapExistingEmsEntry.toString()})(guide_notification_entry_default,resolveEmsAlbumReturnTarget);\n})();\n`;
  const position=bytes.indexOf(Buffer.from(INSERT_AT))+Buffer.byteLength(INSERT_AT)-Buffer.byteLength('export {');
  const exportPosition=bytes.indexOf(Buffer.from(EXPORT_LINE));
  const edits=[{start:position,end:position,after:Buffer.from(injection)},{start:exportPosition,end:exportPosition+Buffer.byteLength(EXPORT_LINE),after:Buffer.from('  ems_existing_entry_default as default,')}];
  const parts=[];let cursor=0;
  for(const e of edits){assert.ok(e.start>=cursor);parts.push(bytes.subarray(cursor,e.start),e.after);cursor=e.end;}
  parts.push(bytes.subarray(cursor));const candidate=Buffer.concat(parts);
  // Reconstruct the input by removing ONLY these exact reviewed changes.
  const restored=candidate.toString('utf8').replace(injection,'').replace('  ems_existing_entry_default as default,',EXPORT_LINE);
  assert.ok(Buffer.from(restored).equals(bytes),'non-target bytes changed');
  return {bytes:candidate,receipt:{worker:EMS_ENTRY_BASELINE.worker,version,mainModule,baselineSha256:sha256(bytes),candidateSha256:sha256(candidate),baselineBytes:bytes.length,candidateBytes:candidate.length,changedSpans:edits.map(e=>({start:e.start,end:e.end,insertedBytes:e.after.length})),nonTargetBytesUnchanged:true,namedExportsUnchanged:true,memberPagesModuleUnchanged:true,transport:'none',productionMutation:false}};
}
