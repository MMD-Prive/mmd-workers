// Synthetic test fixture. Never installed as an API route or production env.
export function privateMediaFixture() {
  const lineUserId = `U${"a".repeat(32)}`;
  const fields = { media_id: "media_example", Model: ["recModel"], media_type: "flash_preview", file_type: "image/png", file_size_bytes: 8, private_original_key: "private-model-media/recModel/media_example.png", r2_bucket: "mmd-private-model-media", review_status: "approved", private_safe: true };
  const asset = { id: "recMedia", fields };
  const grant = { id: "recGrant", fields: { grant_id: "grant_example", Client: ["recClient"], Model: ["recModel"], "Media Asset": ["recMedia"], grant_status: "active", expires_at: new Date(Date.now() + 60_000).toISOString(), view_count: 0, view_limit: 1, payload_json: JSON.stringify({preview_kind:"private_pic"}) } };
  const object = { size:8, httpMetadata:{contentType:"image/png"}, customMetadata:{media_id:"media_example",model_record_id:"recModel",sha256:"a".repeat(64)} };
  const storage = new Map(); let queue = Promise.resolve();
  const state = { storage: {
    get: async key => storage.get(key),
    transaction: fn => { const task = queue.then(() => fn({ get:async key=>storage.get(key), put:async(key,value)=>storage.set(key,value) })); queue = task.catch(()=>{}); return task; },
  } };
  const fixture = { lineUserId, asset, grant, object, state, storage, gateFailure:0, registryFailure:false, logFailure:false, auditFailure:false, audits:[], writes:[], objects:new Map() };
  fixture.env = {
    AIRTABLE_API_KEY:"synthetic",AIRTABLE_BASE_ID:"appTest",LIFF_SESSION_SECRET:"s".repeat(32),
    LIFF_IDENTITY_KV:{get:async()=>({line_user_id:lineUserId,expires_at:Date.now()+60_000})},
    PRIVATE_MODEL_MEDIA:{head:async()=>object,get:async()=>({...object,body:new Uint8Array([137,80,78,71,13,10,26,10])})},
    AIRTABLE_HTTP:{fetch:async request => {
      if(fixture.registryFailure) return Response.json({}, {status:503});
      const url = new URL(request.url), table = decodeURIComponent(url.pathname.split('/')[3]), id = url.pathname.split('/')[4];
      if(table === 'tblcjjCW0pXvlhNQQ' && request.method === 'POST') {
        if(fixture.auditFailure) return Response.json({}, {status:503});
        const body=await request.json();fixture.audits.push(body.fields);return Response.json({id:'recAudit',fields:body.fields});
      }
      if(request.method === 'PATCH') {
        fixture.writes.push(await request.json());
        if(fixture.logFailure) return Response.json({}, {status:503});
        return Response.json({id:'recGrant',fields:{grant_status:'consumed',view_count:1}});
      }
      if(table === 'tblVv58TCbwh5j1fS') return Response.json({records:[{id:'recClient',fields:{line_user_id:lineUserId}}]});
      if(table === 'MMD — Private Flash Preview Grants') return Response.json({records:[grant]});
      if(id === 'recMedia') return Response.json(asset);
      throw new Error('unexpected_test_request');
    }},
  };
  return fixture;
}
