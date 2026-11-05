import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
const out=new URL('./',import.meta.url).pathname;
const portableRoot=new URL('../../source/',import.meta.url).pathname,repoRoot=new URL('../../',import.meta.url).pathname;
const root=fs.existsSync(path.join(portableRoot,'admin-worker/test/runtime/fixtures/customer-checkout-runtime.mjs'))?portableRoot:repoRoot;
if(!fs.existsSync(path.join(root,'admin-worker/test/runtime/fixtures/customer-checkout-runtime.mjs')))throw Error('Local source layout missing');
const {createCheckoutRuntime}=await import(path.join(root,'admin-worker/test/runtime/fixtures/customer-checkout-runtime.mjs'));
const {REPORT_FIELDS}=await import(path.join(root,'payments-worker/session-report-projection.js'));
const map=Object.fromEntries(Object.keys(REPORT_FIELDS).map((k,i)=>[k,'fld'+String(i).padStart(14,'0')]));
const s=await createCheckoutRuntime(undefined,{reportFieldIds:map,ownerReport:true});
if((await s.send(s.body)).status!==200)throw Error('Synthetic checkout setup failed');
let down=false;const originalFetch=s.f.fetch;s.f.fetch=async req=>down?Response.json({error:'synthetic_total_outage'},{status:503}):originalFetch(req);let origin;const lab='<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ข้อมูลจำลองรายงาน</title><h1>ข้อมูลจำลองเท่านั้น</h1><form action="/__fixture/login" method="post"><button>เปิดรายงานเปอร์</button></form><form action="/__fixture/hold" method="post"><button>จำลอง HOLD</button></form><form action="/__fixture/fail" method="post"><button>จำลองอ่านเครดิตไม่ได้</button></form><form action="/__fixture/restore" method="post"><button>คืนข้อมูลปกติ</button></form></html>';
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,origin);
 if(url.pathname==='/__fixture/stats'&&req.method==='GET'){res.setHeader('content-type','application/json');return res.end(JSON.stringify({payments:s.f.rows.payments,credits:s.f.rows.credits}));}
 if(url.pathname==='/'){res.setHeader('content-type','text/html; charset=utf-8');return res.end(lab);}
 if(url.pathname.startsWith('/__fixture/')){
  if(req.method!=='POST'||req.headers.origin&&req.headers.origin!==origin){res.writeHead(403);return res.end();}
  if(url.pathname==='/__fixture/login'){
   const r=await s.dispatch('https://mmdbkk.com/internal/admin/login/session',{method:'POST',redirect:'manual',headers:{origin:'https://mmdbkk.com','content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({credential:'synthetic-owner',next:'/internal/admin/double-moment'}).toString()});
   // Local transport only: retain the real signed cookie and security attributes,
   // but scope its production Domain to the loopback preview host.
   if(r.status!==303)throw Error('Local login failed');res.writeHead(303,{'set-cookie':r.headers.getSetCookie().map(c=>c.replace(/;\s*Domain=[^;]+/gi,'')),location:'/internal/admin/double-moment'});return res.end();
  }
  if(url.pathname==='/__fixture/hold')s.f.rows.sessions[0].fields['Session Status']='Hold';
  else if(url.pathname==='/__fixture/fail')down=true;
  else if(url.pathname==='/__fixture/restore'){down=false;s.f.failCredits(false);s.f.rows.sessions[0].fields['Session Status']='confirmed';}
  else{res.writeHead(404);return res.end();}res.writeHead(303,{location:'/'});return res.end();
 }
 const chunks=[];for await(const c of req)chunks.push(c);const headers=new Headers();
 for(const [k,v]of Object.entries(req.headers))if(!['host','connection','content-length','accept-encoding'].includes(k)&&typeof v==='string')headers.set(k,v);
 if(headers.get('origin')===origin)headers.set('origin','https://mmdbkk.com');
 const r=await s.dispatch('https://mmdbkk.com'+url.pathname+url.search,{method:req.method,headers,redirect:'manual',...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
  const h=Object.fromEntries(r.headers);delete h['content-length'];delete h['content-encoding'];if(r.headers.getSetCookie)h['set-cookie']=r.headers.getSetCookie().map(c=>c.replace(/;\s*Domain=[^;]+/gi,''));if(h.location?.startsWith('https://mmdbkk.com/'))h.location=origin+h.location.slice('https://mmdbkk.com'.length);
 res.writeHead(r.status,h);res.end(Buffer.from(await r.arrayBuffer()));
 }catch{res.writeHead(503,{'content-type':'application/json'});res.end('{"ok":false,"error":"local_transport_unavailable"}');}});
server.listen(0,'127.0.0.1',()=>{origin='http://127.0.0.1:'+server.address().port;fs.writeFileSync(path.join(out,'report-outage-browser-server.json'),JSON.stringify({origin,pid:process.pid,synthetic_only:true}));console.log(origin);});
async function close(){server.close();await s.dispose();process.exit(0);}process.on('SIGTERM',close);process.on('SIGINT',close);
