import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { renderOwnerJobEdit } from './src/owner-job-edit-page.js';

const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const response=data=>({ok:true,json:async()=>data});
const fixture=(id='A')=>({ok:true,revision:'revision-'+id,job:{session_id:'sess_'+id,client:'Client '+id,model_id:'model_'+id,model_name:'Model '+id,date:'2026-10-29',location:'Fixture',paid:1000,travel:0,model_travel:0,pricing:{client_base_amount_thb:10000,model_base_payout_thb:6000,addons:[]}}});

// A deliberately small DOM harness. Execute the actual rendered controller,
// control network completion and deadlines, and inspect visible state/POSTs.
function harness(fetcher,{session='sess_A'}={}){
  const nodes=new Map(),timers=new Map();let nextTimer=0;
  class Element{
    constructor(tag='div'){this.tagName=tag;this.children=[];this.value='';this.textContent='';this.hidden=false;this.disabled=false;this.open=false;}
    set id(value){this._id=value;nodes.set(value,this);}get id(){return this._id;}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=children;this.textContent='';}
    querySelectorAll(){return this.children.flatMap(el=>[...(['input','button'].includes(el.tagName)?[el]:[]),...el.querySelectorAll()]);}
    showModal(){this.open=true;}close(){this.open=false;}
    click(){if(!this.disabled)return this.onclick?.({preventDefault(){}});}
  }
  const html=renderOwnerJobEdit();
  for(const match of html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bid="([^"]+)"[^>]*>/g)){
    const el=new Element(match[1]);el.id=match[2];el.hidden=/\bhidden\b/.test(match[0]);
  }
  const $=id=>nodes.get(id);
  for(const [root,ids] of [['picker',['jobQuery','findJobs','jobList']],['lookup',['session']],['editor',['clientBase','modelBase','travel','modelTravel','clientAddons','modelAddons','search','searchButton','results','reason','review']]])$(root).append(...ids.map($));
  const calls=[];
  const context={document:{getElementById:$,createElement:tag=>new Element(tag)},window:{addEventListener(){}},location:{search:session?'?session_id='+session:''},URLSearchParams,AbortController,crypto:webcrypto,
    setTimeout:fn=>{const id=++nextTimer;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id),
    fetch:(url,opts)=>{calls.push({url,opts});return fetcher(url,opts);}};
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
  return {$,calls,timers,deadline:()=>{for(const fn of [...timers.values()])fn();},input:(id,value)=>{const el=$(id);el.value=value;el.oninput?.();if(['reason','clientBase'].includes(id))$('editor').oninput();},open:id=>{$('session').value='sess_'+id;$('lookup').onsubmit({preventDefault(){}});},review:()=>{$('reason').value='Fixture amendment';$('editor').onsubmit({preventDefault(){}});}};
}
const history=()=>response({ok:true,history:[]});

test('hung fetch times out, aborts, and retry restores the editor',async()=>{
  let tries=0;
  const h=harness(url=>url.includes('history=')?history():++tries===1?new Promise(()=>{}):response(fixture()));
  assert.equal(h.$('review').disabled,true);
  h.deadline();await flush();
  assert.equal(h.calls[0].opts.signal.aborted,true);
  assert.equal(h.$('loadState').hidden,true);assert.equal(h.$('retry').hidden,false);
  assert.match(h.$('message').textContent,/ลองใหม่/);
  h.$('retry').click();await flush();
  assert.equal(h.$('editor').hidden,false);assert.equal(h.$('client').textContent,'Client A');
});

test('hung JSON is also bounded and its late completion cannot reopen an old job',async()=>{
  const body=deferred();
  const h=harness(url=>url.includes('history=')?history():url.includes('sess_A')?{ok:true,json:()=>body.promise}:response(fixture('B')));
  await flush();h.deadline();await flush();h.open('B');await flush();
  body.resolve(fixture('A'));await flush();
  assert.equal(h.$('client').textContent,'Client B');assert.equal(h.$('retry').hidden,true);
});

test('switching A to B aborts A and ignores late A success',async()=>{
  const old=deferred();
  const h=harness(url=>url.includes('history=')?history():url.includes('sess_A')?old.promise:response(fixture('B')));
  h.open('B');await flush();old.resolve(response(fixture('A')));await flush();
  assert.equal(h.calls[0].opts.signal.aborted,true);
  assert.equal(h.$('client').textContent,'Client B');assert.equal(h.$('loadState').hidden,true);
});

test('late A failure cannot replace B state or expose an obsolete retry',async()=>{
  const old=deferred();
  const h=harness(url=>url.includes('history=')?history():url.includes('sess_A')?old.promise:response(fixture('B')));
  h.open('B');await flush();old.reject(Error('old failure'));await flush();
  assert.equal(h.$('message').textContent,'');assert.equal(h.$('retry').hidden,true);
});

test('editing the session input hides the previous job before a new lookup',async()=>{
  const h=harness(url=>url.includes('history=')?history():response(fixture()));await flush();
  h.input('session','sess_B');h.review();
  assert.equal(h.$('editor').hidden,true);assert.equal(h.$('confirm').open,false);
});

test('model query edits invalidate both in-flight responses and detached choices',async()=>{
  const old=deferred();let searches=0;
  const h=harness(url=>url.includes('history=')?history():url.includes('/models?')?(++searches===1?response({ok:true,models:[{id:'old',name:'Old'}]}):old.promise):response(fixture()));await flush();
  h.input('search','Old');h.$('searchButton').click();await flush();
  const detached=h.$('results').children[0];
  h.input('search','New');detached.click();assert.equal(h.$('modelName').textContent,'Model A');
  h.$('searchButton').click();h.input('search','Newest');old.resolve(response({ok:true,models:[{id:'late',name:'Late'}]}));await flush();
  assert.equal(h.$('results').children.length,0);assert.equal(h.$('modelName').textContent,'Model A');
});

test('opening another job invalidates model search and old history',async()=>{
  const oldModels=deferred(),oldHistory=deferred();
  const h=harness(url=>url.includes('/models?')?oldModels.promise:url.includes('sess_A')&&url.includes('history=')?oldHistory.promise:url.includes('history=')?history():response(fixture(url.includes('sess_B')?'B':'A')));await flush();
  h.input('search','Old');h.$('searchButton').click();h.open('B');await flush();
  oldModels.resolve(response({ok:true,models:[{id:'late',name:'Late'}]}));
  oldHistory.resolve(response({ok:true,pending:{request_id:'old'},history:[]}));await flush();
  assert.equal(h.$('modelName').textContent,'Model B');assert.equal(h.$('results').children.length,0);
  assert.equal(h.$('review').disabled,false);assert.equal(h.$('message').textContent,'');
});

test('job-list results from a previous query cannot replace the current list',async()=>{
  const old=deferred();
  const h=harness(url=>url.endsWith('q=')?old.promise:response({ok:true,jobs:[{session_id:'sess_B',date:'2026-10-29',client:'Client B',model:'B',amount:10000}]}),{session:''});
  h.input('jobQuery','B');h.$('findJobs').click();await flush();
  old.resolve(response({ok:true,jobs:[{session_id:'sess_A',client:'Client A'}]}));await flush();
  assert.equal(h.$('jobList').children.length,1);assert.match(h.$('jobList').children[0].textContent,/Client B/);
});

test('save timeout retains exact request and locks changes until identical retry succeeds',async()=>{
  const writes=[];let first=true;
  const h=harness((url,opts)=>{if(opts.method==='POST'){writes.push(opts.body);if(first){first=false;return new Promise(()=>{});}return response({ok:true,amount:10000,payout:6000,remaining:9000});}return url.includes('history=')?history():response(fixture());});await flush();
  h.review();h.$('save').click();h.$('save').click();
  assert.equal(writes.length,1);assert.equal(h.$('clientBase').disabled,true);
  h.deadline();await flush();assert.equal(h.$('retry').hidden,false);
  const reads=h.calls.length;h.open('B');assert.equal(h.calls.length,reads);
  h.$('retry').click();await flush();
  assert.equal(writes.length,2);assert.equal(writes[0],writes[1]);
  assert.equal(h.$('editor').hidden,true);assert.match(h.$('message').textContent,/บันทึกแล้ว/);
  assert.equal(h.$('clientBase').disabled,false);
});

test('definitive validation rejection unlocks correction instead of trapping an invalid request',async()=>{
  const h=harness((url,opts)=>opts.method==='POST'?{ok:false,json:async()=>({ok:false,error:'invalid_amount'})}:url.includes('history=')?history():response(fixture()));await flush();
  h.review();h.$('save').click();await flush();
  assert.equal(h.$('clientBase').disabled,false);assert.equal(h.$('review').disabled,false);
  assert.match(h.$('message').textContent,/ตัวเลข/);
});

test('history pending journal locks editing rather than allowing a second amendment',async()=>{
  const h=harness(url=>url.includes('history=')?response({ok:true,history:[],pending:{request_id:'pending'}}):response(fixture()));await flush();
  assert.equal(h.$('review').disabled,true);assert.equal(h.$('clientBase').disabled,true);
  assert.match(h.$('message').textContent,/บันทึกค้าง/);
});

test('successful final save sends the selected model and separated totals',async()=>{
  let body;
  const h=harness((url,opts)=>{if(opts.method==='POST'){body=JSON.parse(opts.body);return response({ok:true,amount:23000,payout:14000,remaining:22000});}if(url.includes('/models?'))return response({ok:true,models:[{id:'new',name:'Mek'}]});return url.includes('history=')?history():response(fixture());});await flush();
  h.input('search','Mek');h.$('searchButton').click();await flush();h.$('results').children[0].click();
  h.input('clientBase','20000');h.input('modelBase','12000');h.$('c_mk').value='3000';h.$('m_mk').value='2000';h.review();
  assert.match(h.$('confirmText').textContent,/23,000/);assert.equal(body,undefined);
  h.$('save').click();await flush();
  assert.equal(body.model_id,'new');assert.equal(body.client_base,20000);assert.equal(body.model_base,12000);
  assert.equal(body.addons[0].model_payout_thb,2000);assert.match(h.$('message').textContent,/บันทึกแล้ว/);
});

test('old request finalization cannot clear loading for the newer pending job',async()=>{
  const a=deferred(),b=deferred();
  const h=harness(url=>url.includes('history=')?history():url.includes('sess_A')?a.promise:b.promise);
  h.open('B');a.resolve(response(fixture()));await flush();
  assert.equal(h.$('loadState').hidden,false);assert.equal(h.$('review').disabled,true);
  b.resolve(response(fixture('B')));await flush();
  assert.equal(h.$('loadState').hidden,true);assert.equal(h.$('client').textContent,'Client B');
});

test('model search timeout exposes retry without discarding the chosen model',async()=>{
  let searches=0;
  const h=harness(url=>url.includes('history=')?history():url.includes('/models?')?(++searches===1?new Promise(()=>{}):response({ok:true,models:[{id:'new',name:'New'}]})):response(fixture()));await flush();
  h.input('search','New');h.$('searchButton').click();h.deadline();await flush();
  assert.equal(h.$('modelName').textContent,'Model A');assert.equal(h.$('retry').hidden,false);
  h.$('retry').click();await flush();h.$('results').children[0].click();
  assert.equal(h.$('modelName').textContent,'New');
});

test('save body timeout preserves its idempotency key and ignores late success',async()=>{
  const body=deferred(),writes=[];
  const h=harness((url,opts)=>{if(opts.method==='POST'){writes.push(opts.body);return writes.length===1?{ok:true,json:()=>body.promise}:response({ok:true,amount:10000,payout:6000,remaining:9000});}return url.includes('history=')?history():response(fixture());});await flush();
  h.review();h.$('save').click();await flush();h.deadline();await flush();
  body.resolve({ok:true,amount:999,payout:1,remaining:0});await flush();
  assert.doesNotMatch(h.$('message').textContent,/บันทึกแล้ว/);assert.equal(h.$('clientBase').disabled,true);
  h.$('retry').click();await flush();assert.equal(writes[0],writes[1]);assert.match(h.$('message').textContent,/10,000/);
});

test('unreadable or expired-session responses release loading and offer a retry',async()=>{
  for(const result of [{ok:false,json:async()=>({ok:false,error:'unauthorized'})},{ok:true,json:async()=>{throw new SyntaxError('bad JSON');}}]){
    const h=harness(()=>result);await flush();
    assert.equal(h.$('loadState').hidden,true);assert.equal(h.$('editor').hidden,true);
    assert.equal(h.$('retry').hidden,false);assert.doesNotMatch(h.$('message').textContent,/bad JSON/);
  }
});
