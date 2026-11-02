import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { handleMmsTherapistProfileRequest, therapistProfileErrorResponse } from '../src/therapist-profile-runtime.mjs';

// Isolated fixtures only: no production identity, credentials, network or storage.
const origin = 'https://www.mmdbkk.com';
const secret = 'isolated-fixture-session-secret-0123456789';
const ids = ['mmst_fixture_account_a', 'mmst_fixture_account_b'];
const photoIds = ['ph_aaaaaaaaaaaaaaaaaaaaaaaa', 'ph_bbbbbbbbbbbbbbbbbbbbbbbb'];
const manifestKey = id => `therapist-dashboard/v1/${id}/profile.json`;
const mac = text => createHmac('sha256', secret).update(text).digest('hex');
function cookie(index) {
  const now = Math.floor(Date.now()/1000);
  const payload = Buffer.from(JSON.stringify({v:1, role:'mms_therapist', therapist_id:ids[index], line_binding:mac('mms-therapist-line-binding-v1.fixture-line-'+index), iat:now, exp:now+600})).toString('base64url');
  return '__Secure-mms_therapist_session=v1.'+payload+'.'+mac('mms-therapist-session-v1.'+payload);
}
function fixture() {
  const objects = new Map();
  const writes = [];
  const records = ids.map((id,i)=>({id:'recFixtureAccount'+i,fields:{'Therapist ID':id,'Display Name':'TEST ONLY '+i,Status:'Active','Therapist Auth Status':'Active','LINE Subject Hash':'fixture-line-'+i,'Availability Status':'Unavailable','Matching Enabled':false,'Public Profile Status':'Hidden'}}));
  ids.forEach((id,i)=>objects.set(manifestKey(id),JSON.stringify({version:1,intro:'owner '+i,profile_visibility:'hidden',courses:[],photos:[{id:photoIds[i],key:`fixture-photo-${i}`,content_type:'image/png'}],public_photo_ids:[]})));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input,init={})=>{
    const url = new URL(String(input));
    assert.equal(url.hostname,'api.airtable.com');
    if (init.method === 'PATCH') {
      const record = records.find(r=>url.pathname.endsWith('/'+r.id));
      assert.ok(record);
      const fields = JSON.parse(init.body).fields;
      writes.push(record.id);
      Object.assign(record.fields,fields);
      return Response.json(record);
    }
    const formula = url.searchParams.get('filterByFormula')||'';
    const selected = records.filter(r=>formula.includes(r.fields['Therapist ID']));
    return Response.json({records:selected});
  };
  const env = {MMS_THERAPIST_AUTH_ENABLED:'true',MMS_THERAPIST_SESSION_SECRET:secret,AIRTABLE_API_TOKEN:'fixture-only',AIRTABLE_BASE_ID:'appFixtureOnly000',AIRTABLE_THERAPISTS_TABLE_ID:'tblFixtureOnly000',ALLOWED_ORIGINS:origin,MMS_PRIVATE_UPLOADS:{
    async get(key) { const value=objects.get(key); return value===undefined?null:{async text(){return value;}}; },
    async put(key,value){writes.push(key);objects.set(key,value);},
    async delete(key){writes.push(key);objects.delete(key);}
  }};
  async function call(actor,method,suffix='',body) {
    const request = new Request(origin+'/male-massage/therapists/api/auth/profile'+suffix,{method,headers:{Origin:origin,Cookie:cookie(actor),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    try{return await handleMmsTherapistProfileRequest(request,env);}catch(error){return therapistProfileErrorResponse(error,request,env);}
  }
  return {env,objects,writes,records,call,restore(){globalThis.fetch=originalFetch;}};
}



import { deflateSync } from 'node:zlib';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGOUjLJhYGBgYgADAAg7ALMQk86oAAAAAElFTkSuQmCC','base64');
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDgqKKKzPEP/9k=','base64');
const WEBP = Buffer.from('UklGRjAAAABXRUJQVlA4ICQAAABwAQCdASoCAAIAAUAmJZgCdAF1AAD+9bf6v/+Fa/la/lat8AA=','base64');

function pngChunk(type,data) {
 const raw=Buffer.concat([Buffer.from(type),data]);
 let crc=0xffffffff;
 for(const b of raw){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
 const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);raw.copy(out,4);out.writeUInt32BE((crc^0xffffffff)>>>0,out.length-4);return out;
}
function pngWithRaster(raster,width=2,height=2,interlace=0) {
 const h=Buffer.from(PNG.subarray(16,29));h.writeUInt32BE(width,0);h.writeUInt32BE(height,4);h[12]=interlace;
 return Buffer.concat([PNG.subarray(0,8),pngChunk('IHDR',h),pngChunk('IDAT',deflateSync(raster)),pngChunk('IEND',Buffer.alloc(0))]);
}
async function upload(f,body,type='image/png',length) {
 const request=new Request(origin+'/male-massage/therapists/api/auth/profile/photos',{method:'POST',headers:{Origin:origin,Cookie:cookie(0),'Content-Type':type,'X-File-Name':'test-only.png',...(length===undefined?{}:{'Content-Length':String(length)})},body});
 try{return await handleMmsTherapistProfileRequest(request,f.env);}
 catch(e){return therapistProfileErrorResponse(e,request,f.env);}
}
const badCrc=Buffer.from(PNG);badCrc[29]^=1;
const badDeflate=Buffer.concat([PNG.subarray(0,33),pngChunk('IDAT',Buffer.from('not compressed pixels')),pngChunk('IEND',Buffer.alloc(0))]);
const cases=[
 ['PNG expands past its declared raster',pngWithRaster(Buffer.alloc(1000000)),'image/png',undefined,415,'PHOTO_CONTENT_INVALID'],
 ['PNG with excess row data',pngWithRaster(Buffer.alloc(15)),'image/png',undefined,415,'PHOTO_CONTENT_INVALID'],
 ['text called PNG',Buffer.from('NOT AN IMAGE'),'image/png',undefined,415,'PHOTO_CONTENT_INVALID'],
 ['HTML called PNG',Buffer.from('<script>alert(1)</script>'),'image/png',undefined,415,'PHOTO_CONTENT_INVALID'],
 ['PNG signature only',PNG.subarray(0,8),'image/png',undefined,415,'PHOTO_CONTENT_INVALID'],
 ['truncated PNG',PNG.subarray(0,PNG.length-2),'image/png',undefined,415,'PHOTO_CONTENT_INVALID'],
 ['bad PNG checksum',badCrc,'image/png',undefined,415,'PHOTO_CONTENT_INVALID'],
 ['invalid compressed PNG data',badDeflate,'image/png',undefined,415,'PHOTO_CONTENT_INVALID'],
 ['PNG with no pixel rows',pngWithRaster(Buffer.alloc(0)),'image/png',undefined,415,'PHOTO_CONTENT_INVALID'],
 ['invalid row filter',pngWithRaster(Buffer.from([5,0,0,0,0,0,0,0,0,0,0,0,0,0])),'image/png',undefined,415,'PHOTO_CONTENT_INVALID'],
 ['oversized decoded PNG',pngWithRaster(Buffer.alloc(0),100000,100000),'image/png',undefined,415,'PHOTO_CONTENT_INVALID'],
 ['PNG trailing payload',Buffer.concat([PNG,Buffer.from('<html>')]),'image/png',undefined,415,'PHOTO_CONTENT_INVALID'],
 ['PNG served as JPEG',PNG,'image/jpeg',undefined,415,'PHOTO_CONTENT_INVALID'],
 ['JPEG served as PNG',JPEG,'image/png',undefined,415,'PHOTO_CONTENT_INVALID'],
 ['WebP served as PNG',WEBP,'image/png',undefined,415,'PHOTO_CONTENT_INVALID'],
 ['text called JPEG',Buffer.from('fake'),'image/jpeg',undefined,415,'PHOTO_CONTENT_INVALID'],
 ['text called WebP',Buffer.from('fake'),'image/webp',undefined,415,'PHOTO_CONTENT_INVALID'],
 ['unsupported MIME',PNG,'text/plain',undefined,415,'PHOTO_TYPE_NOT_ALLOWED'],
 ['empty image',Buffer.alloc(0),'image/png',undefined,400,'PHOTO_EMPTY'],
 ['declared size over limit',PNG,'image/png',10485761,413,'PHOTO_TOO_LARGE'],
 ['actual size over limit',Buffer.alloc(10485761),'image/png',undefined,413,'PHOTO_TOO_LARGE'],
 ['actual size despite false length',Buffer.alloc(10485761),'image/png',1,413,'PHOTO_TOO_LARGE'],
];
for(const [name,body,type,length,status,code] of cases) test(name,async()=>{
 const f=fixture();
 try{
  const before=JSON.stringify([...f.objects]);
  const r=await upload(f,body,type,length);
  assert.equal(r.status,status);
  assert.equal((await r.json()).error.code,code);
  assert.deepEqual(f.writes,[],'invalid content must be rejected before any storage/Airtable write');
  assert.equal(JSON.stringify([...f.objects]),before);
 }finally{f.restore();}
});
for(const [name,body,type] of [['PNG',PNG,'image/png'],['JPEG',JPEG,'image/jpeg'],['WebP',WEBP,'image/webp']]) test('valid '+name+' still uploads privately',async()=>{
 const f=fixture();
 try{
  const peerBefore=f.objects.get(manifestKey(ids[1]));
  const r=await upload(f,body,type);
  assert.equal(r.status,201);
  const d=(await r.json()).data;
  assert.equal(d.content_type,type);
  assert.equal(d.public_url,null);
  const own=JSON.parse(f.objects.get(manifestKey(ids[0])));
  assert.equal(own.photos.length,2);
  assert.equal(own.profile_visibility,'hidden');
  assert.deepEqual(own.public_photo_ids,[]);
  assert.equal(f.objects.get(manifestKey(ids[1])),peerBefore);
  assert.equal(f.records[0].fields['Availability Status'],'Unavailable');
  assert.equal(f.records[0].fields['Matching Enabled'],false);
 }finally{f.restore();}
});

import { isTherapistPhotoContent } from '../src/therapist-photo-content.mjs';
test('accepts grayscale PNG',()=>assert.equal(isTherapistPhotoContent(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAAAAABX3VL4AAAADklEQVR4nGMMYGBiYAAAAaIAVBelrcoAAAAASUVORK5CYII=','base64'),'image/png'),true));
test('accepts indexed PNG',()=>assert.equal(isTherapistPhotoContent(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACAQMAAABIeJ9nAAAAA1BMVEUAAACnej3aAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC','base64'),'image/png'),true));
test('accepts RGBA PNG',()=>assert.equal(isTherapistPhotoContent(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGMUsdFYwMDAwMAEIkAYABBiARz/DEwcAAAAAElFTkSuQmCC','base64'),'image/png'),true));
test('accepts progressive JPEG',()=>assert.equal(isTherapistPhotoContent(Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wgARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAVAQEBAAAAAAAAAAAAAAAAAAACBP/aAAwDAQACEAMQAAABlgZ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAL/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=','base64'),'image/jpeg'),true));
test('accepts lossless WebP',()=>assert.equal(isTherapistPhotoContent(Buffer.from('UklGRh4AAABXRUJQVlA4TBEAAAAvAUAAAAdQnlIUpf+BiOh/AAA=','base64'),'image/webp'),true));
test('accepts animated WebP',()=>assert.equal(isTherapistPhotoContent(Buffer.from('UklGRqoAAABXRUJQVlA4WAoAAAACAAAAAQAAAQAAQU5JTQYAAAAAAAAAAABBTk1GOgAAAAAAAAAAAAEAAAEAAGQAAAJWUDggIgAAADABAJ0BKgIAAgABQCYlAABuAAD++aju97v/6Fesvvo0AABBTk1GPAAAAAAAAAAAAAEAAAEAAGQAAABWUDggJAAAAFQBAJ0BKgIAAgAAACYloAAEYYAA/vKpf//5gn/v9/3+7igAAA==','base64'),'image/webp'),true));

test('accepts Adam7 interlaced PNG rows',()=>assert.equal(isTherapistPhotoContent(pngWithRaster(Buffer.alloc(15),2,2,1),'image/png'),true));
