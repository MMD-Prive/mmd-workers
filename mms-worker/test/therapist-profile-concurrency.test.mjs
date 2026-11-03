import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,IDS,key,PHOTO} from './helpers/therapist-profile-concurrency-fixture.mjs';

for (const action of ['selection','delete']) for (const winner of ['edit','photo']) {
  test(`concurrent edit versus ${action}: ${winner} wins without stale overwrite`,async t=>{
    const f=fixture(t), bucket=f.env.MMS_PRIVATE_UPLOADS;
    const get=bucket.get, put=bucket.put;
    let reads=0, releaseReads, releaseWinner;
    const bothRead=new Promise(r=>releaseReads=r), won=new Promise(r=>releaseWinner=r);
    bucket.get=async k=>{const value=await get(k);if(k===key(IDS[0])&&reads<2){if(++reads===2)releaseReads();await bothRead;}return value;};
    bucket.put=async(k,v,o)=>{if(k!==key(IDS[0]))return put(k,v,o);const edit=JSON.parse(v).intro==='Concurrent edit';if(edit!==(winner==='edit'))await won;const result=await put(k,v,o);if(edit===(winner==='edit'))releaseWinner();return result;};
    const [edit,photo]=await Promise.all([f.call('PUT',{intro:'Concurrent edit'}),action==='selection'?f.call('PUT',{photo_ids:[]},{suffix:'/photos/public'}):f.call('DELETE',undefined,{suffix:`/photos/${PHOTO}`})]);
    assert.equal(winner==='edit'?edit.status:photo.status,action==='delete'&&winner==='photo'?204:200);
    const loser=winner==='edit'?photo:edit;
    assert.equal(loser.status,409);assert.equal(loser.error.code,'PROFILE_VERSION_CONFLICT');
    const after=JSON.parse(f.objects.get(key(IDS[0])));
    if(winner==='photo') {assert.deepEqual(after.public_photo_ids,[]);if(action==='delete')assert.equal(after.photos.length,0);}
    else {assert.equal(after.intro,'Concurrent edit');assert.equal(f.objects.has(`therapist-dashboard/v1/${IDS[0]}/photos/${PHOTO}`),true);}
    const retry=await f.call('PUT',{intro:'Fresh retry'});assert.equal(retry.status,200);
    const final=JSON.parse(f.objects.get(key(IDS[0])));assert.deepEqual(final.public_photo_ids,after.public_photo_ids);assert.deepEqual(final.photos,after.photos);
  });
}
test('concurrent first writes create only one manifest',async t=>{
 const f=fixture(t);f.objects.delete(key(IDS[0]));const get=f.env.MMS_PRIVATE_UPLOADS.get;let n=0,release;const gate=new Promise(r=>release=r);
 f.env.MMS_PRIVATE_UPLOADS.get=async k=>{const v=await get(k);if(k===key(IDS[0])&&n<2){if(++n===2)release();await gate;}return v;};
 const results=await Promise.all([f.call('PUT',{intro:'First'}),f.call('PUT',{intro:'Second'})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
});
test('missing storage version fails closed',async t=>{const f=fixture(t);const get=f.env.MMS_PRIVATE_UPLOADS.get;f.env.MMS_PRIVATE_UPLOADS.get=async k=>{const v=await get(k);if(v)delete v.etag;return v;};const r=await f.call('PUT',{intro:'Do not write'});assert.equal(r.status,503);assert.equal(f.writes.length,0);});
for(const winner of ['edit','selection','delete']) test(`three simultaneous mutations: ${winner} wins`,async t=>{
 const f=fixture(t),b=f.env.MMS_PRIVATE_UPLOADS,get=b.get,put=b.put;let n=0,release,committed;const reads=new Promise(r=>release=r),done=new Promise(r=>committed=r);
 b.get=async k=>{const v=await get(k);if(k===key(IDS[0])&&n<3){if(++n===3)release();await reads;}return v;};
 b.put=async(k,v,o)=>{if(k!==key(IDS[0]))return put(k,v,o);const m=JSON.parse(v);const kind=m.intro==='Triple edit'?'edit':m.photos.length===0?'delete':'selection';if(kind!==winner)await done;const r=await put(k,v,o);if(kind===winner)committed();return r;};
 const r=await Promise.all([f.call('PUT',{intro:'Triple edit'}),f.call('PUT',{photo_ids:[]},{suffix:'/photos/public'}),f.call('DELETE',undefined,{suffix:`/photos/${PHOTO}`})]);
 assert.equal(r.filter(v=>v.status===409).length,2);assert.equal(r.filter(v=>v.status===200||v.status===204).length,1);
 const m=JSON.parse(f.objects.get(key(IDS[0])));assert.equal(m.photos.length,winner==='delete'?0:1);assert.deepEqual(m.public_photo_ids,winner==='edit'?[PHOTO]:[]);
});
test('lost write acknowledgement is uncertain, never a reported conflict',async t=>{const f=fixture(t);f.failure.put='after';const r=await f.call('PUT',{intro:'Committed but unknown'});assert.equal(r.status,503);assert.equal(r.error.code,'PROFILE_SAVE_UNCONFIRMED');assert.equal(JSON.parse(f.objects.get(key(IDS[0]))).intro,'Committed but unknown');});
