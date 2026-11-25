import {test} from 'node:test';
import assert from 'node:assert/strict';
import {privateBookingQa} from './deployed/mmd-isolated-qa-staging/private-handoff/worker.mjs';

function fixture() {
  const rows=new Map();
  const handler=privateBookingQa({
    store:{
      async get(key){return rows.has(key)?{json:async()=>JSON.parse(rows.get(key))}:null},
      async put(key,value,options){
        assert.equal(options.onlyIf.etagDoesNotMatch,'*');
        if(rows.has(key))return null;
        rows.set(key,value);return {};
      },
      async list({prefix,cursor='0'}){
        const keys=[...rows.keys()].filter(key=>key.startsWith(prefix)).sort();
        const offset=Number(cursor);
        const objects=keys.slice(offset,offset+1).map(key=>({key}));
        return {objects,truncated:offset+1<keys.length,cursor:String(offset+1)};
      },
    },
    authorize: async request => ({
      member:{role:'customer',id:'qa-member',privateAllowed:true},guest:{role:'customer',id:'qa-guest',privateAllowed:false},
      other:{role:'customer',id:'qa-other',privateAllowed:true},owner:{role:'owner',id:'qa-owner'},
      mek:{role:'model',id:'qa-model-mek'},uri:{role:'model',id:'qa-model-uri'},
    })[request.headers.get('x-agent-fixture')],
  });
  const origin='https://qa.invalid';
  async function call(actor,path,body){
    const res=await handler(new Request(origin+'/qa/private-booking/'+path,{
      method:body?'POST':'GET',headers:{origin,'x-agent-fixture':actor},body:body?JSON.stringify(body):undefined,
    }));
    return {...await res.json(),httpStatus:res.status};
  }
  return {call,rows};
}
const scenarios = [
  ['mek','Mek','Premium','uri',{source:'historical_template',templateDate:'2026-09-13'}],
  ['uri','Uri','GWs19','mek',{source:'new_request',through:'Kendo'}],
];

for(const [scenario,model,group,other,details] of scenarios){
  test(scenario+' keeps one Private request and one job with scoped reads',async t=>{
    const {call,rows}=fixture();
    const input={scenario,request_id:'run-'+scenario};
    assert.equal((await call('guest','requests',input)).httpStatus,403);
    const [first,duplicate]=(await Promise.all([call('member','requests',input),call('member','requests',input)]))
      .sort((a,b)=>b.httpStatus-a.httpStatus);
    assert.deepEqual([first.httpStatus,duplicate.httpStatus],[201,200]);
    assert.deepEqual([first.created,duplicate.created],[true,false]);
    assert.equal(duplicate.booking_ref,first.booking_ref);
    assert.deepEqual(await call('member','requests',input),duplicate);
    assert.equal((await call('member','requests',{...input,scenario:other})).httpStatus,409);
    assert.equal((await call('member','requests',{...input,through:'unverified'})).httpStatus,400);
    const expectedRequest={booking_ref:first.booking_ref,client_id:'qa-member',model,group,...details};
    const clientQuery='requests?client_id=qa-member';
    assert.deepEqual(await call('owner',clientQuery),{requests:[expectedRequest],httpStatus:200});
    assert.deepEqual(await call('owner','requests?client_id=qa-other'),{requests:[],httpStatus:200});
    assert.equal((await call('owner','requests')).httpStatus,400);
    assert.equal((await call('member',clientQuery)).httpStatus,403);
    assert.equal((await call('missing',clientQuery)).httpStatus,401);
    const payload={client_id:'qa-member',booking_ref:first.booking_ref};
    assert.equal((await call('member','create-job',payload)).httpStatus,403);
    assert.equal((await call('owner','create-job',{...payload,client_id:'qa-other'})).httpStatus,404);
    assert.deepEqual(await call(scenario,'model-jobs'),{jobs:[],httpStatus:200});
    assert.deepEqual(await call('member','my-jobs'),{jobs:[],pending:[{booking_ref:first.booking_ref,model,group}],httpStatus:200});
    const [job,repeat]=(await Promise.all([call('owner','create-job',payload),call('owner','create-job',payload)]))
      .sort((a,b)=>b.httpStatus-a.httpStatus);
    assert.deepEqual([job.httpStatus,repeat.httpStatus],[201,200]);
    assert.deepEqual([job.created,repeat.created],[true,false]);
    assert.equal(job.session_id,repeat.session_id);
    assert.equal(job.booking_ref,first.booking_ref);
    assert.deepEqual(await call('owner','create-job',payload),repeat);
    const query='?booking_ref='+first.booking_ref;
    const expected=[{booking_ref:first.booking_ref,session_id:job.session_id,model,group,status:'offered'}];
    assert.deepEqual(await call(scenario,'model-jobs'),{jobs:expected,httpStatus:200});
    assert.deepEqual(await call('member','my-jobs'),{jobs:expected,pending:[],httpStatus:200});
    assert.deepEqual(await call(other,'model-jobs'),{jobs:[],httpStatus:200});
    assert.deepEqual(await call('other','my-jobs'),{jobs:[],pending:[],httpStatus:200});
    assert.equal((await call('guest','my-jobs')).httpStatus,403);
    assert.equal((await call('member','model-jobs')).httpStatus,403);
    assert.equal((await call('member','my-jobs?booking_ref=')).httpStatus,400);
    assert.deepEqual((await call(scenario,'model-jobs'+query)).jobs,expected);
    assert.deepEqual((await call('member','my-jobs'+query)).jobs,expected);
    assert.deepEqual((await call(other,'model-jobs'+query)).jobs,[]);
    assert.deepEqual((await call('other','my-jobs'+query)).jobs,[]);
    const bookingKey='private-qa/v1/booking/'+first.booking_ref;
    const jobKey='private-qa/v1/job/'+first.booking_ref;
    assert.deepEqual([...rows.keys()],[bookingKey,jobKey]);
    const booking=JSON.parse(rows.get(bookingKey));
    const storedJob=JSON.parse(rows.get(jobKey));
    for(const [key,value] of Object.entries(details)) assert.equal(booking[key],value);
    assert.deepEqual(storedJob,{...booking,session_id:job.session_id,status:'offered'});
    t.diagnostic(JSON.stringify({scenario, booking_ref:booking.ref, session_id:storedJob.session_id,
      bookingRows:1, jobRows:1, requestStatuses:[201,200,200,409], createJobStatuses:[201,200,200]}));
  });
}

test('lists across R2 pages and reads the latest stored row for each authorized actor',async()=>{
  const {call,rows}=fixture();
  const membersMek=await call('member','requests',{scenario:'mek',request_id:'same-client-key'});
  const othersUri=await call('other','requests',{scenario:'uri',request_id:'same-client-key'});
  assert.notEqual(membersMek.booking_ref,othersUri.booking_ref);
  const ownerMek=await call('owner','create-job',{client_id:'qa-member',booking_ref:membersMek.booking_ref});
  const ownerUri=await call('owner','create-job',{client_id:'qa-other',booking_ref:othersUri.booking_ref});
  const key='private-qa/v1/job/'+membersMek.booking_ref;
  rows.set(key,JSON.stringify({...JSON.parse(rows.get(key)),status:'updated_fixture'}));

  assert.deepEqual((await call('owner','requests?client_id=qa-member')).requests.map(row=>row.booking_ref),[membersMek.booking_ref]);
  assert.deepEqual((await call('owner','requests?client_id=qa-other')).requests.map(row=>row.booking_ref),[othersUri.booking_ref]);
  const mek={booking_ref:membersMek.booking_ref,session_id:ownerMek.session_id,model:'Mek',group:'Premium',status:'updated_fixture'};
  const uri={booking_ref:othersUri.booking_ref,session_id:ownerUri.session_id,model:'Uri',group:'GWs19',status:'offered'};
  assert.deepEqual((await call('member','my-jobs')).jobs,[mek]);
  assert.deepEqual((await call('mek','model-jobs')).jobs,[mek]);
  assert.deepEqual((await call('other','my-jobs')).jobs,[uri]);
  assert.deepEqual((await call('uri','model-jobs')).jobs,[uri]);
});

test('Mek confirms once and both actors read the same confirmed job', async () => {
  const {call,rows}=fixture();
  const request=await call('member','requests',{scenario:'mek',request_id:'confirm-mek'});
  const booking_ref=request.booking_ref;
  const job=await call('owner','create-job',{client_id:'qa-member',booking_ref});
  const input={booking_ref};
  assert.equal((await call('uri','confirm-job',input)).httpStatus,404);
  assert.equal((await call('member','confirm-job',input)).httpStatus,403);
  const [first,repeat]=await Promise.all([call('mek','confirm-job',input),call('mek','confirm-job',input)]);
  assert.equal(first.status,'confirmed');
  assert.equal(first.session_id,job.session_id);
  assert.deepEqual(first,repeat);
  const customer=await call('member','my-jobs');
  assert.deepEqual(customer.jobs,(await call('mek','model-jobs')).jobs);
  assert.deepEqual(customer.pending,[]);
  assert.equal(customer.jobs.length,1);
  assert.equal(customer.jobs[0].status,'confirmed');
  assert.equal([...rows.keys()].filter(k=>k.includes('/job/')).length,1);
  assert.equal([...rows.keys()].filter(k=>k.includes('/confirmation/')).length,1);
});

test('existing Uri reference is private to its customer and repeat accept preserves one job', async () => {
  const {call,rows}=fixture();
  const ref='privateqa_d14f220b8e1533dd23843e34fb7068258b9ea6aa5c27019f844490ca4da0e53a';
  const job={ref,session_id:'job_'+ref,lane:'private',clientId:'qa-member',model:'Uri',modelId:'qa-model-uri',group:'GWs19',source:'new_request',through:'Kendo',status:'offered'};
  rows.set('private-qa/v1/booking/'+ref,JSON.stringify(job));
  rows.set('private-qa/v1/job/'+ref,JSON.stringify(job));
  const pendingRef='privateqa_'+'a'.repeat(64);
  rows.set('private-qa/v1/booking/'+pendingRef,JSON.stringify({...job,ref:pendingRef}));
  rows.set('private-qa/v1/confirmation/'+ref,JSON.stringify({session_id:job.session_id}));
  const before=[...rows.entries()];
  for(const suffix of ['', '?booking_ref='+ref]) {
    const owner=await call('member','my-jobs'+suffix);
    assert.equal(owner.httpStatus,200);
    assert.equal(owner.jobs.length,1);
    assert.equal(owner.jobs[0].session_id,job.session_id);
    assert.equal(owner.jobs[0].status,'confirmed');
    const other=await call('other','my-jobs'+suffix);
    assert.equal(other.httpStatus,200);
    assert.deepEqual(other.jobs,[]);
    if (!suffix) {
      assert.deepEqual(owner.pending,[{booking_ref:pendingRef,model:'Uri',group:'GWs19'}]);
      assert.deepEqual(other.pending,[]);
    }
    assert.equal((await call('guest','my-jobs'+suffix)).httpStatus,403);
  }
  assert.equal((await call('mek','confirm-job',{booking_ref:ref})).httpStatus,404);
  const [first,second]=await Promise.all([call('uri','confirm-job',{booking_ref:ref}),call('uri','confirm-job',{booking_ref:ref})]);
  assert.equal(first.httpStatus,200);
  assert.deepEqual(first,second);
  assert.equal(first.session_id,job.session_id);
  assert.equal(first.status,'confirmed');
  assert.deepEqual([...rows.entries()],before);
});
