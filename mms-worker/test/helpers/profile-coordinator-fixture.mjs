import {createHash} from 'node:crypto';
import {createMmsTherapistProfileCoordinator} from '../../src/therapist-profile-coordinator-store.mjs';
const digest = value => createHash('sha256').update(typeof value === 'string' ? value : new Uint8Array(value)).digest('hex');
export function memoryProfileNamespace(env, failure = {}) {
 const owners = new Map();
 return {
  owners,
  revision(owner) { return owners.get(owner)?.values.get('revision') || 0; },
  evict(owner) { const state = owners.get(owner); if(state) state.instance = null; },
  getByName(owner) {
   if(!owners.has(owner)) owners.set(owner,{values:new Map(),instance:null});
   const state=owners.get(owner);
   if(!state.instance) {
    const storage={async get(key){return structuredClone(state.values.get(key));},async put(key,value){
     const updates=typeof key==='string'?{[key]:value}:key;
     if(failure.journalHook) await failure.journalHook(updates,state.values);
     if(failure.journal==='before')throw Error('synthetic durable store unavailable');
     for(const [k,v] of Object.entries(updates))state.values.set(k,structuredClone(v));
     if(failure.journal==='after')throw Error('synthetic durable store acknowledgement lost');
    }};
    const Coordinator=createMmsTherapistProfileCoordinator(class{});
    state.instance=new Coordinator({storage},env);
   }
   return {fetch:request=>state.instance.fetch(request)};
  },
 };
}
export function memoryR2Object(value, metadata={}) {
 if(value===undefined)return null;
 const bytes=typeof value==='string'?new TextEncoder().encode(value):new Uint8Array(value);
 return {etag:digest(value),httpMetadata:metadata.httpMetadata,customMetadata:metadata.customMetadata,size:bytes.byteLength,body:bytes,
  async text(){return new TextDecoder().decode(bytes);},async arrayBuffer(){return bytes.slice().buffer;}};
}
export function r2ConditionMatches(before, options) {
 const only=options.onlyIf;if(!only)return true;
 if(only instanceof Headers && only.get('If-None-Match')==='*')return before===undefined;
 if(only.etagMatches!==undefined)return before!==undefined&&digest(before)===only.etagMatches;
 throw Error('Unmodelled R2 conditional option');
}
